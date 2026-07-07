// ─── GGAI Core 프로필 타입 ───

export type ProviderKind =
  | "anthropic"
  | "openai"
  | "google"
  | "openai-compatible"
  | "novelai"
  | "elevenlabs";
// 'openai-compatible' = Ollama, LM Studio, LocalAI, vLLM, LiteLLM 등
// 'novelai'   = NovelAI text completion + image generation (/ai/generate-image)
// 'elevenlabs' = ElevenLabs TTS (/v1/text-to-speech/{voice_id})

export type ProfileKind = "chat" | "text" | "image" | "voice";

export interface ModelProfileBase {
  id: string;                 // 내부 UUID
  name: string;               // 사용자 표시명
  kind: ProfileKind;
  provider: ProviderKind;
  baseUrl?: string;
  apiKeyRef: string;          // 설계상은 참조키, 실구현에서는 secrets map의 id로 사용
  model: string;
  createdAt: number;
  updatedAt: number;
}

// 게이트 가능한 샘플링 파라미터.
// - 체크된 키만 프로필 params와 plugin paramsOverride에서 살아남는다.
// - undefined인 경우 backward compat: 모두 허용 (기존 프로필 동작 보존).
// - temperature / maxTokens는 항상 허용 (게이트 대상 아님).
export interface AllowedParams {
  topK?: boolean;
  topP?: boolean;
  minP?: boolean;
}

export const GATEABLE_PARAM_KEYS = ["topK", "topP", "minP"] as const;
export type GateableParamKey = typeof GATEABLE_PARAM_KEYS[number];

export interface ChatProfile extends ModelProfileBase {
  kind: "chat";
  isDefault?: boolean;         // true면 profileId 미지정 chat 요청의 fallback 프로필
  params: {
    temperature?: number;
    topP?: number;
    topK?: number;
    minP?: number;
    maxTokens?: number;
    /** 입력(프롬프트) 토큰 상한. 초과 시 요청 전송 전 에러로 거부. undefined=제한 없음. */
    maxContextTokens?: number;
    stopSequences?: string[];
    /** 추론 레벨. 서비스별 유효 값은 data/provider-params.ts의 ReasoningSupport 참조.
     *  전송 시 해당 서비스의 유효 목록으로 자동 보정(clamp)된다. */
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "max" | "xhigh";
    thinkingBudget?: number;
    /**
     * 사고(thinking/reasoning) 명시적 비활성화.
     * provider별 해석:
     *  - anthropic: thinking = { type: "disabled" } 전송
     *  - openai / openai-compatible: 감지된 서비스별 끄기 파라미터 전송
     *    (data/provider-params.ts ReasoningSupport 참조. 끄기 미지원 서비스는
     *     최저 레벨로 대체하거나 파라미터를 생략해 400을 방지)
     *  - google: thinkingConfig.thinkingBudget = 0 전송
     */
    thinkingDisabled?: boolean;
  };
  /** 외부 플러그인 paramsOverride에서 어떤 샘플링 파라미터를 허용할지. undefined=all allowed (legacy). */
  allowedParams?: AllowedParams;
  supports: {
    tools: boolean;
    vision: boolean;
    streaming: boolean;
    systemPrompt: boolean;
  };
  streamingEnabled?: boolean;  // 사용자 설정: true면 chatStream 사용, false면 비스트리밍 경로
}

// NovelAI 전용 text completion 프로필.
// (상용 OpenAI /completions 는 대부분 deprecated — text completion 카테고리는 NAI로 축소)
export interface TextProfile extends ModelProfileBase {
  kind: "text";
  provider: "novelai";
  isDefault?: boolean;         // true면 profileId 미지정 text 요청의 fallback 프로필
  params: {
    temperature?: number;
    maxTokens?: number;
    /** 입력(프롬프트) 토큰 상한. 초과 시 요청 전송 전 에러로 거부. undefined=제한 없음. */
    maxContextTokens?: number;
    topP?: number;
    topK?: number;
    minP?: number;
    stopSequences?: string[];
  };
  allowedParams?: AllowedParams;
}

// NovelAI v4.5 기준 이미지 생성 파라미터.
// 공식 body 구조: { input, model, action: "generate", parameters: {...} }
// v3 전용(sm, sm_dyn, ucPreset, qualityToggle, legacy, action)은 제거.
// v4.5 핵심: v4_prompt / v4_negative_prompt 객체 구조로 전송.
export interface ImageProfile extends ModelProfileBase {
  kind: "image";
  provider: "novelai";
  isDefault?: boolean;         // true면 profileId 미지정 image 요청의 fallback 프로필
  params: {
    // ── 해상도 ──
    width?: number;
    height?: number;
    // ── 샘플링 ──
    scale?: number;              // prompt guidance (CFG)
    sampler?: string;            // k_euler_ancestral 외
    steps?: number;
    nSamples?: number;
    seed?: number;
    noiseSchedule?: "karras" | "native" | "exponential" | "polyexponential";
    // ── CFG ──
    cfgRescale?: number;
    uncondScale?: number;
    skipCfgAboveSigma?: number | null;
    skipCfgBelowSigma?: number;
    // ── Dynamic Thresholding ──
    dynamicThresholding?: boolean;
    dynamicThresholdingPercentile?: number;
    dynamicThresholdingMimicScale?: number;
    // ── Prompt ──
    /** 메인 프롬프트(v4_prompt.base_caption). 요청에 prompt가 비어 있을 때 fallback으로 사용. */
    prompt?: string;
    negativePrompt?: string;
    // ── v4 prompt 플래그 ──
    useOrder?: boolean;
    // ── 고급 ──
    controlnetStrength?: number;
    preferBrownian?: boolean;
    cfgSchedEligibility?: string;
    deliberateEulerAncestralBug?: boolean;
    explikeFineDetail?: boolean;
    minimizeSigmaInf?: boolean;
    uncondPerVibe?: boolean;
    wonkyVibeCorrelation?: boolean;
  };
}

export interface VoiceProfile extends ModelProfileBase {
  kind: "voice";
  provider: "elevenlabs";
  subKind: "tts";
  params: {
    voice?: string;              // voice_id (ElevenLabs)
    format?: string;             // output_format (예: mp3_44100_128, pcm_16000)
    stability?: number;          // 0~1
    similarityBoost?: number;    // 0~1
    style?: number;              // 0~1
    useSpeakerBoost?: boolean;
    language?: string;           // 일부 모델에서 사용
  };
}

export type GGAIModelProfile = ChatProfile | TextProfile | ImageProfile | VoiceProfile;

// 외부 플러그인에 노출하는 뷰 (apiKeyRef 제거)
export type PublicProfile = Omit<GGAIModelProfile, "apiKeyRef">;

export function toPublicProfile(p: GGAIModelProfile): PublicProfile {
  const copy: Record<string, unknown> = { ...(p as unknown as Record<string, unknown>) };
  delete copy.apiKeyRef;
  return copy as unknown as PublicProfile;
}
