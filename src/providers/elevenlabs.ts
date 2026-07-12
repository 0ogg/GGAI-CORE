// ─── ElevenLabs Adapter (TTS 전용) ───
// tts: POST /v1/text-to-speech/{voice_id}
// 보이스 목록: GET /v1/voices (fetchVoices에서 사용)

import { requestUrl } from "obsidian";
import { requestUrlAbortable } from "../util/request.ts";
import type { ProviderAdapter, ResolvedCall } from "./base.ts";
import type { STTRequest, STTResponse, TTSRequest, TTSResponse } from "../types/chat.ts";
import type { GGAIModelProfile, ProviderKind, VoiceProfile } from "../types/profile.ts";

const EL_BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsAdapter implements ProviderAdapter {
  kind: ProviderKind = "elevenlabs";
  supports = { tts: true };

  async tts(call: ResolvedCall<TTSRequest>): Promise<TTSResponse> {
    const { profile, apiKey, request } = call;
    const voiceProfile = profile as VoiceProfile;
    const p = voiceProfile.params ?? {};
    const voiceId = request.voice ?? p.voice;
    if (!voiceId) throw new Error("ElevenLabs TTS: voice_id가 필요합니다");

    const base = (profile.baseUrl?.replace(/\/+$/, "") || EL_BASE);
    const outputFormat = p.format ?? mapShortFormat(request.format);
    const url =
      `${base}/text-to-speech/${encodeURIComponent(voiceId)}` +
      (outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : "");

    const voiceSettings: Record<string, unknown> = {};
    if (p.stability !== undefined) voiceSettings.stability = p.stability;
    if (p.similarityBoost !== undefined) voiceSettings.similarity_boost = p.similarityBoost;
    if (p.style !== undefined) voiceSettings.style = p.style;
    if (p.useSpeakerBoost !== undefined) voiceSettings.use_speaker_boost = p.useSpeakerBoost;

    const body: Record<string, unknown> = {
      text: request.text,
      model_id: profile.model || "eleven_multilingual_v2",
    };
    if (Object.keys(voiceSettings).length > 0) body.voice_settings = voiceSettings;
    if (p.language) body.language_code = p.language;

    call.log?.({
      phase: "request",
      transport: "tts",
      url,
      body: { ...body, text: summarizeText(request.text ?? "") },
    });

    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": apiKey,
        accept: mediaTypeFromFormat(outputFormat),
      },
      body: JSON.stringify(body),
      throw: false,
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      call.log?.({ phase: "error", transport: "tts", url, status: res.status, error: res.text ?? "" });
      throw new Error(`ElevenLabs tts ${res.status}: ${res.text ?? ""}`);
    }
    const data = arrayBufferToBase64(res.arrayBuffer);
    call.log?.({
      phase: "response",
      transport: "tts",
      url,
      status: res.status,
      response: { mediaType: mediaTypeFromFormat(outputFormat), bytes: res.arrayBuffer.byteLength },
    });
    return {
      audio: {
        kind: "base64",
        mediaType: mediaTypeFromFormat(outputFormat),
        data,
      },
      raw: null,
    };
  }

  async stt(_call: ResolvedCall<STTRequest>): Promise<STTResponse> {
    throw new Error("ElevenLabs STT는 지원하지 않습니다 (TTS 전용)");
  }

  async validate(profile: GGAIModelProfile, apiKey: string) {
    try {
      const base = profile.baseUrl?.replace(/\/+$/, "") || EL_BASE;
      const res = await requestUrl({
        url: `${base}/voices`,
        method: "GET",
        headers: { "xi-api-key": apiKey },
        throw: false,
      });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      return { ok: false, error: `${res.status} ${res.text ?? ""}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ── 유틸 ─────────────────────────────────────────

function mapShortFormat(f?: "mp3" | "wav" | "opus"): string {
  if (f === "wav") return "pcm_22050";
  if (f === "opus") return "opus_48000_192";
  return "mp3_44100_128";
}

function mediaTypeFromFormat(f: string): string {
  if (f.startsWith("mp3")) return "audio/mpeg";
  if (f.startsWith("pcm")) return "audio/wav";
  if (f.startsWith("opus") || f.startsWith("ulaw")) return "audio/ogg";
  return "application/octet-stream";
}

function summarizeText(text: string): Record<string, unknown> {
  return {
    length: text.length,
    head: text.slice(0, 1200),
    tail: text.length > 1200 ? text.slice(-1200) : "",
    full: text,
  };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}
