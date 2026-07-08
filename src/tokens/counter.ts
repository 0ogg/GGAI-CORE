// ─── 토큰 카운터 (휴리스틱, 동기) ───
//
// 설계 원칙:
//   - 네트워크 호출 없음. 번들 토크나이저 없음. 순수 문자열 순회.
//   - 주요 제공자(OpenAI cl100k/o200k, Anthropic, Google SentencePiece,
//     Llama/Qwen SentencePiece)는 BPE/SP 계열이라 문자 카테고리별 비율이
//     유사하게 수렴한다. 제공자 계수로 ±10% 이내 편차를 보정.
//   - 정확도보다 **속도**와 **단순함** 우선. 컨텍스트 패킹 루프
//     (한 문단씩 추가하며 예산 소진)에서 수백 번 호출되어도 문제없어야 함.
//   - 오차는 설정 UI에서 사용자에게 고지 (5~15% 편차 가능).

import type { ProviderKind } from "../types/profile.ts";
import type { GGAIChatMessage, ContentBlock, ToolDefPublic } from "../types/chat.ts";

// ─── 카테고리별 기본 비율 (문자 → 토큰) ───
// tiktoken cl100k_base 를 기준선(1.0)으로 잡고 경험적으로 튜닝한 값.
// 숫자는 "이 카테고리 문자 N개가 대략 몇 토큰인가".

const CHARS_PER_TOKEN = {
  asciiWord: 4.0,     // 영문/숫자 단어 문자. 가장 압축률 높음.
  cjk: 1.5,           // 한글/한자/일본어. BPE가 문자당 1~2 토큰 사이로 쪼갬.
  whitespace: 8.0,    // 공백은 인접 토큰에 흡수되는 경우 많음.
  punct: 2.0,         // 구두점은 자주 단독 토큰.
  other: 2.5,         // 기타 유니코드 (악센트, 라틴 확장 등).
};

const TOKENS_PER_EMOJI = 2.5;     // 이모지는 multi-codepoint, 평균 2~3 토큰.

// ─── 제공자별 보정 계수 ───
// 기준: OpenAI tiktoken = 1.00.
// 경험적 값: 샘플 한/영/코드/마크다운 혼합 기준으로 Anthropic/Google 공식
// count API와 비교해 조정. 정밀 보정이 필요하면 tests로 재측정 권장.

const PROVIDER_COEFFICIENT: Record<ProviderKind, number> = {
  openai: 1.00,
  anthropic: 1.05,
  google: 1.00,
  vertex: 1.00,              // Vertex AI = Gemini 모델. google와 동일 계수.
  "openai-compatible": 1.05, // 로컬 Llama/Qwen 기본. 모델명 매칭으로 세분화.
  novelai: 1.05,             // NAI text 토크나이저는 경험적으로 tiktoken과 비슷한 범위.
  elevenlabs: 1.00,          // TTS 전용이라 실사용은 안 됨.
};

// 모델 이름 키워드 → 계수 세분화 (openai-compatible 전용).
// 간단한 substring 매칭. 없으면 provider 기본값.
const MODEL_COEFFICIENT_HINTS: Array<{ match: RegExp; coefficient: number }> = [
  { match: /llama-?3/i, coefficient: 1.05 },
  { match: /llama-?2/i, coefficient: 1.10 },
  { match: /qwen/i, coefficient: 1.05 },
  { match: /mistral|mixtral/i, coefficient: 1.05 },
  { match: /phi-?[34]/i, coefficient: 1.00 },
  { match: /gemma/i, coefficient: 1.00 },
];

// ─── 메시지 구조 오버헤드 ───
// 각 메시지에 role 구분자, 시작/끝 마커 등으로 상수 토큰 소모.
// OpenAI chat format 기준으로 메시지당 ~4토큰이 대체로 맞음.

const PER_MESSAGE_OVERHEAD = 4;
const PER_TOOL_OVERHEAD = 10; // 툴 정의당 래핑 오버헤드.
const PER_IMAGE_BLOCK_TOKENS = 85; // 이미지 블록 최소값. 고해상도는 더 커지나
                                    // 정확한 값은 제공자별로 다양 — 보수적 근사.

// ─── 카테고리 분류 ───

function categorize(codePoint: number): keyof typeof CHARS_PER_TOKEN | "emoji" {
  // ASCII 우선 처리 (가장 흔함).
  if (codePoint < 128) {
    if (codePoint === 0x20 || codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) {
      return "whitespace";
    }
    // 0-9, A-Z, a-z
    if (
      (codePoint >= 0x30 && codePoint <= 0x39) ||
      (codePoint >= 0x41 && codePoint <= 0x5a) ||
      (codePoint >= 0x61 && codePoint <= 0x7a) ||
      codePoint === 0x5f // underscore
    ) {
      return "asciiWord";
    }
    return "punct";
  }

  // CJK 블록 (한글/한자/일본어).
  if (
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||   // CJK Symbols
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||   // Hiragana/Katakana
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||   // CJK Ext A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||   // CJK Unified
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||   // Hangul Syllables
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||   // Hangul Jamo
    (codePoint >= 0xff00 && codePoint <= 0xffef)      // Halfwidth/Fullwidth
  ) {
    return "cjk";
  }

  // 이모지: Emoticons, Misc Symbols and Pictographs, Transport, Supplemental Symbols.
  if (
    (codePoint >= 0x1f300 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
    (codePoint >= 0x1fa70 && codePoint <= 0x1faff)
  ) {
    return "emoji";
  }

  return "other";
}

// ─── 코어: 문자열 → 토큰 수 (baseline, 계수 적용 전) ───

function countStringBaseline(text: string): number {
  if (!text) return 0;

  const counts = { asciiWord: 0, cjk: 0, whitespace: 0, punct: 0, other: 0, emoji: 0 };

  // for...of는 코드포인트 단위로 순회 (서로게이트 페어 정상 처리).
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    counts[categorize(cp)]++;
  }

  const t =
    counts.asciiWord / CHARS_PER_TOKEN.asciiWord +
    counts.cjk / CHARS_PER_TOKEN.cjk +
    counts.whitespace / CHARS_PER_TOKEN.whitespace +
    counts.punct / CHARS_PER_TOKEN.punct +
    counts.other / CHARS_PER_TOKEN.other +
    counts.emoji * TOKENS_PER_EMOJI;

  return Math.ceil(t);
}

// ─── 제공자 계수 선택 ───

function resolveCoefficient(provider?: ProviderKind, model?: string): number {
  const base = provider ? PROVIDER_COEFFICIENT[provider] : 1.0;
  if (provider === "openai-compatible" && model) {
    for (const hint of MODEL_COEFFICIENT_HINTS) {
      if (hint.match.test(model)) return hint.coefficient;
    }
  }
  return base;
}

// ─── ContentBlock / Message / Tool 처리 ───

function countContentBlock(block: ContentBlock): number {
  if (block.type === "text") return countStringBaseline(block.text);
  if (block.type === "image") return PER_IMAGE_BLOCK_TOKENS;
  return 0;
}

function countMessageContent(content: string | ContentBlock[]): number {
  if (typeof content === "string") return countStringBaseline(content);
  let total = 0;
  for (const block of content) total += countContentBlock(block);
  return total;
}

function countMessage(msg: GGAIChatMessage): number {
  let total = PER_MESSAGE_OVERHEAD;
  total += countMessageContent(msg.content);
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      total += countStringBaseline(tc.name);
      total += countStringBaseline(JSON.stringify(tc.input ?? {}));
      total += 4; // tool call 래핑 오버헤드
    }
  }
  if (msg.toolCallId) total += countStringBaseline(msg.toolCallId);
  return total;
}

function countTool(tool: ToolDefPublic): number {
  let total = PER_TOOL_OVERHEAD;
  total += countStringBaseline(tool.name);
  total += countStringBaseline(tool.description);
  total += countStringBaseline(JSON.stringify(tool.inputSchema));
  return total;
}

// ─── 공개 API ───

export type CountTokensInput =
  | string
  | GGAIChatMessage[]
  | { messages?: GGAIChatMessage[]; tools?: ToolDefPublic[]; system?: string };

export interface CountTokensOptions {
  provider?: ProviderKind;
  model?: string;
}

/**
 * 주어진 입력의 근사 토큰 수를 계산한다. 동기, 네트워크 없음.
 * 제공자/모델이 명시되면 계수를 적용해 정확도를 높인다.
 *
 * 오차는 실제 대비 평균 ±10% 내외. 컨텍스트 패킹 loop처럼
 * 수백~수천 번 호출되는 경로에 맞춰 설계됨.
 */
export function countTokens(
  input: CountTokensInput,
  opts?: CountTokensOptions
): number {
  const coef = resolveCoefficient(opts?.provider, opts?.model);

  let raw = 0;

  if (typeof input === "string") {
    raw = countStringBaseline(input);
  } else if (Array.isArray(input)) {
    for (const msg of input) raw += countMessage(msg);
  } else {
    if (input.system) raw += countStringBaseline(input.system) + PER_MESSAGE_OVERHEAD;
    if (input.messages) for (const msg of input.messages) raw += countMessage(msg);
    if (input.tools) for (const tool of input.tools) raw += countTool(tool);
  }

  return Math.ceil(raw * coef);
}
