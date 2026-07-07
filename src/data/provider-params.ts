// ─── 제공자별 샘플링 파라미터 지원 여부 ───
// UI에서 제공자 선택 시 allowedParams 체크박스를 자동 설정하는 데 사용.

export interface ParamSupport {
  topP: boolean;
  topK: boolean;
  minP: boolean;
}

// ProviderKind가 확정된 제공자의 알려진 지원 표
// (temperature / maxTokens는 항상 허용이므로 표에서 제외)
const KNOWN: Record<string, ParamSupport> = {
  anthropic:  { topP: true,  topK: true,  minP: false },
  openai:     { topP: true,  topK: false, minP: false },
  google:     { topP: true,  topK: true,  minP: false },
  novelai:    { topP: true,  topK: true,  minP: true  },
  elevenlabs: { topP: false, topK: false, minP: false },
};

// openai-compatible: baseUrl/model 힌트로 서비스 감지
export type CompatService =
  | "ollama"
  | "vllm"
  | "lmstudio"
  | "deepseek"
  | "kimi"
  | "zai"
  | "openrouter"
  | "nanogpt"
  | "unknown";

const COMPAT_SUPPORT: Record<CompatService, ParamSupport> = {
  ollama:     { topP: true,  topK: true,  minP: true  },
  vllm:       { topP: true,  topK: true,  minP: true  },
  lmstudio:   { topP: true,  topK: true,  minP: true  },
  deepseek:   { topP: true,  topK: false, minP: false },
  kimi:       { topP: true,  topK: false, minP: false },
  zai:        { topP: true,  topK: false, minP: false },
  openrouter: { topP: true,  topK: false, minP: false },
  // 다양한 백엔드로 라우팅되는 프록시 — 어떤 모델이 붙을지 알 수 없어 보수적으로 topP만.
  nanogpt:    { topP: true,  topK: false, minP: false },
  unknown:    { topP: true,  topK: false, minP: false },
};

export function detectCompatService(baseUrl: string, model: string = ""): CompatService {
  const url = baseUrl.toLowerCase();
  const mdl = model.toLowerCase();

  // 로컬 서버 → 포트로 구분
  const isLocal =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("0.0.0.0") ||
    url.startsWith("http://[::1]");

  if (isLocal) {
    if (url.includes(":11434")) return "ollama";   // Ollama 기본 포트
    if (url.includes(":1234"))  return "lmstudio"; // LM Studio 기본 포트
    return "vllm"; // 그 외 로컬 = vLLM / LocalAI 계열로 간주
  }

  // 클라우드 서비스 URL 패턴
  if (url.includes("deepseek") || mdl.includes("deepseek"))    return "deepseek";
  if (url.includes("moonshot") || url.includes("kimi"))        return "kimi";
  if (url.includes("z.ai"))                                    return "zai";
  if (url.includes("openrouter"))                              return "openrouter";
  if (url.includes("nano-gpt") || url.includes("nanogpt"))     return "nanogpt";

  return "unknown";
}

/** 제공자 종류 + (openai-compatible의 경우) baseUrl/model을 보고 allowedParams 기본값 반환 */
export function getProviderParamDefaults(
  provider: string,
  baseUrl: string = "",
  model: string = ""
): ParamSupport {
  if (provider !== "openai-compatible") {
    return KNOWN[provider] ?? { topP: false, topK: false, minP: false };
  }
  const svc = detectCompatService(baseUrl, model);
  return COMPAT_SUPPORT[svc];
}

// ─── 제공자/서비스별 추론(thinking/reasoning) 제어 ───
// 끄기(canDisable)와 레벨(efforts)은 서로 독립된 축이다. 한 백엔드가 둘 다,
// 하나만, 혹은 아무것도 지원하지 않을 수 있으니 각각 따로 선언한다.
// (2026-07 조사 기준) 백엔드별 파라미터:
//   OpenAI 본가: reasoning_effort (minimal~xhigh, 모델별 상이; 끄기=none, 구형은 minimal이 최저)
//   DeepSeek V4: reasoning_effort (실효 high/max — low/med→high, xhigh→max) / 끄기 thinking:{type:"disabled"}
//   OpenRouter:  reasoning: { effort: minimal~xhigh } / 끄기 { enabled: false }
//   z.ai(GLM):   GLM-4.6/4.7 = thinking:{type:"disabled"}만(레벨 없음).
//                GLM-5/5.1/5.2 = reasoning_effort "high"|"max" 추가 지원(기본값 max) — 모델명으로 분기.
//   vLLM:        모델 의존 — Qwen은 chat_template_kwargs:{enable_thinking:false}, gpt-oss는 reasoning_effort
//   Ollama:      /v1 호환 엔드포인트에서는 reasoning_effort (low/med/high, 끄기=none). think:bool은 /v1에서 무효.
//   Kimi:        thinking 네이티브 — reasoning_effort 전송 시 400(거부)
//   NanoGPT:     자체 통합 reasoning_effort (none~xhigh, OpenAI와 동일 규약) — 라우팅 대상 무관하게 정규화됨
// 요청 빌드 시 이 표만 참조한다.

// xhigh는 high와 max 사이 (OpenAI/DeepSeek/Anthropic 공통 의미) — clampEffort 거리 계산이 이 순서에 의존.
export const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffortLevel = (typeof EFFORT_ORDER)[number];

export interface ReasoningSupport {
  /** UI에 노출하고 전송을 허용할 레벨 목록. 빈 배열 = 레벨 개념 없음(on/off만) */
  efforts: ReasoningEffortLevel[];
  /** 추론 완전 끄기 지원 여부 (false면 끄기 요청 시 최저 레벨로 대체하거나 파라미터 생략) */
  canDisable: boolean;
  /** thinkingDisabled=true일 때 body에 병합할 파라미터 (canDisable=true일 때만 사용) */
  disablePayload?: Record<string, unknown>;
  /** effort 레벨을 body 파라미터로 변환 */
  effortPayload?: (effort: ReasoningEffortLevel) => Record<string, unknown>;
}

const reasoningEffortParam = (effort: ReasoningEffortLevel) => ({ reasoning_effort: effort });

const REASONING_OPENAI: ReasoningSupport = {
  // gpt-5.x는 모델별로 지원 레벨이 갈린다(신형은 minimal 폐기·none/xhigh 추가). 초집합 노출 후 clamp.
  efforts: ["minimal", "low", "medium", "high", "xhigh"],
  canDisable: true,
  disablePayload: { reasoning_effort: "none" }, // 신형(gpt-5.5+)의 표준 끄기 값
  effortPayload: reasoningEffortParam,
};

const REASONING_COMPAT: Record<CompatService, ReasoningSupport> = {
  deepseek: {
    // V4(2026-04): 서버가 low/med→high, xhigh→max로 매핑하므로 실효 레벨은 high/max뿐.
    efforts: ["high", "max"],
    canDisable: true, // V4는 thinking:{type:"disabled"}로 끄기 지원 (구 R1 시절엔 불가였음)
    disablePayload: { thinking: { type: "disabled" } },
    effortPayload: reasoningEffortParam,
  },
  openrouter: {
    // OpenRouter가 none/minimal/low/med/high/xhigh로 정규화해 각 백엔드에 전달.
    efforts: ["minimal", "low", "medium", "high", "xhigh"],
    canDisable: true,
    disablePayload: { reasoning: { enabled: false } },
    effortPayload: (effort) => ({ reasoning: { effort } }),
  },
  zai: {
    // GLM-4.6/4.7 등 레벨 미지원 모델 기본값. GLM-5 계열은 getReasoningSupport에서 REASONING_ZAI_GLM5로 대체.
    efforts: [],
    canDisable: true,
    disablePayload: { thinking: { type: "disabled" } },
  },
  vllm: {
    efforts: [],
    canDisable: true,
    disablePayload: { chat_template_kwargs: { enable_thinking: false } },
  },
  ollama: {
    // OpenAI 호환 /v1 엔드포인트 기준. think:bool은 /v1에서 무효 — reasoning_effort 사용.
    // 지원 모델(gpt-oss 등)은 low/med/high, 미지원 모델은 서버가 자동 무시.
    efforts: ["low", "medium", "high"],
    canDisable: true,
    disablePayload: { reasoning_effort: "none" },
    effortPayload: reasoningEffortParam,
  },
  // Kimi: 추론이 네이티브라 reasoning_effort를 보내면 400. 레벨/끄기 모두 전송하지 않음.
  kimi: { efforts: [], canDisable: false },
  lmstudio: { efforts: [], canDisable: false },
  // 미확인 서비스: 널리 통용되는 reasoning_effort 표준 3레벨만 허용.
  // 끄기 요청은 canDisable=false이므로 최저 레벨(low)로 대체된다 —
  // "minimal"/"none" 같은 값을 보내다 enum 검증 400을 받는 것을 방지.
  unknown: {
    efforts: ["low", "medium", "high"],
    canDisable: false,
    effortPayload: reasoningEffortParam,
  },
  // NanoGPT: 어떤 백엔드로 라우팅되든 자체 게이트웨이가 reasoning_effort를 정규화해 받아들인다.
  nanogpt: {
    efforts: ["minimal", "low", "medium", "high", "xhigh"],
    canDisable: true,
    disablePayload: { reasoning_effort: "none" },
    effortPayload: reasoningEffortParam,
  },
};

// z.ai GLM-5/5.1/5.2 계열 전용 — reasoning_effort "high"|"max" 지원(기본값 max).
// GLM-4.6/4.7 이하는 위 REASONING_COMPAT.zai(레벨 없음)를 그대로 사용.
const REASONING_ZAI_GLM5: ReasoningSupport = {
  efforts: ["high", "max"],
  canDisable: true,
  disablePayload: { thinking: { type: "disabled" } },
  effortPayload: reasoningEffortParam,
};

/** 제공자 + (openai-compatible의 경우) baseUrl/model 기준 추론 제어 능력 반환 */
export function getReasoningSupport(
  provider: string,
  baseUrl: string = "",
  model: string = ""
): ReasoningSupport {
  if (provider === "openai") return REASONING_OPENAI;
  if (provider === "openai-compatible") {
    const svc = detectCompatService(baseUrl, model);
    if (svc === "zai" && /glm-5/i.test(model)) return REASONING_ZAI_GLM5;
    return REASONING_COMPAT[svc];
  }
  return { efforts: [], canDisable: false };
}

/** effort가 유효 목록에 없으면 EFFORT_ORDER 상 가장 가까운 유효 레벨로 보정 */
export function clampEffort(
  effort: string,
  support: ReasoningSupport
): ReasoningEffortLevel | undefined {
  if (!support.efforts.length) return undefined;
  const target = EFFORT_ORDER.indexOf(effort as ReasoningEffortLevel);
  if (target === -1) return undefined;
  if (support.efforts.includes(effort as ReasoningEffortLevel)) {
    return effort as ReasoningEffortLevel;
  }
  let best = support.efforts[0];
  let bestDist = Infinity;
  for (const e of support.efforts) {
    const dist = Math.abs(EFFORT_ORDER.indexOf(e) - target);
    if (dist < bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * thinkingDisabled / reasoningEffort를 서비스에 맞는 body 파라미터로 변환.
 * - 끄기 미지원 + 레벨 지원 → 최저 레벨로 대체 (DeepSeek 등)
 * - 끄기 미지원 + 레벨도 없음 → 아무것도 보내지 않음 (400 방지)
 */
export function buildReasoningParams(
  support: ReasoningSupport,
  opts: { disabled?: boolean; effort?: string }
): Record<string, unknown> {
  if (opts.disabled) {
    if (support.canDisable && support.disablePayload) return support.disablePayload;
    if (support.efforts.length && support.effortPayload) {
      return support.effortPayload(support.efforts[0]);
    }
    return {};
  }
  if (opts.effort && support.effortPayload) {
    const clamped = clampEffort(opts.effort, support);
    if (clamped) return support.effortPayload(clamped);
  }
  return {};
}

/** openai-compatible 감지 결과를 사람이 읽을 수 있는 레이블로 반환 */
export function compatServiceLabel(svc: CompatService): string {
  const labels: Record<CompatService, string> = {
    ollama:     "Ollama",
    vllm:       "vLLM / LocalAI",
    lmstudio:   "LM Studio",
    deepseek:   "DeepSeek",
    kimi:       "Kimi (Moonshot)",
    zai:        "z.ai",
    openrouter: "OpenRouter",
    nanogpt:    "NanoGPT",
    unknown:    "unknown",
  };
  return labels[svc];
}

// UI 프로바이더 드롭다운에서 자주 쓰이는 openai-compatible 서비스를 바로 선택할 수 있게 하는 기본 엔드포인트.
// (2026-07 확인) 모두 provider="openai-compatible" + 이 baseUrl 조합으로 저장된다.
export const COMPAT_PRESET_BASE_URL: Partial<Record<CompatService, string>> = {
  deepseek:   "https://api.deepseek.com",
  openrouter: "https://openrouter.ai/api/v1",
  zai:        "https://api.z.ai/api/paas/v4",
  nanogpt:    "https://nano-gpt.com/api/v1",
};
