# GGAI CORE — 설계 문서

> **버전**: 0.2.0  
> **대상**: 내부 개발자용. 코드 구조·타입·설계 결정을 기술.  
> 외부 API 사용법은 [README.md](README.md)의 "개발자 / AI 에이전트 API 레퍼런스" 참조.

---

## 개요

Obsidian 플러그인들이 공동으로 사용하는 **AI 응답 허브**.

- **모델 프로필 관리**: Anthropic / OpenAI / Google / OpenAI-Compatible / NovelAI / ElevenLabs 프로바이더를 프로필로 등록, 다른 플러그인에 제공
- **생성 요청 프록시**: Chat / Text / Image / Voice 통합 인터페이스 (`GGAIApi`)
- **에이전트 런타임**: 호출 측이 ToolDef 배열을 주입하면 멀티턴 루프를 돌려 결과 반환
- **스트리밍**: `AsyncIterable<AgentEvent>` / `AsyncIterable<ChatEvent>` 이벤트 스트림
- **활성 요청 표시**: 화면 우상단 부유 상태바 (스피너 + 모델 목록)

---

## 설계 결정 (Decision Log)

| 항목 | 결정 | 근거 |
|------|------|------|
| 프로바이더 범위 | Anthropic / OpenAI / Google / OpenAI-Compatible / NovelAI / ElevenLabs | 커버리지 우선 |
| 노출 방식 | `app.plugins.plugins['ggai-core'].api` | `window` 전역은 안티패턴 (window는 fallback으로만 유지) |
| data.json 키 | `ggai_profiles`, `ggai_secrets`, `ggai_settings` (`ggai_` 접두어) | 다른 플러그인과 키 충돌 방지. persist 시 기존 키 보존 |
| 커맨드 팔레트 | 각 플러그인이 자체 등록. GGAI Core는 4개 자체 커맨드만 등록 | 커맨드 API는 인자·반환값 없음 |
| 스킬/도구 주입 | 요청 시 ToolDef 배열 전달 (일회성) + `registerTool()`로 영구 등록 | 플러그인별 컨텍스트 분리 |
| 스트리밍 | `AsyncIterable<ChatEvent>` 기반. chat() 내부도 streamingEnabled 시 스트림 소비 후 합성 | 진행 상황 UI 가시화 전제조건 |
| 프로필 타입 | `chat` / `text` / `image` / `voice` 4종 | 요청 스키마가 다름. text는 NAI 전용, image는 NAI 전용, voice는 ElevenLabs 전용 |
| API 키 저장 | `data.json`의 `ggai_secrets` 섹션. 프로필에는 `apiKeyRef`만 저장 | 공식 플러그인도 동일 방식. UI에 경고 명시 |
| generate() | chat/text 프로필 통합 단순 텍스트 생성 메서드. API에 추가 | NovelAI text와 chat 모델 구분 없이 쓰는 사용 사례 대응 |
| TextProfile provider | `"novelai"` 고정 | 범용 text completion은 대부분 deprecated. NAI로 범위 축소 |
| ImageProfile | NAI v4.5 파라미터 구조. v4_prompt / v4_negative_prompt 구조체 사용 | v3 파라미터 제거 |
| VoiceProfile subKind | `"tts"` 전용 (STT는 별도 타입으로 분리 검토 중) | ElevenLabs는 TTS 전용. STT는 다른 프로바이더 |
| 활성 요청 UI | 화면 우상단 부유 div. `generation.on("active-changed")` 구독 | 진행 중 요청이 있을 때만 표시 |

---

## 1. 모델 프로필

### 1.1 데이터 구조 (src/types/profile.ts)

```typescript
type ProviderKind =
  | "anthropic"
  | "openai"
  | "google"
  | "openai-compatible"  // Ollama, LM Studio, LocalAI, vLLM, LiteLLM 등
  | "novelai"            // text completion + image generation
  | "elevenlabs";        // TTS

type ProfileKind = "chat" | "text" | "image" | "voice";

interface ModelProfileBase {
  id: string;           // 내부 UUID
  name: string;         // 사용자 표시명
  kind: ProfileKind;
  provider: ProviderKind;
  baseUrl?: string;     // openai-compatible 필수. 나머지는 프록시용 선택
  apiKeyRef: string;    // secrets map의 키. 프로필 자체에는 실제 키 없음
  model: string;        // "claude-sonnet-4-6", "gpt-4o", "nai-diffusion-4-5", ...
  createdAt: number;
  updatedAt: number;
}

interface ChatProfile extends ModelProfileBase {
  kind: "chat";
  isDefault?: boolean;          // true면 profileId 미지정 chat 요청의 fallback
  params: {
    temperature?: number;
    topP?: number;
    topK?: number;
    minP?: number;                                 // vLLM/LM Studio 계열
    maxTokens?: number;
    maxContextTokens?: number;                     // 입력 토큰 상한. 초과 시 전송 전 거부
    stopSequences?: string[];
    reasoningEffort?: "minimal" | "low" | "medium" | "high"; // OpenAI o-series
    thinkingBudget?: number;                       // Anthropic extended thinking (활성 시 budget)
    thinkingDisabled?: boolean;                    // 사고 명시 비활성. provider별 해석 (아래 참고)
  };
  allowedParams?: {             // 외부 플러그인 paramsOverride 허용 키. undefined=전부 허용(legacy)
    topK?: boolean;
    topP?: boolean;
    minP?: boolean;
  };
  supports: {
    tools: boolean;
    vision: boolean;
    streaming: boolean;
    systemPrompt: boolean;
  };
  streamingEnabled?: boolean; // true면 chat() 내부에서 chatStream() 소비 후 합성
}

// thinkingDisabled = true 일 때의 provider별 전송:
//   anthropic        → thinking: { type: "disabled" }  (thinkingBudget보다 우선)
//   openai / 호환    → reasoning_effort: "minimal"
//   google           → generationConfig.thinkingConfig.thinkingBudget = 0

// NovelAI 전용 text completion 프로필
interface TextProfile extends ModelProfileBase {
  kind: "text";
  provider: "novelai"; // 고정
  isDefault?: boolean;  // generate() profileId 생략 시 fallback
  params: {
    temperature?: number;
    maxTokens?: number;
    maxContextTokens?: number;   // 입력 토큰 상한. 초과 시 전송 전 거부
    topP?: number;
    topK?: number;
    minP?: number;
    stopSequences?: string[];
  };
  allowedParams?: {              // ChatProfile과 동일 (topK/topP/minP 게이팅)
    topK?: boolean;
    topP?: boolean;
    minP?: boolean;
  };
}

// NovelAI v4.5 기준 이미지 생성 프로필
// v4.5 핵심: v4_prompt / v4_negative_prompt 객체 구조로 전송
// v3 전용 파라미터(sm, sm_dyn, ucPreset, qualityToggle, legacy)는 제거
interface ImageProfile extends ModelProfileBase {
  kind: "image";
  provider: "novelai"; // 고정
  params: {
    width?: number;
    height?: number;
    scale?: number;             // CFG guidance
    sampler?: string;
    steps?: number;
    nSamples?: number;
    seed?: number;
    noiseSchedule?: "karras" | "native" | "exponential" | "polyexponential";
    cfgRescale?: number;
    uncondScale?: number;
    skipCfgAboveSigma?: number;  // Variety+: 활성 시 19.0 고정, undefined = 비활성(null 전송)
    skipCfgBelowSigma?: number;
    dynamicThresholding?: boolean;
    dynamicThresholdingPercentile?: number;
    dynamicThresholdingMimicScale?: number;
    negativePrompt?: string;    // 기본 UC. ImageRequest.negativePrompt으로 런타임 재지정 가능
    useOrder?: boolean;
    // use_coords: 항상 false 고정 (src/providers/novelai.ts). 프로필 파라미터가 아님.
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

// ElevenLabs TTS 전용 프로필
interface VoiceProfile extends ModelProfileBase {
  kind: "voice";
  provider: "elevenlabs"; // 고정
  subKind: "tts";
  params: {
    voice?: string;             // voice_id
    format?: string;            // output_format (예: mp3_44100_128)
    stability?: number;         // 0~1
    similarityBoost?: number;   // 0~1
    style?: number;             // 0~1
    useSpeakerBoost?: boolean;
    language?: string;
  };
}

type GGAIModelProfile = ChatProfile | TextProfile | ImageProfile | VoiceProfile;

// 외부 플러그인에 노출하는 뷰 (apiKeyRef 제거)
type PublicProfile = Omit<GGAIModelProfile, "apiKeyRef">;
```

### 1.2 Secrets 저장 (src/storage/secrets-vault.ts)

```typescript
// data.json 구조
{
  "ggai_secrets": { "<apiKeyRef-uuid>": "실제-API-키" }
}
```

- 프로필 객체와 분리 → 프로필을 내보내도 키는 포함되지 않음
- `toPublicProfile()` 함수가 `apiKeyRef` 필드를 제거해 외부에 노출

### 1.3 설정 (src/services/generation-service.ts)

```typescript
interface GGAISettings {
  requestTimeoutMs: number;   // 기본 120000 (2분)
  defaultMaxTurns: number;    // 에이전트 기본 20턴
  logRequests: boolean;       // 요청 로그 on/off
  uiLanguage: "ko" | "en";   // 설정 UI 언어
}
```

---

## 2. 공용 API (src/api.ts)

### 2.1 진입점

```typescript
// 다른 플러그인에서
const api = (app as any).plugins?.plugins?.["ggai-core"]?.api as GGAIApi | undefined;
```

### 2.2 GGAIApi 인터페이스 (현행)

```typescript
interface GGAIApi {
  version: string;

  // 프로필 조회 (apiKeyRef 제외)
  listProfiles(kind?: ProfileKind): PublicProfile[];
  getProfile(id: string): PublicProfile | null;

  // 생성
  generate(req: GenerateRequest): Promise<GenerateResponse>; // chat/text 통합
  chat(req: ChatRequest): Promise<ChatResponse>;
  chatStream(req: ChatRequest): AsyncIterable<ChatEvent>;
  text(req: TextRequest): Promise<TextResponse>;    // NovelAI 전용
  image(req: ImageRequest): Promise<ImageResponse>; // NovelAI 전용
  tts(req: TTSRequest): Promise<TTSResponse>;       // ElevenLabs 전용
  stt(req: STTRequest): Promise<STTResponse>;

  // 에이전트
  agent(req: AgentRequest): AsyncIterable<AgentEvent>;

  // 도구 영구 등록
  registerTool(pluginId: string, tool: ToolDef): () => void; // returns unregister

  // 토큰 카운팅 (동기, 근사, 네트워크 없음)
  countTokens(
    input: CountTokensInput,
    opts?: { profileId?: string } | CountTokensOptions
  ): number;

  // 이벤트
  on(event: "profiles-changed", handler: () => void): () => void;
}
```

### 2.3 요청/응답 타입 (src/types/chat.ts)

```typescript
// ── Chat ──

interface GGAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  toolCallId?: string;    // role="tool" 일 때
  toolCalls?: ToolCall[]; // role="assistant" + tool_use 시
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source:
      | { kind: "base64"; mediaType: string; data: string }
      | { kind: "url"; url: string }
    };

interface ToolCall { id: string; name: string; input: unknown; }

interface ChatRequest {
  profileId?: string;  // 생략 시 isDefault=true chat 프로필 사용
  messages: GGAIChatMessage[];
  tools?: ToolDefPublic[];  // handler 없는 공개 툴 정의
  toolChoice?: "auto" | "none" | "required" | { type: "tool"; name: string };
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
}

// ToolDef의 handler를 제거한 어댑터 전달용 타입
interface ToolDefPublic {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema draft-07
}

interface ChatResponse {
  text: string;
  reasoning?: string;       // 사고 모델 추론 과정. 미지원 모델은 생략
  toolCalls: ToolCall[];
  stopReason: "end" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: { inputTokens: number; outputTokens: number };
  raw: unknown; // 프로바이더 원본 (디버깅용)
}

type ChatEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call-start"; toolCallId: string; name: string }
  | { type: "tool-call-args-delta"; toolCallId: string; delta: string }
  | { type: "tool-call-end"; toolCallId: string; name: string; input: unknown }
  //                                              ^^^^ name 포함 (어댑터에서 채워야 함)
  | { type: "done"; response: ChatResponse }
  | { type: "error"; error: { message: string; code?: string } };

// ── generate() ──

interface GenerateRequest {
  profileId?: string;  // chat 또는 text. 생략 시 isDefault 자동 선택
  prompt: string;
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
}
interface GenerateResponse { text: string; raw: unknown; }

// ── Image ──

interface ImageRequest {
  profileId: string;          // ImageProfile ID (필수)
  prompt: string;
  negativePrompt?: string;    // 런타임 UC 재지정. 프로필 기본값보다 우선
  size?: string;
  n?: number;
  paramsOverride?: Record<string, unknown>; // NAI parameters snake_case 필드
  signal?: AbortSignal;
}
interface ImageResponse {
  images: Array<
    | { kind: "base64"; mediaType: string; data: string }
    | { kind: "url"; url: string }
  >;
  raw: unknown;
}

// ── TTS ──

interface TTSRequest {
  profileId: string;
  text: string;
  voice?: string;
  format?: "mp3" | "wav" | "opus";
  signal?: AbortSignal;
}
interface TTSResponse {
  audio: { kind: "base64"; mediaType: string; data: string };
  raw: unknown;
}

// ── STT ──

interface STTRequest {
  profileId: string;
  audio: { kind: "base64"; mediaType: string; data: string };
  language?: string;
  signal?: AbortSignal;
}
interface STTResponse { text: string; raw: unknown; }
```

### 2.4 도구 타입 (src/types/tool.ts)

```typescript
interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema draft-07
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

interface ToolContext {
  app: App;
  pluginId: string;
  signal: AbortSignal;
  log: (msg: string) => void; // 에이전트 이벤트 스트림에 "log" 이벤트로 전파
}

interface ToolResult {
  content: string | ContentBlock[];
  isError?: boolean;
}
```

### 2.5 에이전트 타입 (src/types/agent.ts)

```typescript
interface AgentRequest {
  profileId: string;
  systemPrompt: string;
  userMessage: string | ContentBlock[];
  tools: ToolDef[];
  maxTurns?: number;            // 기본 20. 초과 시 done 아닌 error
  maxToolCallsPerTurn?: number; // 기본 10
  paramsOverride?: Record<string, unknown>;
  initialHistory?: GGAIChatMessage[];
  pluginId?: string;            // registerTool() 영구 도구 병합 식별자
  signal?: AbortSignal;
}

type AgentEvent =
  | { type: "turn-start"; turn: number }
  | { type: "text-delta"; delta: string }
  | { type: "tool-use-start"; toolCallId: string; name: string; input: unknown }
  | { type: "tool-use-end"; toolCallId: string; result: ToolResult; durationMs: number }
  | { type: "turn-end"; turn: number; stopReason: ChatResponse["stopReason"] }
  | { type: "log"; from: string; message: string }
  | { type: "done"; finalText: string; history: GGAIChatMessage[]; usage: TotalUsage }
  | { type: "error"; error: { message: string; turn: number } };

interface TotalUsage {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  turns: number;
}
```

---

## 3. 아키텍처

### 3.1 레이어 구조

```
┌─────────────────────────────────────────────────────────┐
│  다른 플러그인                                           │
│    app.plugins.plugins['ggai-core'].api.xxx()           │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│  GGAIApi Facade (src/api.ts)                            │
│  generate() chat() chatStream() text() image()         │
│  tts() stt() agent() registerTool() countTokens() on() │
└────┬──────────────┬──────────────┬───────────────────────┘
     │              │              │
ProfileStore  GenerationService  AgentRuntime
(스토리지)    (어댑터 디스패치)  (멀티턴 루프)
     │              │
     │        ProviderRegistry
     │        ├── AnthropicAdapter
     │        ├── OpenAIAdapter (openai + openai-compatible)
     │        ├── GoogleAdapter
     │        ├── NovelAIAdapter
     │        └── ElevenLabsAdapter
     │
  Storage (data.json)
  ggai_profiles / ggai_secrets / ggai_settings
```

### 3.2 Provider Adapter 계약 (src/providers/base.ts)

```typescript
interface ProviderAdapter {
  kind: ProviderKind;
  supports: Partial<Record<"chat" | "text" | "image" | "tts" | "stt", boolean>>;

  chat?(call: ResolvedCall<ChatRequest>): Promise<ChatResponse>;
  chatStream?(call: ResolvedCall<ChatRequest>): AsyncIterable<ChatEvent>;
  text?(call: ResolvedCall<TextRequest>): Promise<TextResponse>;
  image?(call: ResolvedCall<ImageRequest>): Promise<ImageResponse>;
  tts?(call: ResolvedCall<TTSRequest>): Promise<TTSResponse>;
  stt?(call: ResolvedCall<STTRequest>): Promise<STTResponse>;

  validate(profile: GGAIModelProfile, apiKey: string): Promise<{ ok: boolean; error?: string }>;
}

interface ResolvedCall<TReq> {
  profile: GGAIModelProfile;
  apiKey: string;
  request: TReq;
  signal: AbortSignal;
  log?: (event: RequestLogEvent) => void;  // 요청/응답/에러 로그 (RequestLogEvent)
}
```

**각 어댑터의 책임:**
- 공용 `ChatRequest` → 프로바이더 API 포맷 변환
- SSE 파싱 → 공용 `ChatEvent` 방출
- `tool-call-end` 이벤트에 `name` 필드 포함 (start와의 매핑 유지)

**프로바이더별 포맷 차이:**

| 개념 | Anthropic | OpenAI | Google |
|---|---|---|---|
| system | 최상위 `system` 필드 | `messages[0].role='system'` | `systemInstruction` |
| 이미지 | `content[].type='image'` (base64) | `content[].type='image_url'` | `inlineData` |
| 스트리밍 | SSE `content_block_delta` 등 다종 | SSE `delta.content` / `delta.tool_calls` | SSE candidates |
| tool 정의 | `input_schema` | `function.parameters` | `functionDeclarations[].parameters` |
| tool call | `content[].type='tool_use'` | `tool_calls[]` | `functionCall` |
| tool result | `content[].type='tool_result'` | `role='tool'` + `tool_call_id` | `functionResponse` |

**스트리밍 구현 참고 (Anthropic 어댑터, src/providers/anthropic.ts):**
- 비스트리밍 `chat()`은 `chatStream()`을 소비해 합성 (`streamingEnabled` 여부와 무관하게 어댑터 내부 구현)
- `fetch()`로 직접 스트리밍 (`requestUrl`은 스트리밍 미지원)
- CORS: Obsidian 데스크탑/모바일 번들에서 해제됨

### 3.3 GenerationService (src/services/generation-service.ts)

- 활성 요청 Map 관리 (`id → { ctrl: AbortController, model: string }`)
- `getActive()` → `ActiveTask[]` : main.ts의 부유 상태바가 구독
- `on("active-changed", handler)` 이벤트 발행
- `cancelAll()` : 모든 활성 AbortController abort

### 3.4 에이전트 런타임 루프 (src/services/agent-runtime.ts)

```
초기화: history = [{ role: "system", content: systemPrompt }]
                  + (initialHistory ?? [])
                  + [{ role: "user", content: userMessage }]
        toolsByName = Map(request.tools + persistentTools[pluginId])

for turn = 1..maxTurns:
    signal.aborted → emit error("aborted"), return
    emit turn-start
    
    chatStream({ profileId, messages: history, tools, paramsOverride, signal })
      → text-delta: emit text-delta, 누적
      → tool-call-end: toolCalls 수집
      → done: usage 누적, stopReason 확정
      → error: emit error, return
    
    history.push({ role: "assistant", content: turnText, toolCalls })
    emit turn-end
    
    stopReason !== "tool_use" OR toolCalls.length === 0 → break
    
    Promise.all(toolCalls.map(async tc => {
        emit tool-use-start(tc.id, tc.name, tc.input)
        result = def.handler(tc.input, { app, pluginId, signal, log })
        emit tool-use-end(tc.id, result, durationMs)
        history.push({ role: "tool", toolCallId: tc.id, content: result.content })
    }))
    usage.toolCalls += toolCalls.length

// maxTurns 초과 시 emit error, 정상 종료 시:
emit done(finalText, history, usage)
```

**구현 주의사항:**
- `yield`는 `Promise.all` 콜백 안에서 사용 불가 → 내부 `Deferred<AgentEvent>` 큐로 브리지
  ```typescript
  // 큐 패턴:
  const queue: AgentEvent[] = [];
  const waiters: ((v: AgentEvent) => void)[] = [];
  const push = (ev: AgentEvent) => waiters.length ? waiters.shift()!(ev) : queue.push(ev);
  const next = () => queue.length ? Promise.resolve(queue.shift()!) : new Promise<AgentEvent>(r => waiters.push(r));
  // 외부에서: while (true) yield await next(); — done/error 수신 시 종료
  ```
- `pluginId`가 일치하는 `persistentTools` 항목이 request.tools에 병합됨 (이름 충돌 시 request.tools 우선)
- 영구 등록 도구: `pluginId → Map<name, ToolDef>`로 관리. `registerPersistentTool()` 반환값(unregister) 호출 시 삭제

---

## 4. 커맨드 팔레트 (GGAI Core 자체 등록)

| 커맨드 ID | 이름 | 동작 |
|---|---|---|
| `ggai-core:open-settings` | GGAI: 설정 열기 | 설정 탭 오픈 |
| `ggai-core:add-profile` | GGAI: 모델 프로필 추가 | ProfileModal 오픈 |
| `ggai-core:test-profile` | GGAI: 프로필 연결 테스트 | 첫 번째 프로필로 validate() |
| `ggai-core:cancel-all` | GGAI: 진행 중인 모든 요청 취소 | generation + agentRuntime cancelAll() |

---

## 5. 토큰 카운터 (src/tokens/counter.ts)

**설계 원칙:** 네트워크 없음, 번들 토크나이저 없음, 순수 문자열 순회. 컨텍스트 패킹 루프에서 수백~수천 번 호출되어도 문제없을 속도 우선.

**전략:**
- 문자 카테고리별 분류 (ASCII 단어 / CJK / 공백 / 구두점 / 이모지 / 기타)
- 카테고리별 chars-per-token 비율 적용
- 제공자 보정 계수: `openai` 1.00, `anthropic` 1.05, `google` 1.00, `openai-compatible` 1.05 (모델명 매칭으로 세분화)
- 메시지 구조 오버헤드: 메시지당 4토큰
- 도구 정의 오버헤드: 도구당 10토큰 + 스키마 JSON 길이
- 이미지 블록: 블록당 85토큰 (보수적 근사)

**오차:** 실측 대비 평균 ±10% 내외. 설정 UI에서 사용자에게 근사임을 고지.

**공개 타입:**
```typescript
type CountTokensInput =
  | string
  | GGAIChatMessage[]
  | { messages?: GGAIChatMessage[]; tools?: ToolDefPublic[]; system?: string };

interface CountTokensOptions {
  provider?: ProviderKind;
  model?: string;
}

// standalone 함수로도 export (main.ts에서 재export)
export function countTokens(input: CountTokensInput, opts?: CountTokensOptions): number;
```

---

## 6. 설정 UI (src/ui/)

### 6.1 파일 구조

| 파일 | 역할 |
|---|---|
| `settings-tab.ts` | Obsidian 설정 탭. 프로필 목록, 고급 설정 |
| `profile-modal.ts` | 프로필 추가/편집 모달. 프로바이더 선택 시 필드 동적 변경 |
| `strings.ts` | ko/en UI 문자열 |

### 6.2 프로필 편집 모달 — 프로바이더별 동적 필드

모든 chat 프로바이더는 공통으로: 모델 입력(직접 입력 + '모델 불러오기' 드롭다운), 샘플링 게이트(topK/topP/minP 허용 토글), **사고 비활성화 토글**.

| 프로바이더 | 특이 필드 |
|---|---|
| anthropic | thinkingBudget (extended thinking budget) + 사고 비활성화 → `thinking:{type:"disabled"}` |
| openai | reasoningEffort (minimal/low/medium/high) + 사고 비활성화 → `reasoning_effort:"minimal"` |
| google | 사고 비활성화 → `thinkingConfig.thinkingBudget=0` |
| openai-compatible | baseUrl **필수**. 사고 비활성화 → `reasoning_effort:"minimal"` (서버가 무시할 수도 있음) |
| novelai (text) | NAI text 파라미터 |
| novelai (image) | 해상도/샘플링/UC 등 NAI v4.5 파라미터 |
| elevenlabs | voice_id, format, stability 등 |

---

## 7. 프로젝트 소스 구조

```
src/
├── main.ts                   # Plugin 클래스 (진입점, 커맨드, 부유 상태바 UI)
├── api.ts                    # GGAIApi 팩토리 — 외부 진입점
├── types/
│   ├── profile.ts            # 프로필 타입 + toPublicProfile()
│   ├── chat.ts               # Chat/Generate/Text/Image/Voice 요청·응답 타입
│   ├── agent.ts              # AgentRequest, AgentEvent, TotalUsage
│   └── tool.ts               # ToolDef, ToolDefPublic, ToolContext, ToolResult
├── storage/
│   ├── profile-store.ts      # 프로필 CRUD + "profiles-changed" 이벤트
│   └── secrets-vault.ts      # apiKeyRef → 실제 키 매핑
├── providers/
│   ├── base.ts               # ProviderAdapter 인터페이스, ResolvedCall
│   ├── anthropic.ts          # Anthropic SSE 어댑터
│   ├── openai.ts             # OpenAI + OpenAI-Compatible 어댑터
│   ├── google.ts             # Google Gemini 어댑터
│   ├── novelai.ts            # NovelAI text completion + image 어댑터
│   ├── elevenlabs.ts         # ElevenLabs TTS 어댑터
│   └── index.ts              # ProviderRegistry (프로바이더 등록 + forProfile())
├── services/
│   ├── generation-service.ts # 프로필 해결 + 어댑터 디스패치 + 활성 요청 관리 + "active-changed" 이벤트
│   └── agent-runtime.ts      # 멀티턴 루프 + 도구 병렬 실행 + persistentTools 관리
├── tokens/
│   └── counter.ts            # 동기 근사 토큰 카운터 (standalone export 포함)
├── api/
│   └── fetchModels.ts        # 프로바이더 모델 목록 조회 (설정 UI용)
├── ui/
│   ├── settings-tab.ts       # 설정 탭
│   ├── profile-modal.ts      # 프로필 추가/편집 모달
│   └── strings.ts            # UI 문자열 (ko/en)
└── util/ (또는 utils/)
    └── (공용 유틸리티)
```

---

## 8. 알려진 리스크 / 열린 질문

| 항목 | 내용 | 현재 대응 |
|---|---|---|
| API 키 평문 저장 | OS 키체인 연동 없음 | UI 경고. 공유 전 secrets 삭제 안내 |
| CORS | 데스크탑은 문제없음. 모바일은 프로바이더별 확인 필요 | fetch() 사용. requestUrl은 스트리밍 미지원으로 사용 안 함 |
| yield in Promise.all | async generator에서 콜백 내 yield 불가 | Deferred 큐 패턴으로 브리지 (agent-runtime.ts) |
| 호출 주체 식별 | agent() 단발 호출 시 pluginId 전달이 선택사항 | AgentRequest.pluginId? 추가됨. generateService 레벨은 미구현 |
| 도구 이름 충돌 | 여러 플러그인이 같은 이름의 영구 도구 등록 | pluginId 네임스페이스로 분리됨. 동일 pluginId 내 이름 중복은 마지막 등록 승 |
| 모바일 로컬 모델 | Ollama 등은 모바일 네트워크 제약 | 문서 안내. isDesktopOnly 프로필 플래그 추가 검토 중 |
| NAI image UC 구조 | paramsOverride에 negative_prompt 직접 넣으면 v4_negative_prompt 미갱신 | negativePrompt 필드 전용 경로 강제. 문서 및 API 가이드에 경고 |
| STT 프로필 | VoiceProfile.subKind가 "tts" 전용. STT용 별도 타입 미정의 | STTRequest/Response는 있으나 프로필 타입은 추후 분리 검토 |
