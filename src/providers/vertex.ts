// ─── Google Vertex AI Adapter ───
// Vertex AI의 Gemini API는 요청/응답 바디가 Gemini(AI Studio)와 동일하다.
// 따라서 바디 빌드·응답 정규화·SSE 처리는 google.ts의 공유 로직을 재사용하고,
// 이 어댑터는 (1) 엔드포인트 URL 형태와 (2) 인증 방식만 담당한다.
//
// 인증은 API 키 칸에 넣은 값의 형태로 자동 판별한다:
//   1) 서비스 계정 JSON (권장):
//        API 키 칸에 서비스 계정 키 파일(JSON) 전체를 붙여넣는다.
//        → JWT(RS256)를 서명해 OAuth 액세스 토큰으로 교환하고 Bearer로 인증한다.
//        → project_id는 JSON에서 읽고, 리전(location)은 baseUrl 칸에 입력(비우면 "global").
//        → 토큰은 만료 전까지 캐시하여 요청마다 재서명하지 않는다.
//   2) OAuth 액세스 토큰 (임시): baseUrl에 '/projects/...' 전체 경로를 넣고
//        API 키 칸에 `gcloud auth print-access-token` 결과를 넣는다 → Bearer 인증.
//   3) Express 모드 (API 키): baseUrl 비움 + API 키 칸에 Express API 키 → x-goog-api-key.

import { requestUrl } from "obsidian";
import type { ProviderAdapter, ResolvedCall } from "./base.ts";
import type { ChatRequest, ChatResponse, ChatEvent } from "../types/chat.ts";
import type { GGAIModelProfile } from "../types/profile.ts";
import { runGeminiChat, runGeminiChatStream } from "./google.ts";

const VERTEX_EXPRESS_BASE = "https://aiplatform.googleapis.com/v1/publishers/google/models";
const OAUTH_TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  project_id: string;
  token_uri?: string;
}

type PreparedRequest = { url: string; headers: Record<string, string> };

export class VertexAdapter implements ProviderAdapter {
  kind = "vertex" as const;
  supports = { chat: true };

  async chat(call: ResolvedCall<ChatRequest>): Promise<ChatResponse> {
    const { url, headers } = await prepareRequest(
      call.profile.baseUrl, call.profile.model, call.apiKey, "generateContent", false
    );
    return runGeminiChat(call, url, headers, "Vertex");
  }

  async *chatStream(call: ResolvedCall<ChatRequest>): AsyncIterable<ChatEvent> {
    let prep: PreparedRequest;
    try {
      prep = await prepareRequest(
        call.profile.baseUrl, call.profile.model, call.apiKey, "streamGenerateContent", true
      );
    } catch (e) {
      yield { type: "error", error: { message: `Vertex ${(e as Error).message}` } };
      return;
    }
    yield* runGeminiChatStream(call, prep.url, prep.headers, "Vertex");
  }

  async validate(profile: GGAIModelProfile, apiKey: string) {
    try {
      const { url, headers } = await prepareRequest(
        profile.baseUrl, profile.model, apiKey, "generateContent", false
      );
      const res = await requestUrl({
        url,
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
        throw: false,
      });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      return { ok: false, error: `${res.status} ${res.text ?? ""}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ── 요청 준비: 인증 형태 판별 + URL/헤더 조립 ──

async function prepareRequest(
  baseUrl: string | undefined,
  model: string,
  apiKey: string,
  method: "generateContent" | "streamGenerateContent",
  stream: boolean
): Promise<PreparedRequest> {
  const sa = tryParseServiceAccount(apiKey);
  if (sa) {
    const location = deriveLocation(baseUrl);
    const token = await getAccessToken(sa);
    return {
      url: buildEnterpriseUrl(location, sa.project_id, model, method, stream),
      headers: { authorization: `Bearer ${token}` },
    };
  }
  // 서비스 계정 JSON이 아니면 기존 경로(Express API 키 / OAuth 액세스 토큰).
  return {
    url: resolveVertexUrl(baseUrl, model, method, stream),
    headers: authHeaders(baseUrl, apiKey),
  };
}

/** API 키 칸의 값이 서비스 계정 JSON이면 파싱해 반환, 아니면 null. */
function tryParseServiceAccount(apiKey: string): ServiceAccount | null {
  const t = apiKey?.trim();
  if (!t || t[0] !== "{") return null;
  try {
    const o = JSON.parse(t) as Partial<ServiceAccount>;
    if (
      o &&
      typeof o.client_email === "string" &&
      typeof o.private_key === "string" &&
      typeof o.project_id === "string"
    ) {
      return o as ServiceAccount;
    }
  } catch {
    // JSON처럼 보였지만 파싱 실패 → 서비스 계정 아님
  }
  return null;
}

/**
 * 서비스 계정 모드의 리전(location)을 baseUrl 칸에서 유도한다.
 *  - 비어 있으면 "global"
 *  - 전체 URL 형태면 '/locations/{loc}' 구간에서 추출
 *  - 'us-central1' 같은 바 리전 문자열이면 그대로 사용
 */
function deriveLocation(baseUrl?: string): string {
  const b = baseUrl?.trim();
  if (!b) return "global";
  const m = b.match(/\/locations\/([a-z0-9-]+)/i);
  if (m) return m[1].toLowerCase();
  if (b.toLowerCase() === "global" || /^[a-z]{2,}-[a-z0-9-]+$/i.test(b)) return b.toLowerCase();
  return "global";
}

/**
 * Enterprise(프로젝트/리전) 엔드포인트 조립.
 *   global : https://aiplatform.googleapis.com/v1/projects/{P}/locations/global/publishers/google/models/{M}:{method}
 *   리전   : https://{loc}-aiplatform.googleapis.com/v1/projects/{P}/locations/{loc}/publishers/google/models/{M}:{method}
 */
function buildEnterpriseUrl(
  location: string,
  project: string,
  model: string,
  method: "generateContent" | "streamGenerateContent",
  stream: boolean
): string {
  const host =
    location === "global"
      ? "https://aiplatform.googleapis.com"
      : `https://${location}-aiplatform.googleapis.com`;
  let url = `${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:${method}`;
  if (stream) url += "?alt=sse";
  return url;
}

// ── 서비스 계정 JWT → OAuth 액세스 토큰 (만료 전까지 캐시) ──

const tokenCache = new Map<string, { token: string; exp: number }>();

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const cacheKey = `${sa.client_email}:${sa.private_key_id ?? ""}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp - 60 > now) return cached.token;

  const jwt = await createJwt(sa, now);
  const res = await requestUrl({
    url: sa.token_uri || OAUTH_TOKEN_URI,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" + encodeURIComponent(jwt),
    throw: false,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`OAuth 토큰 발급 실패 ${res.status}: ${res.text ?? ""}`);
  }
  const data = res.json as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("OAuth 응답에 access_token 없음");
  tokenCache.set(cacheKey, { token: data.access_token, exp: now + (data.expires_in ?? 3600) });
  return data.access_token;
}

async function createJwt(sa: ServiceAccount, now: number): Promise<string> {
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  const claims = b64urlJson({
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri || OAUTH_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  });
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput))
  );
  return `${signingInput}.${b64url(sig)}`;
}

// ── 인코딩/키 변환 유틸 ──

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

// ── 비-JSON 경로 (Express API 키 / OAuth 액세스 토큰) ──

/** Enterprise(프로젝트/리전) 경로 여부. baseUrl에 '/projects/'가 있으면 OAuth 토큰 인증으로 간주. */
function isEnterprise(baseUrl?: string): boolean {
  return !!baseUrl && baseUrl.includes("/projects/");
}

function authHeaders(baseUrl: string | undefined, apiKey: string): Record<string, string> {
  return isEnterprise(baseUrl)
    ? { authorization: `Bearer ${apiKey}` }
    : { "x-goog-api-key": apiKey };
}

/**
 * Vertex 엔드포인트 URL 조립 (비-JSON 경로).
 * base(끝: .../publishers/google/models) + "/{model}:{method}" [+ "?alt=sse"]
 * baseUrl이 비어 있으면 Express 모드 글로벌 엔드포인트를 사용한다.
 */
function resolveVertexUrl(
  baseUrl: string | undefined,
  model: string,
  method: "generateContent" | "streamGenerateContent",
  stream: boolean
): string {
  const base = (baseUrl?.trim() || VERTEX_EXPRESS_BASE).replace(/\/+$/, "");
  let url = `${base}/${model}:${method}`;
  if (stream) url += "?alt=sse";
  return url;
}
