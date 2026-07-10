// ─── Chat 요청/응답/이벤트 (설계 문서 §2.3) ───

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source:
        | { kind: "base64"; mediaType: string; data: string }
        | { kind: "url"; url: string };
    };

export interface GGAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ChatRequest {
  profileId?: string;  // 생략 시 isDefault=true인 chat 프로필이 사용됨
  messages: GGAIChatMessage[];
  tools?: ToolDefPublic[];
  toolChoice?: "auto" | "none" | "required" | { type: "tool"; name: string };
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
  /**
   * 이 요청을 유발한 기능의 표시 이름(예: "번역", "이어쓰기").
   * "생성 중" 토스트에 `라벨 (모델명)` 형태로 표시된다. 생략 시 모델명만 표시.
   */
  label?: string;
}

// ToolDef의 handler 없는 공개판 (요청 시 보낸 툴 중 어댑터는 스키마만 보면 됨)
export interface ToolDefPublic {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatResponse {
  text: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  stopReason: "end" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: { inputTokens: number; outputTokens: number };
  raw: unknown;
}

export type ChatEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call-start"; toolCallId: string; name: string }
  | { type: "tool-call-args-delta"; toolCallId: string; delta: string }
  | { type: "tool-call-end"; toolCallId: string; name: string; input: unknown }
  | { type: "done"; response: ChatResponse }
  | { type: "error"; error: { message: string; code?: string } };

// ─── Text / Image / Voice ───

export interface TextRequest {
  profileId?: string;  // 생략 시 isDefault=true인 text 프로필이 사용됨
  prompt: string;
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
  /** "생성 중" 토스트에 표시할 기능 이름. @see ChatRequest.label */
  label?: string;
}
export interface TextResponse {
  text: string;
  raw: unknown;
}

export interface ImageRequest {
  profileId?: string;  // 생략 시 isDefault=true인 image 프로필이 사용됨
  /** 장면 프롬프트. 프로필에 등록된 메인 프롬프트 뒤에 이어붙여 전송된다. */
  prompt: string;
  /** 런타임 UC 재지정. 프로필 negativePrompt 기본값보다 우선 적용됨. */
  negativePrompt?: string;
  size?: string;
  n?: number;
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
  /** "생성 중" 토스트에 표시할 기능 이름. @see ChatRequest.label */
  label?: string;
}

export interface GenerateRequest {
  /** chat 또는 text 프로필 ID. 생략 시 isDefault인 프로필 자동 선택. */
  profileId?: string;
  prompt: string;
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
  /** "생성 중" 토스트에 표시할 기능 이름. @see ChatRequest.label */
  label?: string;
}
export interface GenerateResponse {
  text: string;
  raw: unknown;
}
export interface ImageResponse {
  images: Array<{ kind: "base64"; mediaType: string; data: string } | { kind: "url"; url: string }>;
  raw: unknown;
}

export interface TTSRequest {
  profileId: string;
  text: string;
  voice?: string;
  format?: "mp3" | "wav" | "opus";
  signal?: AbortSignal;
  /** "생성 중" 토스트에 표시할 기능 이름. @see ChatRequest.label */
  label?: string;
}
export interface TTSResponse {
  audio: { kind: "base64"; mediaType: string; data: string };
  raw: unknown;
}

export interface STTRequest {
  profileId: string;
  audio: { kind: "base64"; mediaType: string; data: string };
  language?: string;
  signal?: AbortSignal;
  /** "생성 중" 토스트에 표시할 기능 이름. @see ChatRequest.label */
  label?: string;
}
export interface STTResponse {
  text: string;
  raw: unknown;
}
