// ─── NovelAI Adapter ───
// text: text.novelai.net/oa/v1/completions (OpenAI 호환)
// image: image.novelai.net/ai/generate-image (ZIP 응답에서 PNG 추출)

import { requestUrl } from "obsidian";
import { requestUrlAbortable } from "../util/request.ts";
import type { ProviderAdapter, ResolvedCall } from "./base.ts";
import type {
  ImageRequest,
  ImageResponse,
  TextRequest,
  TextResponse,
} from "../types/chat.ts";
import type {
  GGAIModelProfile,
  ImageProfile,
  ProviderKind,
  TextProfile,
} from "../types/profile.ts";

const NAI_TEXT_BASE = "https://text.novelai.net/oa/v1";
const NAI_IMAGE_BASE = "https://image.novelai.net";

export class NovelAIAdapter implements ProviderAdapter {
  kind: ProviderKind = "novelai";
  supports = { text: true, image: true };

  async text(call: ResolvedCall<TextRequest>): Promise<TextResponse> {
    const { profile, apiKey, request } = call;
    const textProfile = profile as TextProfile;
    const p = textProfile.params ?? {};
    const url = (profile.baseUrl?.replace(/\/+$/, "") || NAI_TEXT_BASE) + "/completions";

    // top_p/top_k/min_p는 allowedParams 게이트를 통과한 경우에만 포함된다
    // (gating은 generation-service.wrap에서 처리됨).
    const body: Record<string, unknown> = {
      model: profile.model,
      prompt: request.prompt,
      ...(p.maxTokens !== undefined ? { max_tokens: p.maxTokens } : {}),
      temperature: p.temperature ?? 1.0,
      ...(p.topP !== undefined ? { top_p: p.topP } : {}),
      ...(p.topK !== undefined ? { top_k: p.topK } : {}),
      ...(p.minP !== undefined ? { min_p: p.minP } : {}),
      ...(p.stopSequences?.length ? { stop: p.stopSequences } : {}),
      ...(request.paramsOverride ?? {}),
    };
    call.log?.({ phase: "request", transport: "text", url, body: summarizeNovelAITextBody(body) });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: call.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      call.log?.({ phase: "error", transport: "text", url, status: res.status, error: errText });
      throw new Error(`NovelAI text ${res.status}: ${errText}`);
    }

    const json = await res.json();
    const text = extractTextCompletionDelta(json?.choices?.[0]) ?? "";
    call.log?.({
      phase: "response",
      transport: "text",
      url,
      status: res.status,
      response: { text: summarizeText(text), textLen: text.length, raw: json },
    });
    return { text, raw: json };
  }

  async image(call: ResolvedCall<ImageRequest>): Promise<ImageResponse> {
    const { profile, apiKey, request } = call;
    const imageProfile = profile as ImageProfile;
    const p = imageProfile.params ?? {};
    const url =
      (imageProfile.baseUrl?.replace(/\/+$/, "") || NAI_IMAGE_BASE) +
      "/ai/generate-image";

    // 프로필에 등록된 메인 프롬프트(품질 태그 등)를 앞에, 요청 prompt(장면 프롬프트)를
    // 뒤에 이어붙인다. 한쪽만 있으면 그것만 사용.
    const basePrompt = (p.prompt ?? "").trim();
    const reqPrompt = (request.prompt ?? "").trim();
    const prompt =
      basePrompt && reqPrompt
        ? `${basePrompt}, ${reqPrompt}`
        : basePrompt || reqPrompt;
    const uc = request.negativePrompt ?? p.negativePrompt ?? "";
    const useOrder = p.useOrder ?? true;
    // use_coords는 char_captions에 좌표가 포함된 경우 자동으로 true가 됨 (현재 항상 false)
    const useCoords = false;

    // v4.5 기준 parameters 객체 — 샘플 페이로드 기반 기본값.
    const parameters: Record<string, unknown> = {
      // 해상도
      width: p.width ?? 832,
      height: p.height ?? 1216,
      // 샘플링
      scale: p.scale ?? 5.0,
      sampler: p.sampler ?? "k_euler_ancestral",
      steps: p.steps ?? 28,
      n_samples: request.n ?? p.nSamples ?? 1,
      seed: p.seed ?? Math.floor(Math.random() * 2 ** 32),
      noise_schedule: p.noiseSchedule ?? "karras",
      // CFG
      cfg_rescale: p.cfgRescale ?? 0.0,
      uncond_scale: p.uncondScale ?? 0.0,
      skip_cfg_above_sigma: p.skipCfgAboveSigma ?? null,
      skip_cfg_below_sigma: p.skipCfgBelowSigma ?? 0.0,
      // Dynamic Thresholding
      dynamic_thresholding: p.dynamicThresholding ?? false,
      dynamic_thresholding_percentile: p.dynamicThresholdingPercentile ?? 0.999,
      dynamic_thresholding_mimic_scale: p.dynamicThresholdingMimicScale ?? 10.0,
      // ControlNet / 고급
      controlnet_strength: p.controlnetStrength ?? 1.0,
      controlnet_model: null,
      prefer_brownian: p.preferBrownian ?? true,
      cfg_sched_eligibility:
        p.cfgSchedEligibility ?? "enable_for_post_summer_samplers",
      deliberate_euler_ancestral_bug: p.deliberateEulerAncestralBug ?? false,
      explike_fine_detail: p.explikeFineDetail ?? false,
      minimize_sigma_inf: p.minimizeSigmaInf ?? false,
      uncond_per_vibe: p.uncondPerVibe ?? true,
      wonky_vibe_correlation: p.wonkyVibeCorrelation ?? true,
      // 하드코딩 defaults
      legacy_v3_extend: false,
      lora_unet_weights: null,
      lora_clip_weights: null,
      reference_information_extracted_multiple: [],
      reference_strength_multiple: [],
      // Prompts
      negative_prompt: uc,
      v4_prompt: {
        caption: { base_caption: prompt, char_captions: [] },
        use_coords: useCoords,
        use_order: useOrder,
        legacy_uc: false,
      },
      v4_negative_prompt: {
        caption: { base_caption: uc, char_captions: [] },
        use_coords: false,
        use_order: false,
        legacy_uc: false,
      },
    };
    Object.assign(parameters, request.paramsOverride ?? {});

    const body = {
      input: prompt,
      model: profile.model,
      action: "generate",
      parameters,
    };

    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      throw: false,
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`NovelAI image ${res.status}: ${res.text ?? ""}`);
    }

    // 응답은 ZIP 바이너리. 내부 PNG들을 하나씩 뽑는다.
    const zipBytes = new Uint8Array(res.arrayBuffer);
    const pngs = await extractPngsFromZip(zipBytes);
    const images = pngs.map((bytes) => ({
      kind: "base64" as const,
      mediaType: "image/png",
      data: uint8ToBase64(bytes),
    }));
    return { images, raw: null };
  }

  async validate(profile: GGAIModelProfile, apiKey: string) {
    try {
      const url =
        (profile.baseUrl?.replace(/\/+$/, "") || NAI_TEXT_BASE) + "/models";
      const res = await requestUrl({
        url,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        throw: false,
      });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      return { ok: false, error: `${res.status} ${res.text ?? ""}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ── ZIP 파싱 (NAI 응답용 최소 구현) ──────────────────────────
// Local file header 시그니처 PK\x03\x04 단위로 순회.
// compression=0(stored)이면 그대로, compression=8(deflate)이면 DecompressionStream('deflate-raw') 사용.

async function extractPngsFromZip(buf: Uint8Array): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0;
  while (off + 30 <= buf.length) {
    const sig = dv.getUint32(off, true);
    if (sig !== 0x04034b50) break; // PK\x03\x04
    const bitFlag = dv.getUint16(off + 6, true);
    const method = dv.getUint16(off + 8, true);
    let compSize = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const dataStart = off + 30 + nameLen + extraLen;

    // 데이터 디스크립터 사용 시 compSize=0 가능 → 다음 시그니처까지 스캔
    if (compSize === 0 && (bitFlag & 0x08) !== 0) {
      let scan = dataStart;
      while (scan + 4 <= buf.length) {
        const s = dv.getUint32(scan, true);
        if (s === 0x08074b50 || s === 0x04034b50 || s === 0x02014b50) break;
        scan++;
      }
      compSize = scan - dataStart;
    }

    const chunk = buf.subarray(dataStart, dataStart + compSize);
    let data: Uint8Array;
    if (method === 0) {
      data = chunk;
    } else if (method === 8) {
      data = await inflateRaw(chunk);
    } else {
      off = dataStart + compSize;
      continue;
    }
    if (isPng(data)) out.push(data);
    off = dataStart + compSize;
    // 데이터 디스크립터 바이트 스킵
    if ((bitFlag & 0x08) !== 0) {
      if (dv.getUint32(off, true) === 0x08074b50) off += 16;
      else off += 12;
    }
  }
  return out;
}

function isPng(b: Uint8Array): boolean {
  return (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

function extractTextCompletionDelta(choice: unknown): string {
  if (!choice || typeof choice !== "object") return "";
  const rec = choice as Record<string, unknown>;
  for (const key of ["text", "content", "output_text"]) {
    const value = rec[key];
    if (typeof value === "string") return value;
  }
  const message = rec.message;
  if (message && typeof message === "object") {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  const delta = rec.delta;
  if (delta && typeof delta === "object") {
    const content = (delta as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  return "";
}

function summarizeNovelAITextBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    prompt:
      typeof body.prompt === "string"
        ? summarizeText(body.prompt)
        : body.prompt,
  };
}

function summarizeText(text: string): Record<string, unknown> {
  return {
    length: text.length,
    head: text.slice(0, 1200),
    tail: text.length > 1200 ? text.slice(-1200) : "",
    full: text,
  };
}

async function inflateRaw(chunk: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw" as CompressionFormat);
  const writer = ds.writable.getWriter();
  writer.write(chunk);
  writer.close();
  const reader = ds.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    parts.push(r.value);
    total += r.value.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}
