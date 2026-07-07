// ─── GGAI Public API (설계 문서 §2.2, §7.2) ───

import type GGAICorePlugin from "./main.ts";
import type {
  ChatRequest,
  ChatResponse,
  ChatEvent,
  TextRequest,
  TextResponse,
  ImageRequest,
  ImageResponse,
  TTSRequest,
  TTSResponse,
  STTRequest,
  STTResponse,
  GenerateRequest,
  GenerateResponse,
} from "./types/chat.ts";
import type { AgentRequest, AgentEvent } from "./types/agent.ts";
import type { ToolDef } from "./types/tool.ts";
import type { ProfileKind, PublicProfile, ProviderKind } from "./types/profile.ts";
import { toPublicProfile } from "./types/profile.ts";
import { countTokens as countTokensImpl } from "./tokens/counter.ts";
import type { CountTokensInput, CountTokensOptions } from "./tokens/counter.ts";
import type { ErrorLogEntry } from "./services/error-log.ts";

/** 로그 목록용 요약 — body/response 원문은 포함하지 않는다 (토큰 절약). */
export interface RequestLogSummary {
  id: string;
  createdAt: number;
  profileName: string;
  provider: string;
  model: string;
  transport: string;
  phase: "request" | "response" | "error";
  status?: number;
  error?: string;
  /** body/response를 JSON 문자열화했을 때의 길이. 원문이 필요한지 판단용 */
  bodyChars: number;
  responseChars: number;
}

export interface GGAIApi {
  version: string;

  listProfiles(kind?: ProfileKind): PublicProfile[];
  getProfile(id: string): PublicProfile | null;

  /**
   * chat/text 프로필을 구분 없이 쓰는 단순 텍스트 생성.
   * profileId 생략 시 isDefault인 chat 또는 text 프로필이 자동 선택됨.
   * 내부에서 프로필 kind를 보고 chat → messages 래핑, text → 그대로 전달.
   */
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  chat(req: ChatRequest): Promise<ChatResponse>;
  chatStream(req: ChatRequest): AsyncIterable<ChatEvent>;
  text(req: TextRequest): Promise<TextResponse>;
  image(req: ImageRequest): Promise<ImageResponse>;
  tts(req: TTSRequest): Promise<TTSResponse>;
  stt(req: STTRequest): Promise<STTResponse>;

  agent(req: AgentRequest): AsyncIterable<AgentEvent>;

  registerTool(pluginId: string, tool: ToolDef): () => void;

  /**
   * 요청 로그 요약 목록 (최신순). body/response 원문 없음.
   * 원문이 필요하면 getRequestLogEntry()로 필드 단위·절단 조회.
   */
  getRequestLog(limit?: number): RequestLogSummary[];

  /**
   * 로그 한 건의 특정 필드를 절단 조회.
   * @param field   "body" | "response" | "error"
   * @param opts    maxChars 기본 1500, offset 기본 0
   * @returns 필드 문자열 (없으면 null)
   */
  getRequestLogEntry(
    id: string,
    field: "body" | "response" | "error",
    opts?: { maxChars?: number; offset?: number }
  ): { text: string; totalChars: number } | null;

  /** 에러 전용 로그 (압축 저장, 최신순). 원인 분석의 기본 진입점. */
  getErrorLog(limit?: number): ErrorLogEntry[];

  /**
   * 근사 토큰 수 계산 (동기, 네트워크 없음).
   *
   * @param input  문자열, 메시지 배열, 또는 {messages, tools, system} 객체
   * @param opts   profileId 또는 (provider, model) 중 하나로 제공자 계수 선택.
   *               아무것도 없으면 중립 계수(1.0) 사용.
   *
   * 오차: 실측 대비 평균 ±10% 내외. 컨텍스트 패킹 루프처럼
   * 고빈도 호출에 최적화된 경로.
   */
  countTokens(
    input: CountTokensInput,
    opts?: { profileId?: string } | CountTokensOptions
  ): number;

  on(event: "profiles-changed", handler: () => void): () => void;
}

export function createApi(plugin: GGAICorePlugin): GGAIApi {
  return {
    version: plugin.manifest.version,

    listProfiles: (kind) => plugin.profileStore.list(kind).map(toPublicProfile),
    getProfile: (id) => {
      const p = plugin.profileStore.get(id);
      return p ? toPublicProfile(p) : null;
    },

    generate: async (req) => {
      const profile = req.profileId
        ? plugin.profileStore.get(req.profileId)
        : plugin.profileStore.getDefaultGeneration();
      if (!profile) {
        throw new Error(
          req.profileId
            ? `프로필을 찾을 수 없습니다: ${req.profileId}`
            : "기본 생성 프로필(chat/text)이 설정되지 않았습니다"
        );
      }
      if (profile.kind === "text") {
        return plugin.generation.text({
          profileId: profile.id,
          prompt: req.prompt,
          paramsOverride: req.paramsOverride,
          signal: req.signal,
        });
      }
      // chat 프로필 → user 메시지 한 개로 래핑
      const res = await plugin.generation.chat({
        profileId: profile.id,
        messages: [{ role: "user", content: req.prompt }],
        paramsOverride: req.paramsOverride,
        signal: req.signal,
      });
      return { text: res.text, raw: res.raw };
    },

    chat: (req) => plugin.generation.chat(req),
    chatStream: (req) => plugin.generation.chatStream(req),
    text: (req) => plugin.generation.text(req),
    image: (req) => plugin.generation.image(req),
    tts: (req) => plugin.generation.tts(req),
    stt: (req) => plugin.generation.stt(req),

    agent: (req) => plugin.agentRuntime.run(req),

    registerTool: (pluginId, tool) =>
      plugin.agentRuntime.registerPersistentTool(pluginId, tool),

    getRequestLog: (limit) => {
      const rows = plugin.requestLogs.list();
      const sliced = typeof limit === "number" ? rows.slice(0, limit) : rows;
      return sliced.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        profileName: e.profileName,
        provider: e.provider,
        model: e.model,
        transport: e.transport,
        phase: e.phase,
        status: e.status,
        error: e.error,
        bodyChars: e.body ? safeStringify(e.body).length : 0,
        responseChars: e.response ? safeStringify(e.response).length : 0,
      }));
    },

    getRequestLogEntry: (id, field, opts) => {
      const entry = plugin.requestLogs.list().find((e) => e.id === id);
      if (!entry) return null;
      const raw =
        field === "error"
          ? entry.error
          : field === "body"
            ? entry.body
            : entry.response;
      if (raw === undefined || raw === null) return null;
      const text = typeof raw === "string" ? raw : safeStringify(raw);
      const offset = Math.max(0, opts?.offset ?? 0);
      const maxChars = Math.max(1, opts?.maxChars ?? 1_500);
      return { text: text.slice(offset, offset + maxChars), totalChars: text.length };
    },

    getErrorLog: (limit) => plugin.errorLogs.list(limit),

    countTokens: (input, opts) => {
      // profileId가 오면 provider/model로 해석, 아니면 직접 지정값 사용.
      let provider: ProviderKind | undefined;
      let model: string | undefined;
      if (opts && "profileId" in opts && opts.profileId) {
        const p = plugin.profileStore.get(opts.profileId);
        if (p) {
          provider = p.provider;
          model = p.model;
        }
      } else if (opts) {
        provider = (opts as CountTokensOptions).provider;
        model = (opts as CountTokensOptions).model;
      }
      return countTokensImpl(input, { provider, model });
    },

    on: (event, handler) => plugin.profileStore.on(event, handler),
  };
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
