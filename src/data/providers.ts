// ── Provider 타입 정의 ──

export type AuthMethod = "api_key" | "session";
export type Capability = "chat" | "completion" | "image" | "tts";

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  authType: AuthMethod;
  authHeader?: string;
  authPrefix?: string;
  authQueryParam?: string;
  extraHeaders?: Record<string, string>;
  modelsEndpoint?: string;
  modelsResponsePath?: string;
  imageBaseUrl?: string;
  imageModelId?: string;
  isOpenAICompatible: boolean;
  requiresServer: boolean;
  capabilities: Capability[];
  authDescription?: string;
  staticModels?: { id: string; name: string }[];
}

export interface ModelInfo {
  id: string;
  name: string;
  /** 모델의 최대 입력(컨텍스트) 토큰 수. 응답에 없으면 undefined.
   *  Gemini inputTokenLimit / OpenRouter·일부 OpenAI 호환 context_length에서 추출. */
  inputTokenLimit?: number;
}

export const BUILTIN_PROVIDERS: Provider[] = [
  // ─── API Key 방식 (모든 플랫폼) ───
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    authType: "api_key",
    authHeader: "x-api-key",
    extraHeaders: { "anthropic-version": "2023-06-01" },
    modelsEndpoint: "/v1/models",
    modelsResponsePath: "data",
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["chat"],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat", "completion", "image"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authType: "api_key",
    authQueryParam: "key",
    modelsEndpoint: "/models",
    modelsResponsePath: "models",
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["chat"],
  },
  {
    id: "vertex",
    name: "Google Vertex AI",
    // Express 모드 기본 엔드포인트. Enterprise는 프로필 baseUrl에 프로젝트/리전 경로를 지정한다.
    baseUrl: "https://aiplatform.googleapis.com/v1/publishers/google/models",
    authType: "api_key",
    authHeader: "x-goog-api-key",
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["chat"],
    // Vertex는 API 키로 접근 가능한 공개 모델 목록 엔드포인트가 없어 정적 목록을 제공한다.
    // (모델명은 텍스트 입력으로 직접 지정도 가능)
    staticModels: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash-Lite" },
    ],
  },
  {
    id: "novelai",
    name: "NovelAI",
    baseUrl: "https://text.novelai.net/oa/v1",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    imageBaseUrl: "https://image.novelai.net",
    imageModelId: "nai-diffusion-4-5-full",
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["completion", "image"],
    // 이미지 모델은 공식 목록 엔드포인트가 없어서 하드코딩 fallback.
    // V4+ 전용 (v4_prompt/v4_negative_prompt 구조 사용). V3 이하는 body 포맷이 달라 제외.
    staticModels: [
      { id: "nai-diffusion-4-5-full", name: "NAI Diffusion 4.5 Full" },
      { id: "nai-diffusion-4-5-curated", name: "NAI Diffusion 4.5 Curated" },
      { id: "nai-diffusion-4-full", name: "NAI Diffusion 4 Full" },
      { id: "nai-diffusion-4-curated-preview", name: "NAI Diffusion 4 Curated" },
    ],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    baseUrl: "https://api.elevenlabs.io/v1",
    authType: "api_key",
    authHeader: "xi-api-key",
    modelsEndpoint: "/models",
    // ElevenLabs의 /v1/models는 top-level 배열을 반환 (data 래퍼 없음).
    // 보이스 목록은 /v1/voices → { voices: [...] }. fetchVoices에서 별도 처리.
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["tts"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat"],
  },
  {
    id: "zai",
    name: "z.ai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat", "image"],
  },
  {
    id: "zaicoding",
    name: "z.ai Coding",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat"],
  },
];

export function getProvider(id: string): Provider | undefined {
  return BUILTIN_PROVIDERS.find((p) => p.id === id);
}
