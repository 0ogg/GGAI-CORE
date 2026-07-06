# GGAI Core

> **옵시디언 AI 응답 허브** — 여러 AI 프로바이더를 하나의 공통 인터페이스로 통합하고, 다른 플러그인에 Chat / Text / Image / Voice / Agent 기능을 제공합니다.

---

## 목차

### 사용자
1. [설치](#1-설치)
2. [지원 AI 서비스](#2-지원-ai-서비스)
3. [프로필 설정](#3-프로필-설정)
4. [커맨드 팔레트](#4-커맨드-팔레트)
5. [자주 묻는 질문 (사용자)](#5-자주-묻는-질문-사용자)

### 개발자 / AI 에이전트
6. [개요 — 이 플러그인이 하는 일](#6-개요--이-플러그인이-하는-일)
7. [API 진입점](#7-api-진입점)
8. [프로필 조회](#8-프로필-조회)
9. [텍스트 생성 — `generate()`](#9-텍스트-생성--generate)
10. [채팅 — `chat()` / `chatStream()`](#10-채팅--chat--chatstream)
11. [이미지 생성 — `image()`](#11-이미지-생성--image)
12. [음성 합성 — `tts()`](#12-음성-합성--tts)
13. [음성 인식 — `stt()`](#13-음성-인식--stt)
14. [에이전트 런타임 — `agent()`](#14-에이전트-런타임--agent)
15. [도구 영구 등록 — `registerTool()`](#15-도구-영구-등록--registertool)
16. [토큰 수 계산 — `countTokens()`](#16-토큰-수-계산--counttokens)
17. [이벤트 구독 — `on()`](#17-이벤트-구독--on)
18. [진단 로그 — `getRequestLog()` / `getErrorLog()`](#18-진단-로그--getrequestlog--geterrorlog)
19. [타입 전체 참조](#19-타입-전체-참조)
20. [아키텍처 개요](#20-아키텍처-개요)
21. [자주 묻는 질문 (개발자)](#21-자주-묻는-질문-개발자)

---

# 사용자 가이드

## 1. 설치

### 방법 A — BRAT (권장, 미출시 버전)

1. Obsidian → 설정 → 커뮤니티 플러그인 → BRAT 설치 후 활성화
2. BRAT → "Add Beta Plugin" 클릭
3. `https://github.com/salmon0pp/obsidian-ggai-core` 입력 후 추가
4. GGAI Core를 활성화

### 방법 B — 수동 설치

1. [Releases](https://github.com/salmon0pp/obsidian-ggai-core/releases) 페이지에서 최신 버전의 `main.js`, `manifest.json`, `styles.css` 다운로드
2. Vault의 `.obsidian/plugins/ggai-core/` 폴더에 세 파일 복사
3. Obsidian → 설정 → 커뮤니티 플러그인 → GGAI Core 활성화

> **의존 플러그인**: 다른 GGAI 플러그인(예: ggai-writer, ggai-agent)을 설치하면, 해당 플러그인의 `manifest.json`에 GGAI Core가 의존성으로 명시되어 있어 자동으로 먼저 로드됩니다.

---

## 2. 지원 AI 서비스

| 프로바이더 | 종류 | 기능 |
|---|---|---|
| **Anthropic** | Chat | Claude 3 / Claude 4 계열 (Opus, Sonnet, Haiku) |
| **OpenAI** | Chat | GPT-4o, GPT-4 Turbo, o-series (reasoning) |
| **Google** | Chat | Gemini 2.0 / 2.5 계열 |
| **OpenAI 호환** | Chat | Ollama, LM Studio, vLLM, LocalAI, DeepSeek, Kimi, Z.ai, OpenRouter, NanoGPT 등 로컬/프록시 (baseUrl·모델명으로 서비스 자동 감지 → 지원 샘플링 파라미터 자동 설정) |
| **NovelAI** | Text + Image | 소설 텍스트 이어쓰기 + NAI v4.5 이미지 생성 |
| **ElevenLabs** | Voice (TTS) | 고품질 다국어 음성 합성 |

---

## 3. 프로필 설정

설정 탭(GGAI Core)에서 사용할 AI 서비스를 **프로필**로 등록합니다. 하나의 계정에 여러 프로필을 만들 수 있습니다.

### 프로필 추가

1. 설정 → GGAI Core → **+ 프로필 추가** 버튼 클릭
2. 프로바이더 선택 (Anthropic, OpenAI 등)
3. API 키 입력 + 모델 선택
4. 저장 후 **연결 테스트** 버튼으로 확인

### 기본 프로필 지정

`isDefault` 플래그를 켜면 다른 플러그인이 프로필 ID를 지정하지 않을 때 자동으로 이 프로필이 사용됩니다. Chat/Text 각각 하나씩 기본값을 설정할 수 있습니다.

### API 키 보안 안내

API 키는 Vault의 `.obsidian/plugins/ggai-core/data.json` 파일에 저장됩니다. Obsidian은 OS 키체인 연동을 지원하지 않으며, 이는 모든 LLM 플러그인이 동일합니다.

> ⚠️ **Vault 폴더를 클라우드 동기화하거나 타인과 공유하는 경우 API 키가 노출될 수 있습니다.** 공유 전 `data.json`에서 `ggai_secrets` 섹션을 삭제하세요.

### 활성 요청 표시기

AI 요청이 진행 중일 때 화면 우상단에 스피너와 함께 요청 중인 모델 목록이 표시됩니다. 요청이 완료되면 자동으로 사라집니다.

---

## 4. 커맨드 팔레트

`Ctrl+P` (Mac: `Cmd+P`) → "GGAI" 검색

| 커맨드 | 설명 |
|---|---|
| `GGAI: 설정 열기` | GGAI Core 설정 탭으로 이동 |
| `GGAI: 모델 프로필 추가` | 프로필 생성 모달 열기 |
| `GGAI: 프로필 연결 테스트` | 첫 번째 프로필로 연결 확인 |
| `GGAI: 진행 중인 모든 요청 취소` | 현재 실행 중인 모든 AI 요청 중단 |

---

## 5. 자주 묻는 질문 (사용자)

**Q. 어떤 AI 서비스의 API 키가 필요한가요?**  
A. 사용하려는 서비스의 키만 있으면 됩니다. Anthropic만 쓴다면 Anthropic 키 하나로 시작할 수 있습니다.

**Q. 로컬 AI(Ollama 등)도 쓸 수 있나요?**  
A. 네. 프로바이더를 "OpenAI 호환"으로 선택하고 Ollama의 baseUrl(`http://localhost:11434/v1`)을 입력하면 됩니다.

**Q. GGAI Core 자체는 무슨 기능을 하나요?**  
A. GGAI Core는 다른 플러그인(예: ggai-writer, ggai-agent)이 사용하는 AI 연결 허브입니다. 단독으로는 AI 기능을 직접 실행하지 않고, API 키/프로필 관리와 AI 요청 중계를 담당합니다.

---

# 개발자 / AI 에이전트 API 레퍼런스

이 섹션은 GGAI Core를 의존 플러그인으로 사용하는 **Obsidian 플러그인 개발자** 및 **플러그인 제작 AI 에이전트**를 위한 완전한 레퍼런스입니다. 코드를 직접 읽지 않아도 이 문서만으로 플러그인을 제작할 수 있습니다.

---

## 6. 개요 — 이 플러그인이 하는 일

```
┌─────────────────────────────────────────────────────────┐
│  다른 플러그인 (PluginA, PluginB, ...)                   │
│    └─ app.plugins.plugins['ggai-core'].api.xxx()        │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│  GGAI Core Plugin (v0.2.0)                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Public API Facade (src/api.ts)                   │   │
│  │  generate() chat() chatStream() text()           │   │
│  │  image() tts() stt() agent()                     │   │
│  │  registerTool() countTokens() on()               │   │
│  └────────┬──────────────┬──────────────┬───────────┘   │
│           │              │              │               │
│     ProfileStore   GenerationService  AgentRuntime     │
│           │              │              │               │
│           │        ProviderRegistry ──►  어댑터들       │
│           │        Anthropic / OpenAI / Google /        │
│           │        OpenAI-Compatible / NovelAI /        │
│           │        ElevenLabs                           │
│           │                                             │
│     Storage (data.json)                                 │
│       ggai_profiles / ggai_secrets / ggai_settings      │
└─────────────────────────────────────────────────────────┘
```

**핵심 개념:**
- **프로필(Profile)**: 어떤 AI 서비스를, 어떤 모델로, 어떤 파라미터로 쓸지 저장한 설정 단위
- **API Facade**: 외부 플러그인이 호출하는 단일 진입점. API 키는 절대 노출하지 않음
- **GenerationService**: 프로필 해결 + 어댑터 디스패치 + 취소 컨트롤러 관리
- **AgentRuntime**: 멀티턴 tool-use 루프 실행, 도구 병렬 호출

---

## 7. API 진입점

```typescript
import type { GGAIApi } from "obsidian-ggai-core";

// ✅ 권장 방법
function getGGAI(app: App): GGAIApi | null {
  const plugin = (app as any).plugins?.plugins?.["ggai-core"];
  return (plugin?.api as GGAIApi) ?? null;
}

// 내 플러그인 onload()에서:
async onload() {
  const api = getGGAI(this.app);
  if (!api) {
    new Notice("GGAI Core가 필요합니다. 설치 후 활성화해 주세요.");
    return;
  }
  console.log("GGAI Core 버전:", api.version);
}
```

**`manifest.json`에 의존성 추가** (GGAI Core가 먼저 로드됨을 보장):
```json
{
  "id": "my-plugin",
  "dependencies": {
    "ggai-core": ">=0.2.0"
  }
}
```

> `window.GGAICorePlugin`으로도 접근할 수 있지만, Obsidian 플러그인 생명주기와 분리된 경로이므로 `app.plugins` 방식을 사용하세요.

---

## 8. 프로필 조회

```typescript
// 전체 프로필 목록
const all = api.listProfiles();

// 종류별 필터
const chatProfiles  = api.listProfiles("chat");   // Anthropic, OpenAI, Google, 호환
const textProfiles  = api.listProfiles("text");   // NovelAI text completion 전용
const imageProfiles = api.listProfiles("image");  // NovelAI image 전용
const voiceProfiles = api.listProfiles("voice");  // ElevenLabs TTS 전용

// 특정 ID로 조회
const profile = api.getProfile("some-uuid");
if (profile) {
  console.log(profile.name);      // 사용자 지정 이름
  console.log(profile.kind);      // "chat" | "text" | "image" | "voice"
  console.log(profile.provider);  // "anthropic" | "openai" | "google" | ...
  console.log(profile.model);     // "claude-sonnet-4-6" 같은 모델 ID
}
```

**PublicProfile** — apiKeyRef(민감 정보)가 제거된 공개 뷰:

```typescript
// 공통 필드 (모든 프로필)
{
  id: string;         // 내부 UUID
  name: string;       // 사용자 지정 이름
  kind: "chat" | "text" | "image" | "voice";
  provider: ProviderKind;
  model: string;
  baseUrl?: string;
  createdAt: number;  // Unix ms
  updatedAt: number;
}

// ChatProfile 추가 필드
{
  isDefault?: boolean;   // true면 profileId 생략 시 자동 선택
  params: {
    temperature?: number;
    topP?: number;
    topK?: number;
    minP?: number;                                 // vLLM/LM Studio 계열
    maxTokens?: number;
    maxContextTokens?: number;                     // 입력 토큰 상한. 초과 시 전송 전 거부
    stopSequences?: string[];
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "max" | "xhigh"; // 추론 레벨. 서비스별 유효 값으로 자동 보정(clamp)
    thinkingBudget?: number;                       // Anthropic extended thinking (활성 시 budget)
    thinkingDisabled?: boolean;                    // 사고 명시 비활성 (아래 참고)
  };
  allowedParams?: {                                // 외부 플러그인 paramsOverride 허용 키. undefined=전부 허용(legacy)
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
  streamingEnabled?: boolean; // 사용자 설정: true면 내부적으로 chatStream 사용
}
```

> **`thinkingDisabled` (사고 비활성화)** — 사고 모델의 thinking/reasoning을 끕니다. provider별 해석:
> - Anthropic → `thinking: { type: "disabled" }` 전송 (`thinkingBudget`보다 우선)
> - OpenAI / OpenAI-호환 → 감지된 서비스별 끄기 파라미터 전송 (끄기 미지원 서비스는 최저 레벨로 대체하거나 파라미터를 생략해 400 방지)
> - Google → `thinkingConfig.thinkingBudget: 0` 전송
>
> **`reasoningEffort`** — 전송 시 해당 서비스가 실제로 지원하는 값 목록으로 자동 보정(clamp)됩니다. 예: `"xhigh"`를 지원하지 않는 서비스면 가장 가까운 상위 레벨로 낮춰 전송합니다.
>
> **`allowedParams`** — `topK`/`topP`/`minP` 중 외부 플러그인의 `paramsOverride`로 덮어쓰기를 허용할 키. 체크 해제된 키는 요청에 들어와도 무시되고 프로필 기본값도 전송되지 않습니다. `temperature`/`maxTokens`는 항상 허용입니다.

---

## 9. 텍스트 생성 — `generate()`

chat 프로필과 text(NovelAI) 프로필을 구분 없이 사용하는 가장 단순한 텍스트 생성 방법입니다.

```typescript
// 가장 단순한 호출 — isDefault 프로필 자동 선택
const result = await api.generate({
  prompt: "조선시대 과거 시험을 한 줄로 설명해줘",
});
console.log(result.text);

// 특정 프로필 지정 (chat 또는 text 어느 쪽이든 동작)
const result2 = await api.generate({
  profileId: "claude-or-nai-profile-uuid",
  prompt: "단편 소설 도입부를 써줘",
  paramsOverride: { temperature: 1.2, maxTokens: 500 },
  signal: controller.signal, // AbortSignal 지원
});
```

**내부 동작:**
- `kind: "text"` 프로필 → `text()` 경로로 직접 전달 (NAI text completion)
- `kind: "chat"` 프로필 → `messages: [{ role: "user", content: prompt }]`로 래핑 후 `chat()`

**`generate()` vs `chat()` 선택 기준:**

| 상황 | 권장 |
|---|---|
| 단순 프롬프트 → 텍스트 한 번 생성 | `generate()` |
| chat/text 프로필 어느 쪽이든 수용 | `generate()` |
| 멀티턴 대화, system 프롬프트, tool use | `chat()` |
| 멀티모달 (이미지 첨부) | `chat()` |

**GenerateRequest / GenerateResponse:**
```typescript
interface GenerateRequest {
  profileId?: string;               // 생략 시 isDefault 프로필 자동 선택
  prompt: string;
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
}
interface GenerateResponse {
  text: string;
  raw: unknown;  // 프로바이더 원본 응답 (디버깅용)
}
```

---

## 10. 채팅 — `chat()` / `chatStream()`

### 단발 요청 — `chat()`

```typescript
const response = await api.chat({
  profileId: "my-profile-id",  // 생략 시 isDefault chat 프로필 사용
  messages: [
    { role: "system",    content: "당신은 친절한 조수입니다." },
    { role: "user",      content: "오늘 날씨가 어때요?" },
  ],
});

console.log(response.text);                   // AI 답변 텍스트
console.log(response.stopReason);             // "end" | "max_tokens" | "tool_use" | "stop_sequence"
console.log(response.usage.inputTokens);      // 입력 토큰 수
console.log(response.usage.outputTokens);     // 출력 토큰 수
console.log(response.toolCalls);              // tool_use 결과 (없으면 빈 배열)
```

### 스트리밍 — `chatStream()`

```typescript
let fullText = "";

for await (const event of api.chatStream({
  messages: [{ role: "user", content: "시를 써줘" }],
})) {
  if (event.type === "text-delta") {
    fullText += event.delta;
    myElement.setText(fullText);  // UI 실시간 업데이트
  }
  if (event.type === "done") {
    console.log("완료. 총 출력 토큰:", event.response.usage.outputTokens);
  }
  if (event.type === "error") {
    console.error("오류:", event.error.message);
  }
}
```

### 취소

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000); // 5초 후 취소

try {
  const res = await api.chat({
    messages: [{ role: "user", content: "긴 글을 써줘" }],
    signal: controller.signal,
  });
} catch (e) {
  if (e.name === "AbortError") console.log("취소됨");
}
```

### 멀티모달 (이미지 첨부)

```typescript
await api.chat({
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "이 이미지를 설명해줘" },
      // URL 방식
      { type: "image", source: { kind: "url", url: "https://..." } },
      // base64 방식
      { type: "image", source: { kind: "base64", mediaType: "image/png", data: "iVBOR..." } },
    ],
  }],
});
// 해당 프로필의 supports.vision === true 인 모델만 지원
```

### Tool Use (함수 호출)

```typescript
const response = await api.chat({
  messages: [{ role: "user", content: "서울 날씨 알려줘" }],
  tools: [{
    name: "get_weather",
    description: "도시의 현재 날씨를 반환합니다",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"]
    },
  }],
  toolChoice: "auto",  // "auto" | "none" | "required" | { type: "tool", name: "get_weather" }
});

if (response.stopReason === "tool_use") {
  for (const tc of response.toolCalls) {
    console.log(tc.name, tc.input);  // "get_weather", { city: "서울" }
    // 직접 실행 후 결과를 messages에 추가해 다음 turn 진행
  }
}
```

### ChatRequest / ChatResponse 타입

```typescript
interface ChatRequest {
  profileId?: string;  // 생략 시 isDefault chat 프로필 사용
  messages: GGAIChatMessage[];
  tools?: ToolDefPublic[];   // handler 없는 공개 툴 정의
  toolChoice?: "auto" | "none" | "required" | { type: "tool"; name: string };
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
}

interface ChatResponse {
  text: string;
  reasoning?: string;   // 사고 모델의 추론 과정 (없으면 생략)
  toolCalls: ToolCall[];
  stopReason: "end" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: { inputTokens: number; outputTokens: number };
  raw: unknown;
}
```

### ChatEvent 종류

| 이벤트 | 필드 | 설명 |
|---|---|---|
| `text-delta` | `delta: string` | 글자 스트리밍 |
| `tool-call-start` | `toolCallId`, `name` | 도구 호출 시작 |
| `tool-call-args-delta` | `toolCallId`, `delta` | 도구 인자 스트리밍 |
| `tool-call-end` | `toolCallId`, `name`, `input` | 도구 인자 완성 |
| `done` | `response: ChatResponse` | 완료 |
| `error` | `error: { message, code? }` | 오류 |

---

## 11. 이미지 생성 — `image()`

> NovelAI 이미지 프로필 전용. NAI v4.5 API 기준으로 구현됨.

```typescript
const result = await api.image({
  profileId: "my-nai-image-profile",  // ImageProfile ID (필수)
  prompt: "1girl, white dress, garden, masterpiece, best quality",
  negativePrompt: "lowres, bad anatomy, worst quality, blurry",
  // ↑ 프로필 기본 UC보다 우선 적용됨
  n: 1,  // 생성 장 수 (기본 1)
  paramsOverride: {
    width: 832,
    height: 1216,  // 세로형 해상도
    steps: 28,
    scale: 6.5,   // CFG guidance
    seed: 12345,  // 시드 고정 (재현용)
  },
  signal: controller.signal,
});

for (const img of result.images) {
  if (img.kind === "base64") {
    const src = `data:${img.mediaType};base64,${img.data}`;
    // <img> 태그에 표시하거나 Vault에 저장
  }
}
```

**결과를 Vault에 PNG로 저장:**
```typescript
const img = result.images[0];
if (img.kind === "base64") {
  const binary = atob(img.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  await this.app.vault.createBinary("generated/output.png", bytes.buffer);
}
```

**UC(네거티브 프롬프트) 우선순위:**  
`request.negativePrompt` > `ImageProfile.params.negativePrompt` > `""`

> ⚠️ `paramsOverride`에 `negative_prompt`를 직접 넣으면 NAI v4.5의 `v4_negative_prompt` 구조체가 갱신되지 않습니다. **UC 재지정은 반드시 `negativePrompt` 필드를 사용하세요.**

**ImageRequest:**
```typescript
interface ImageRequest {
  profileId: string;                // ImageProfile ID (필수)
  prompt: string;
  negativePrompt?: string;          // 런타임 UC 재지정
  size?: string;
  n?: number;                       // 생성 장 수 (기본 1)
  paramsOverride?: Record<string, unknown>; // NAI parameters 객체 snake_case 필드
  signal?: AbortSignal;
}
```

---

## 12. 음성 합성 — `tts()`

> ElevenLabs 음성 프로필 전용.

```typescript
const result = await api.tts({
  profileId: "my-elevenlabs-profile",
  text: "안녕하세요, 반갑습니다.",
  voice: "voice-id",  // 생략 시 프로필 기본값
  format: "mp3",      // "mp3" | "wav" | "opus"
});

// result.audio.data 는 base64 인코딩된 오디오 데이터
const audioBlob = base64ToBlob(result.audio.data, result.audio.mediaType);
const audio = new Audio(URL.createObjectURL(audioBlob));
audio.play();

function base64ToBlob(b64: string, type: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
```

---

## 13. 음성 인식 — `stt()`

```typescript
const result = await api.stt({
  profileId: "my-stt-profile",
  audio: { kind: "base64", mediaType: "audio/mp3", data: "<base64>" },
  language: "ko",  // 선택
});
console.log(result.text);  // 변환된 텍스트
```

---

## 14. 에이전트 런타임 — `agent()`

AI가 도구(함수)를 반복적으로 호출하며 복잡한 작업을 수행합니다. GGAI Core가 멀티턴 루프를 관리합니다.

```typescript
const tools: ToolDef[] = [
  {
    name: "read_note",
    description: "Obsidian 노트의 내용을 읽습니다",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "노트 경로 (예: folder/note.md)" }
      },
      required: ["path"]
    },
    handler: async (input: { path: string }, ctx) => {
      const file = ctx.app.vault.getAbstractFileByPath(input.path);
      if (!file || !("stat" in file)) {
        return { content: "파일을 찾을 수 없습니다", isError: true };
      }
      const text = await ctx.app.vault.read(file as TFile);
      return { content: text };
    }
  },
  {
    name: "write_note",
    description: "노트를 생성하거나 덮어씁니다",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"]
    },
    handler: async (input: { path: string; content: string }, ctx) => {
      const existing = ctx.app.vault.getAbstractFileByPath(input.path);
      if (existing && "stat" in existing) {
        await ctx.app.vault.modify(existing as TFile, input.content);
      } else {
        await ctx.app.vault.create(input.path, input.content);
      }
      return { content: `완료: ${input.path}` };
    }
  },
];

for await (const event of api.agent({
  profileId: "my-claude-profile",
  systemPrompt: "당신은 Obsidian 노트를 관리하는 조수입니다.",
  userMessage: "Daily/오늘.md 를 요약해서 Summary/요약.md 에 저장해줘",
  tools,
  maxTurns: 10,          // 최대 AI 응답 횟수 (기본 20)
  pluginId: "my-plugin", // 호출 주체 식별 (registerTool() 도구 자동 병합)
  signal: controller.signal,
})) {
  switch (event.type) {
    case "turn-start":
      console.log(`[턴 ${event.turn}] AI 응답 시작`);
      break;
    case "text-delta":
      process.stdout.write(event.delta);  // 실시간 출력
      break;
    case "tool-use-start":
      statusBar.setText(`실행 중: ${event.name}`);
      console.log("도구 입력:", event.input);
      break;
    case "tool-use-end":
      console.log(`완료 (${event.durationMs}ms)`, event.result);
      break;
    case "turn-end":
      console.log(`[턴 ${event.turn}] 종료. stopReason: ${event.stopReason}`);
      break;
    case "log":
      console.log(`[${event.from}]`, event.message);
      break;
    case "done":
      new Notice("완료");
      console.log("최종 답변:", event.finalText);
      console.log("사용 통계:", event.usage);
      // event.history: 전체 대화 기록 (GGAIChatMessage[])
      break;
    case "error":
      console.error(`오류 (턴 ${event.error.turn}):`, event.error.message);
      break;
  }
}
```

### AgentRequest

```typescript
interface AgentRequest {
  profileId: string;
  systemPrompt: string;
  userMessage: string | ContentBlock[];
  tools: ToolDef[];
  maxTurns?: number;              // 기본 20. 초과 시 error 이벤트
  maxToolCallsPerTurn?: number;   // 기본 10
  paramsOverride?: Record<string, unknown>;
  initialHistory?: GGAIChatMessage[];  // 이전 대화 이어받기
  pluginId?: string;              // 호출 주체 식별 (영구 등록 툴 병합용)
  signal?: AbortSignal;
}
```

### AgentEvent 종류

| 이벤트 | 필드 | 설명 |
|---|---|---|
| `turn-start` | `turn: number` | AI 새 응답 시작 |
| `text-delta` | `delta: string` | AI 글자 스트리밍 |
| `tool-use-start` | `toolCallId`, `name`, `input` | 도구 실행 직전 |
| `tool-use-end` | `toolCallId`, `result`, `durationMs` | 도구 실행 완료 |
| `turn-end` | `turn`, `stopReason` | 한 턴 완료 |
| `log` | `from`, `message` | `ctx.log()`로 보낸 디버그 메시지 |
| `done` | `finalText`, `history`, `usage` | 전체 완료 |
| `error` | `{ message, turn }` | 오류 또는 maxTurns 초과 |

**에이전트 런타임 루프 개요:**
```
초기화: history = [{ role: "system" }] + initialHistory + [{ role: "user" }]
for turn = 1..maxTurns:
    emit turn-start
    chatStream() 호출 → text-delta / tool-call-* 이벤트 전파
    history에 assistant 메시지 추가
    emit turn-end
    
    stopReason !== "tool_use" → break
    
    도구 병렬 실행 (Promise.all):
        emit tool-use-start
        handler(input, ctx) 실행
        emit tool-use-end
        history에 tool result 추가
    
    signal.aborted → emit error, break

emit done(finalText, history, usage)
```

**중요 제약:**
- 도구 실행은 기본 **병렬** (`Promise.all`)
- 각 핸들러는 `ctx.signal`을 확인해야 함 (취소 전파)
- `maxTurns` 초과 시 `done`이 아닌 `error` 발생

---

## 15. 도구 영구 등록 — `registerTool()`

플러그인이 항상 제공하는 도구를 미리 등록합니다. `agent()` 호출 시 `pluginId`가 일치하면 자동으로 도구 목록에 병합됩니다.

```typescript
// onload()에서 등록
const unregister = api.registerTool("my-plugin-id", {
  name: "create_note",
  description: "지정된 경로에 새 노트를 만듭니다",
  inputSchema: {
    type: "object",
    properties: {
      path:    { type: "string", description: "노트 경로" },
      content: { type: "string", description: "초기 내용" },
    },
    required: ["path", "content"]
  },
  handler: async (input: { path: string; content: string }, ctx) => {
    try {
      await ctx.app.vault.create(input.path, input.content);
      return { content: `생성 완료: ${input.path}` };
    } catch (e) {
      return { content: `실패: ${(e as Error).message}`, isError: true };
    }
  }
});

// onunload()에서 반드시 해제
onunload() {
  unregister();
}
```

### ToolDef / ToolContext / ToolResult

```typescript
interface ToolDef {
  name: string;
  description: string;            // AI가 읽을 도구 설명
  inputSchema: Record<string, unknown>; // JSON Schema draft-07
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

interface ToolContext {
  app: App;          // Obsidian App 인스턴스 (vault, workspace 등)
  pluginId: string;  // 도구를 등록한 플러그인 ID
  signal: AbortSignal; // 취소 신호. fetch 등에 전달할 것
  log: (msg: string) => void; // 에이전트 이벤트 스트림에 "log" 이벤트로 전파
}

// 성공
return { content: "작업 완료" };

// 성공 + 여러 블록
return {
  content: [
    { type: "text", text: "결과:" },
    { type: "text", text: JSON.stringify(data) },
  ]
};

// 실패
return { content: "파일을 찾을 수 없습니다", isError: true };
```

---

## 16. 토큰 수 계산 — `countTokens()`

API 호출 없이 동기적으로 근사 토큰 수를 계산합니다. 컨텍스트 패킹 루프 등 고빈도 호출에 최적화되어 있습니다.

```typescript
// 문자열
const n1 = api.countTokens("안녕하세요!");

// 메시지 배열
const n2 = api.countTokens([
  { role: "system",    content: "당신은 조수입니다." },
  { role: "user",      content: "이 문서를 요약해줘." },
  { role: "assistant", content: "네, 요약하겠습니다." },
]);

// 프로필 계수 적용 (더 정확)
const n3 = api.countTokens(messages, { profileId: "my-claude-profile" });

// provider/model 직접 지정
const n4 = api.countTokens(messages, { provider: "anthropic", model: "claude-sonnet-4-6" });

// 시스템 + 메시지 + 툴 구조
const n5 = api.countTokens({
  system: "당신은 조수입니다.",
  messages: [...],
  tools: [{ name: "read_file", description: "...", inputSchema: {...} }],
});
```

**컨텍스트 패킹 예시:**
```typescript
const budget = 100_000;
let used = api.countTokens(systemPrompt, { profileId });
const packed: string[] = [];

for (const paragraph of paragraphsNewestFirst) {
  const delta = api.countTokens(paragraph, { profileId });
  if (used + delta > budget) break;
  packed.push(paragraph);
  used += delta;
}
```

**정확도:** 실제 값 대비 평균 ±10% 내외. 네트워크·WASM·동적 로딩 없음. 1MB 문자열 기준 수 ms.

---

## 17. 이벤트 구독 — `on()`

```typescript
// 사용자가 프로필 추가/수정/삭제 시 알림
const unsubscribe = api.on("profiles-changed", () => {
  const updated = api.listProfiles("chat");
  refreshMyDropdown(updated);
});

// 플러그인 언로드 시 해제
onunload() {
  unsubscribe();
}
```

---

## 18. 진단 로그 — `getRequestLog()` / `getErrorLog()`

GGAI Core는 모든 프로바이더 요청을 내부적으로 기록합니다. 의존 플러그인은 이 로그를 읽어 "왜 생성이 실패했는가"를 사용자에게 보여주거나 디버깅 UI를 만들 수 있습니다. **API 키는 로그에도 포함되지 않습니다.**

### 요청 로그 요약 — `getRequestLog()`

```typescript
// 최신순 요약 목록 (body/response 원문 없음 — 토큰 절약)
const rows = api.getRequestLog(20);  // 최근 20건 (생략 시 전체)

for (const r of rows) {
  console.log(r.provider, r.model, r.phase, r.status);
  // phase: "request" | "response" | "error"
  console.log(`본문 ${r.bodyChars}자 / 응답 ${r.responseChars}자`);
}
```

```typescript
interface RequestLogSummary {
  id: string;
  createdAt: number;
  profileName: string;
  provider: string;
  model: string;
  transport: string;
  phase: "request" | "response" | "error";
  status?: number;         // HTTP 상태 코드
  error?: string;
  bodyChars: number;       // 원문 길이 (원문 조회 필요 여부 판단용)
  responseChars: number;
}
```

### 원문 절단 조회 — `getRequestLogEntry()`

요약에서 특정 로그의 `body` / `response` / `error` 원문이 필요하면, 절단 조회로 필요한 만큼만 가져옵니다. (전체 원문을 한 번에 문자열화하지 않아 대용량 응답에도 안전)

```typescript
const chunk = api.getRequestLogEntry(row.id, "response", { maxChars: 1500, offset: 0 });
if (chunk) {
  console.log(chunk.text);        // 잘라낸 조각
  console.log(chunk.totalChars);  // 원문 전체 길이 (페이지네이션용)
}
// 반환: { text: string; totalChars: number } | null
```

### 에러 전용 로그 — `getErrorLog()`

원인 분석의 기본 진입점입니다. 에러만 압축 저장되어 최신순으로 반환됩니다.

```typescript
const errors = api.getErrorLog(10);  // 최근 에러 10건
for (const e of errors) {
  new Notice(`생성 실패: ${e.provider}/${e.model}`);
}
```

> `getRequestLog()`는 요청/응답/에러 전 과정을, `getErrorLog()`는 실패만을 다룹니다. 사용자에게 "생성이 왜 안 됐는지" 안내하려면 `getErrorLog()`부터 보세요.

---

## 19. 타입 전체 참조

### GGAIApi (전체 인터페이스)

```typescript
interface GGAIApi {
  version: string;  // semver (예: "0.2.0")

  // 프로필 조회 (API 키 제외)
  listProfiles(kind?: "chat" | "text" | "image" | "voice"): PublicProfile[];
  getProfile(id: string): PublicProfile | null;

  // 생성
  generate(req: GenerateRequest): Promise<GenerateResponse>;  // chat/text 통합
  chat(req: ChatRequest): Promise<ChatResponse>;
  chatStream(req: ChatRequest): AsyncIterable<ChatEvent>;
  text(req: TextRequest): Promise<TextResponse>;    // NovelAI 전용
  image(req: ImageRequest): Promise<ImageResponse>; // NovelAI 전용
  tts(req: TTSRequest): Promise<TTSResponse>;       // ElevenLabs 전용
  stt(req: STTRequest): Promise<STTResponse>;

  // 에이전트
  agent(req: AgentRequest): AsyncIterable<AgentEvent>;

  // 도구 영구 등록
  registerTool(pluginId: string, tool: ToolDef): () => void;  // returns unregister

  // 진단 로그 (API 키 미포함)
  getRequestLog(limit?: number): RequestLogSummary[];
  getRequestLogEntry(
    id: string,
    field: "body" | "response" | "error",
    opts?: { maxChars?: number; offset?: number }
  ): { text: string; totalChars: number } | null;
  getErrorLog(limit?: number): ErrorLogEntry[];

  // 토큰 카운팅 (동기, 근사, 네트워크 없음)
  countTokens(
    input: string | GGAIChatMessage[] | { messages?: GGAIChatMessage[]; tools?: ToolDefPublic[]; system?: string },
    opts?: { profileId?: string } | { provider?: ProviderKind; model?: string }
  ): number;

  // 이벤트
  on(event: "profiles-changed", handler: () => void): () => void;  // returns unsubscribe
}
```

### ProviderKind

| 값 | 서비스 |
|---|---|
| `"anthropic"` | Anthropic (Claude) |
| `"openai"` | OpenAI (GPT, o-series) |
| `"google"` | Google (Gemini) |
| `"openai-compatible"` | Ollama, LM Studio, vLLM, LocalAI, DeepSeek, Kimi, Z.ai, OpenRouter, NanoGPT 등 |
| `"novelai"` | NovelAI (text + image) |
| `"elevenlabs"` | ElevenLabs (TTS) |

### GGAIChatMessage

```typescript
interface GGAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  toolCallId?: string;   // role="tool" 일 때 필수
  toolCalls?: ToolCall[]; // role="assistant" + tool_use 응답일 때
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source:
      | { kind: "base64"; mediaType: string; data: string }
      | { kind: "url"; url: string }
    };

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}
```

### ToolDefPublic

`ToolDef`에서 `handler`를 제거한 공개 버전. `ChatRequest.tools`에 전달할 때 사용합니다.

```typescript
interface ToolDefPublic {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
```

### TotalUsage (에이전트 완료 통계)

```typescript
interface TotalUsage {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;   // 실행된 도구 호출 수
  turns: number;       // 소비된 턴 수
}
```

---

## 20. 아키텍처 개요

### 소스 구조

```
src/
├── main.ts                   # Plugin 클래스 (진입점, 커맨드, UI)
├── api.ts                    # GGAIApi 팩토리 — 외부 진입점
├── types/
│   ├── profile.ts            # 프로필 타입 + toPublicProfile()
│   ├── chat.ts               # Chat/Text/Image/Voice 요청·응답 타입
│   ├── agent.ts              # AgentRequest, AgentEvent, TotalUsage
│   └── tool.ts               # ToolDef, ToolContext, ToolResult
├── data/
│   └── provider-params.ts    # 제공자별 샘플링 파라미터 지원표 + 호환 서비스 감지 + reasoning clamp
├── storage/
│   ├── profile-store.ts      # 프로필 CRUD + 이벤트 발행
│   └── secrets-vault.ts      # API 키 저장소 (apiKeyRef → 실제 키)
├── providers/
│   ├── base.ts               # ProviderAdapter 인터페이스
│   ├── anthropic.ts          # Anthropic SSE 어댑터
│   ├── openai.ts             # OpenAI + OpenAI-Compatible 어댑터
│   ├── google.ts             # Google Gemini 어댑터
│   ├── novelai.ts            # NovelAI text + image 어댑터
│   ├── elevenlabs.ts         # ElevenLabs TTS 어댑터
│   └── index.ts              # ProviderRegistry
├── services/
│   ├── generation-service.ts # 프로필 해결 + 어댑터 디스패치 + 활성 요청 관리
│   ├── agent-runtime.ts      # 멀티턴 루프 + 도구 병렬 실행
│   └── error-log.ts          # 에러 전용 압축 로그 (getErrorLog)
├── tokens/
│   └── counter.ts            # 동기 근사 토큰 카운터
├── api/
│   └── fetchModels.ts        # 프로바이더 모델 목록 조회
├── ui/
│   ├── settings-tab.ts       # 설정 탭 UI
│   ├── profile-modal.ts      # 프로필 추가/편집 모달
│   └── strings.ts            # UI 문자열 (ko/en)
└── util/
    └── (공용 유틸리티)
```

### 데이터 저장 구조 (data.json)

```json
{
  "ggai_profiles": [ /* GGAIModelProfile[] */ ],
  "ggai_secrets": { "ref-uuid": "actual-api-key" },
  "ggai_settings": {
    "requestTimeoutMs": 120000,
    "defaultMaxTurns": 20,
    "logRequests": false,
    "uiLanguage": "ko"
  }
}
```

- `ggai_` 접두어로 다른 플러그인의 `data.json` 키와 충돌 방지
- `persist()` 시 기존 데이터를 읽어 병합 후 저장 (다른 플러그인 데이터 보존)
- 프로필과 시크릿은 분리 저장 — 프로필을 공유해도 API 키는 노출되지 않음

### Provider Adapter 계약

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

// GenerationService가 어댑터에 넘기는 내부 호출 컨텍스트
interface ResolvedCall<TReq> {
  profile: GGAIModelProfile;
  apiKey: string;
  request: TReq;
  signal: AbortSignal;
  log?: (event: RequestLogEvent) => void;  // 요청/응답/에러 로그 이벤트
}
```

**프로바이더별 포맷 차이:**

| 개념 | Anthropic | OpenAI | Google |
|---|---|---|---|
| system | 최상위 `system` 필드 | `messages[0].role='system'` | `systemInstruction` |
| 이미지 | `content[].type='image'` | `content[].type='image_url'` | `inlineData` |
| 스트리밍 | SSE `content_block_delta` | SSE `delta.content` | SSE candidates |
| tool 정의 | `input_schema` | `function.parameters` | `functionDeclarations[].parameters` |
| tool result | `type='tool_result'` | `role='tool'` + `tool_call_id` | `functionResponse` |

---

## 21. 자주 묻는 질문 (개발자)

**Q. `generate()`에 system 프롬프트를 넣으려면?**  
A. `generate()`는 단순 생성 전용이라 system 프롬프트를 지원하지 않습니다. `chat()`에 `messages: [{ role: "system", ... }, { role: "user", ... }]`를 넣어 직접 호출하세요.

**Q. `chat()`에서 `profileId`를 생략하면?**  
A. `isDefault: true`인 chat 프로필이 자동 선택됩니다. 기본 프로필이 없으면 오류가 발생합니다.

**Q. 스트리밍 도중 오류 처리는?**  
A. `for await` 루프에서 `event.type === "error"`를 처리하거나 루프 전체를 `try/catch`로 감싸면 됩니다.

**Q. `registerTool()`로 등록한 도구와 `agent()` 호출 시 `tools` 배열이 겹치면?**  
A. `agent()` 호출 시 `pluginId`가 일치하는 영구 등록 도구가 `tools` 배열에 병합됩니다. 이름이 같으면 `agent()` 인자의 도구가 우선합니다.

**Q. 이미지 블록 첨부는 어떤 모델에서 가능한가요?**  
A. `ChatProfile.supports.vision === true`인 모델만 지원합니다. `api.getProfile(id)`로 조회 후 확인하세요.

**Q. 플러그인 언로드 시 진행 중인 요청은?**  
A. GGAI Core `onunload()`에서 `generation.cancelAll()` + `agentRuntime.cancelAll()`이 호출됩니다. 단, 내 플러그인이 직접 관리하는 `AbortController`는 직접 abort 해야 합니다.

**Q. 로컬 모델(Ollama)에 tool use가 안 되는데?**  
A. 모델이 tool use를 지원하지 않으면 `ChatProfile.supports.tools`가 `false`여야 합니다. 프로필 편집에서 확인하세요. 지원하더라도 모델별로 호환성이 다를 수 있습니다.

**Q. 정확한 토큰 수가 필요한 경우는?**  
A. Anthropic은 `POST /v1/messages/count_tokens`, Google은 `models/{m}:countTokens` 엔드포인트를 직접 호출하세요. `countTokens()`는 근사값(±10%)이며 고빈도 루프용입니다.
