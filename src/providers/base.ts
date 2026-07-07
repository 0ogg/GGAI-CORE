// ─── Provider Adapter 공용 인터페이스 (설계 문서 §4.1) ───

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
} from "../types/chat.ts";
import type { GGAIModelProfile, ProviderKind } from "../types/profile.ts";

export interface RequestLogEvent {
  callId?: number | string;
  phase: "request" | "response" | "error";
  transport: "chat" | "chatStream" | "text" | "image" | "tts" | "stt";
  url?: string;
  body?: unknown;
  status?: number;
  response?: unknown;
  error?: string;
}

export interface ResolvedCall<TReq> {
  profile: GGAIModelProfile;
  apiKey: string;                    // 실제 키
  request: TReq;                     // 해결된 요청 (게이트된 paramsOverride 반영)
  signal: AbortSignal;
  log?: (event: RequestLogEvent) => void;
}

export interface ProviderAdapter {
  kind: ProviderKind;
  supports: Partial<Record<"chat" | "text" | "image" | "tts" | "stt", boolean>>;

  chat?(call: ResolvedCall<ChatRequest>): Promise<ChatResponse>;
  chatStream?(call: ResolvedCall<ChatRequest>): AsyncIterable<ChatEvent>;
  text?(call: ResolvedCall<TextRequest>): Promise<TextResponse>;
  image?(call: ResolvedCall<ImageRequest>): Promise<ImageResponse>;
  tts?(call: ResolvedCall<TTSRequest>): Promise<TTSResponse>;
  stt?(call: ResolvedCall<STTRequest>): Promise<STTResponse>;

  validate(
    profile: GGAIModelProfile,
    apiKey: string
  ): Promise<{ ok: boolean; error?: string }>;
}
