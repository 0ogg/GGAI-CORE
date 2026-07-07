# GGAI Core — 플러그인 개발자 API 가이드

> **대상**: GGAI Core를 의존 플러그인으로 사용하는 Obsidian 플러그인 개발자  
> **난이도**: 기초적인 TypeScript 지식이 있으면 충분합니다

---

## 목차

1. [시작하기 — API 얻는 법](#1-시작하기--api-얻는-법)
2. [프로필 목록 조회](#2-프로필-목록-조회)
3. [채팅 — 가장 기본적인 AI 호출](#3-채팅--가장-기본적인-ai-호출)
4. [스트리밍 채팅 — 실시간으로 글자 받기](#4-스트리밍-채팅--실시간으로-글자-받기)
5. [텍스트 생성 — generate() 통합 메서드](#5-텍스트-생성--generate-통합-메서드)
6. [이미지 생성 — 프롬프트와 UC](#6-이미지-생성--프롬프트와-uc)
7. [음성 합성 (TTS)](#7-음성-합성-tts)
8. [에이전트 — AI가 도구를 사용해 작업 수행](#8-에이전트--ai가-도구를-사용해-작업-수행)
9. [도구 등록 — 에이전트가 쓸 수 있는 기능 추가](#9-도구-등록--에이전트가-쓸-수-있는-기능-추가)
10. [토큰 수 계산](#10-토큰-수-계산)
11. [프로필 변경 감지](#11-프로필-변경-감지)
12. [타입 전체 참조](#12-타입-전체-참조)

---

## 1. 시작하기 — API 얻는 법

Obsidian 공식 플러그인 시스템을 통해 API를 가져오는 것이 권장 방법입니다.

```typescript
import type { GGAIApi } from "obsidian-ggai-core";

// ✅ 권장: Obsidian 플러그인 레지스트리 경유
function getGGAI(app: App): GGAIApi | null {
  const plugin = (app as any).plugins?.plugins?.["ggai-core"];
  return (plugin?.api as GGAIApi) ?? null;
}

// 내 플러그인의 onload() 안에서:
const api = getGGAI(this.app);
if (!api) {
  console.warn("GGAI Core가 로드되지 않았습니다.");
  return;
}
```

> **팁**: `manifest.json`의 `dependencies`에 `obsidian-ggai-core`를 추가하면  
> GGAI Core가 먼저 로드됨이 보장됩니다.

> **주의**: `window.GGAICorePlugin`으로도 접근할 수 있지만, Obsidian 플러그인 생명주기와 분리된 경로이므로 `app.plugins` 방식을 사용하세요.

---

## 2. 프로필 목록 조회

사용자가 설정해 둔 AI 모델 프로필 목록을 가져옵니다.  
각 프로필은 "어떤 AI 모델을, 어떤 설정으로 쓸 것인지"를 담고 있습니다.

```typescript
// 모든 프로필
const all = api.listProfiles();

// 종류별 필터링
const chatProfiles  = api.listProfiles("chat");   // 채팅용
const textProfiles  = api.listProfiles("text");   // 텍스트 완성용 (NovelAI)
const imageProfiles = api.listProfiles("image");  // 이미지 생성용
const voiceProfiles = api.listProfiles("voice");  // 음성 합성용

// 특정 ID로 프로필 가져오기
const profile = api.getProfile("some-profile-id");
if (profile) {
  console.log(profile.name);     // 사용자 지정 이름
  console.log(profile.provider); // "anthropic" | "openai" | "google" | ...
  console.log(profile.model);    // "claude-sonnet-4-6" 같은 모델 ID
}
```

**ProfileKind 값 설명**

| 값 | 설명 |
|---|---|
| `"chat"` | 일반 대화형 AI (Anthropic, OpenAI, Google 등) |
| `"text"` | 텍스트 이어쓰기 (NovelAI 전용) |
| `"image"` | 이미지 생성 (NovelAI 전용) |
| `"voice"` | 음성 합성 (ElevenLabs 전용) |

---

## 3. 채팅 — 가장 기본적인 AI 호출

AI에게 메시지를 보내고 답변을 받습니다. 답변이 완성될 때까지 기다립니다.

```typescript
const response = await api.chat({
  // profileId를 생략하면 사용자가 기본값으로 설정한 프로필이 사용됩니다
  profileId: "my-profile-id",

  messages: [
    { role: "system",    content: "당신은 친절한 조수입니다." },
    { role: "user",      content: "오늘 날씨가 어때요?" },
  ],
});

console.log(response.text);           // AI의 답변 텍스트
console.log(response.stopReason);     // "end" | "max_tokens" | "tool_use" | "stop_sequence"
console.log(response.usage.inputTokens);  // 입력 토큰 수
console.log(response.usage.outputTokens); // 출력 토큰 수
```

### 취소 지원

오래 걸리는 요청을 중간에 취소하려면 `AbortController`를 사용합니다.

```typescript
const controller = new AbortController();

// 3초 후 취소
setTimeout(() => controller.abort(), 3000);

try {
  const response = await api.chat({
    messages: [{ role: "user", content: "긴 이야기를 써줘" }],
    signal: controller.signal,
  });
} catch (e) {
  if ((e as { code?: string }).code === "cancelled") console.log("취소됨");
}
```

**취소 판별은 `e.code === "cancelled"`로 하세요. `e.name === "AbortError"`에 의존하지 마세요.**
일부 어댑터(Obsidian `requestUrl` 기반)는 네이티브 `AbortSignal`을 지원하지 않아 취소 시 다른 형태의 에러를 던질 수 있습니다.
core는 요청에 넘긴 `signal`(또는 core 자체의 타임아웃/전체 취소)로 인해 실패한 모든 경우를 어댑터 구현과 무관하게 `code: "cancelled"`로 정규화해서 던집니다. 이 계약은 다음 세 경로 모두에 동일하게 적용됩니다:

- `chat()` / `text()` / `image()` / `tts()` / `stt()` / `generate()`: reject된 에러 객체의 `.code === "cancelled"`
- `chatStream()`: 이벤트로 소비 중이면 `for await` 루프 자체가 취소된 에러를 던집니다 (동일하게 `.code === "cancelled"`로 catch). 비스트리밍 폴백 프로필에서는 `{ type: "error", error: { code: "cancelled", message } }` 이벤트로 전달됩니다.
- `agent()`: `{ type: "error", error: { code: "cancelled", message, turn } }` 이벤트로 전달됩니다.

**여러 개의 대기 중인 생성을 한 번에 취소하려면**, 기능 단위로 `AbortController` 하나를 만들어 그 `signal`을 관련된 모든 요청에 전달하세요. 취소 시 `controller.abort()` 한 번으로 해당 기능이 물고 있는 모든 요청이 즉시 실패하며, 각 호출부는 `code === "cancelled"`를 보고 버튼 상태를 원래대로 되돌리면 됩니다.

```typescript
class MyFeature {
  private controller: AbortController | null = null;

  async run() {
    this.controller = new AbortController();
    this.setButtonState("generating");
    try {
      const [a, b] = await Promise.all([
        api.chat({ messages: [...], signal: this.controller.signal }),
        api.image({ profileId, prompt, signal: this.controller.signal }),
      ]);
      // ...
    } catch (e) {
      if ((e as { code?: string }).code === "cancelled") {
        // 사용자가 취소함 — 에러 알림 없이 조용히 버튼만 복구
      } else {
        // 진짜 실패 — 에러 표시
      }
    } finally {
      this.setButtonState("idle");
      this.controller = null;
    }
  }

  cancel() {
    this.controller?.abort();
  }
}
```

> 참고: core 설정 화면의 "모든 요청 취소" 버튼이나 요청 타임아웃도 내부적으로 같은 `signal`을 abort시키므로, 사용자가 core에서 전체 취소를 눌러도 위 로직이 동일하게 동작합니다.

### GGAIChatMessage 구조

```typescript
// 텍스트 메시지
{ role: "user", content: "안녕하세요" }

// 이미지 + 텍스트 (멀티모달, vision 지원 모델만)
{
  role: "user",
  content: [
    { type: "text", text: "이 이미지를 설명해줘" },
    { type: "image", source: { kind: "url", url: "https://..." } },
    // 또는 base64:
    { type: "image", source: { kind: "base64", mediaType: "image/png", data: "iVBOR..." } },
  ]
}
```

---

## 4. 스트리밍 채팅 — 실시간으로 글자 받기

AI의 답변을 한 글자씩 받아 화면에 바로 표시할 수 있습니다.

```typescript
let fullText = "";

for await (const event of api.chatStream({ messages: [{ role: "user", content: "시를 써줘" }] })) {
  if (event.type === "text-delta") {
    // 새 글자가 도착할 때마다 실행
    fullText += event.delta;
    myElement.setText(fullText); // UI 실시간 업데이트
  }

  if (event.type === "done") {
    // 스트리밍 완료
    console.log("완료. 총 토큰:", event.response.usage.outputTokens);
  }

  if (event.type === "error") {
    console.error("오류:", event.error.message);
  }
}
```

**ChatEvent 종류**

| 이벤트 타입 | 언제 발생하나 | 중요 필드 |
|---|---|---|
| `text-delta` | 글자가 올 때마다 | `delta: string` |
| `tool-call-start` | AI가 도구를 호출하기 시작할 때 | `toolCallId`, `name` |
| `tool-call-args-delta` | 도구 인자가 스트리밍될 때 | `toolCallId`, `delta` |
| `tool-call-end` | 도구 호출 인자 완성 | `toolCallId`, `name`, `input` |
| `done` | 스트리밍 완료 | `response: ChatResponse` |
| `error` | 오류 발생 | `error.message`, `error.code` (취소 시 `"cancelled"`) |

---

## 5. 텍스트 생성 — `generate()` 통합 메서드

> **chat 프로필과 text 프로필을 구분 없이 쓰는 가장 간편한 텍스트 생성 방법입니다.**  
> `profileId`를 생략하면 사용자가 기본값으로 설정한 chat 또는 text 프로필이 자동 선택됩니다.

사용자 입장에서는 chat 모델(GPT, Claude 등)이나 text completion 모델(NovelAI)을 각각 프로필로 설정해 두고,  
플러그인 입장에서는 둘 중 어느 쪽인지 신경 쓰지 않고 동일한 호출로 생성할 수 있습니다.

```typescript
// 가장 단순한 호출 — 기본 프로필 자동 선택
const result = await api.generate({
  prompt: "조선시대 과거 시험을 한 줄로 설명해줘",
});
console.log(result.text);
```

### 특정 프로필 지정

```typescript
// chat 프로필 ID를 지정하거나
const result = await api.generate({
  profileId: "claude-profile-uuid",
  prompt: "...",
});

// text(NovelAI) 프로필 ID를 지정해도 동일하게 동작
const result2 = await api.generate({
  profileId: "nai-text-profile-uuid",
  prompt: "...",
});
```

내부적으로 프로필 `kind`를 자동 감지합니다:
- `kind: "text"` → `text()` 경로로 직접 전달 (NAI text completion)
- `kind: "chat"` → `messages: [{ role: "user", content: prompt }]`로 래핑 후 `chat()` 경로

> **주의**: `prompt` 문자열은 파싱되지 않습니다. `"User: ...\nAssistant: ..."` 같은 형식을 넣어도 role 구분 없이 통째로 하나의 user 메시지로 전달됩니다. role 구조가 필요하면 `chat()`에 `messages` 배열을 직접 전달하세요.

### 파라미터 재지정

```typescript
const result = await api.generate({
  prompt: "단편 소설 도입부를 써줘",
  paramsOverride: { temperature: 1.2, maxTokens: 500 },
});
```

### 샘플링 파라미터 게이트 (`allowedParams`)

chat / text 프로필에는 `allowedParams: { topK?, topP?, minP? }`가 노출됩니다. 사용자가 프로필 설정에서 체크한 키만 `paramsOverride`로 받아 모델로 전송됩니다.

- `temperature`, `maxTokens`는 게이트 대상이 아니며 항상 허용됩니다.
- 체크 해제된 키(`topK` / `topP` / `minP`)는 `paramsOverride`에 채워서 보내도 코어가 조용히 제거합니다.
- 프로필 자체에 입력해 둔 값도 게이트가 닫혀 있으면 모델로 전송되지 않습니다.
- 레거시 프로필(`allowedParams`가 없는 경우)은 모두 허용으로 취급됩니다.

```typescript
const profile = api.getProfile(profileId);
// 어떤 키를 보내도 안전한지 미리 확인하고 paramsOverride 구성
const allowed = profile?.kind === "chat" || profile?.kind === "text"
  ? profile.allowedParams ?? { topK: true, topP: true, minP: true }
  : undefined;

await api.chat({
  profileId,
  messages,
  paramsOverride: {
    temperature: 0.8,                         // 항상 허용
    ...(allowed?.topP ? { topP: 0.9 } : {}), // 체크된 경우만 의미 있음
  },
});
```

### chat vs generate 선택 기준

| 상황 | 권장 메서드 |
|---|---|
| 단순 프롬프트 → 텍스트 한 번 생성 | `generate()` |
| 멀티턴 대화 (히스토리 유지) | `chat()` |
| system 프롬프트 필요 | `chat()` |
| tool use, vision | `chat()` |
| chat/text 프로필 어느 것이든 수용 | `generate()` |

---

## 6. 이미지 생성 — 프롬프트와 UC

> **프롬프트(prompt)와 UC(Undesired Content, 네거티브 프롬프트)는 이미지 생성에서 가장 자주 바뀌는 값입니다.**  
> 두 값 모두 요청마다 동적으로 전달할 수 있고, 프로필에 저장된 기본값보다 우선 적용됩니다.

### 기본 호출

```typescript
const result = await api.image({
  profileId: "my-novelai-image-profile",  // ImageProfile ID (필수)
  prompt: "1girl, white dress, garden, masterpiece, best quality",
});

for (const img of result.images) {
  if (img.kind === "base64") {
    const src = `data:${img.mediaType};base64,${img.data}`;
    // <img src={src}> 에 표시하거나 Vault에 저장
  }
}
```

### UC(네거티브 프롬프트) 동적 지정

```typescript
const result = await api.image({
  profileId: "my-novelai-image-profile",
  prompt: "1girl, white dress, masterpiece",
  negativePrompt: "lowres, bad anatomy, worst quality, blurry",
  // ↑ 이 요청에서만 프로필 기본 UC를 덮어씁니다
});
```

**UC 우선순위**: `request.negativePrompt` > `ImageProfile.params.negativePrompt` > `""(빈 문자열)`

권장 패턴: 프로필에 항상 쓰는 공통 UC를 저장해두고, 요청 시 씬에 맞는 UC로 덮어씁니다.

```typescript
// 프로필 기본 UC: "lowres, worst quality, jpeg artifacts"
// 특정 씬에만 추가 UC가 필요한 경우
const result = await api.image({
  profileId: "nai-image-uuid",
  prompt: "city background, night scene, neon lights",
  negativePrompt: "lowres, worst quality, jpeg artifacts, people, characters",
});
```

> **주의**: `paramsOverride`에 `negative_prompt`를 직접 넣으면 NAI API의 `v4_negative_prompt` 구조체는 갱신되지 않습니다.  
> **UC 재지정은 반드시 `negativePrompt` 필드를 사용하세요.**

### 해상도 / 샘플링 등 그 외 파라미터 재지정

자주 바뀌지 않는 파라미터는 `paramsOverride`로 전달합니다.  
키는 NAI API `parameters` 객체의 snake_case 필드명 기준입니다.

```typescript
const result = await api.image({
  profileId: "nai-image-uuid",
  prompt: "landscape, wide shot, mountains",
  negativePrompt: "people, characters, text",
  paramsOverride: {
    width: 1216,
    height: 832,     // 가로형 해상도로 변경
    steps: 20,
    scale: 6.0,
    seed: 12345678,  // 시드 고정 (재현용)
  },
});
```

### 여러 장 동시 생성

```typescript
const result = await api.image({
  profileId: "nai-image-uuid",
  prompt: "1girl, various poses",
  n: 4,  // 4장 동시 생성
});
// result.images.length === 4
```

### 결과를 Vault에 PNG로 저장하는 예시

```typescript
const result = await api.image({ profileId: "...", prompt: "..." });
const img = result.images[0];
if (img.kind === "base64") {
  const binary = atob(img.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  await this.app.vault.createBinary("generated/output.png", bytes.buffer);
}
```

---

## 7. 음성 합성 (TTS)

ElevenLabs 음성 프로필을 사용해 텍스트를 음성으로 변환합니다.

```typescript
const result = await api.tts({
  profileId: "my-elevenlabs-profile",
  text: "안녕하세요, 반갑습니다.",
  // voice: "voice-id",  // 생략 시 프로필 기본값 사용
  // format: "mp3",      // "mp3" | "wav" | "opus"
});

// result.audio.data 는 base64 인코딩된 오디오 데이터
const audioBlob = base64ToBlob(result.audio.data, result.audio.mediaType);
const audio = new Audio(URL.createObjectURL(audioBlob));
audio.play();
```

---

## 8. 에이전트 — AI가 도구를 사용해 작업 수행

에이전트는 AI가 도구(함수)를 자유롭게 호출하면서 복잡한 작업을 처리합니다.  
AI가 필요한 도구를 여러 번 호출하며 스스로 문제를 해결합니다.

```typescript
const tools = [
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
      const file = ctx.app.vault.getFileByPath(input.path);
      if (!file) return { content: "파일을 찾을 수 없습니다", isError: true };
      const text = await ctx.app.vault.read(file);
      return { content: text };
    }
  }
];

for await (const event of api.agent({
  profileId: "my-chat-profile",
  systemPrompt: "당신은 Obsidian 노트를 분석하는 조수입니다.",
  userMessage: "프로젝트 폴더의 모든 노트를 요약해줘",
  tools,
  maxTurns: 10,          // AI가 최대 몇 번 대화를 이어갈지 (기본 20)
  pluginId: "my-plugin", // registerTool()로 등록한 도구가 자동 병합됨
})) {
  switch (event.type) {
    case "turn-start":
      console.log(`턴 ${event.turn} 시작`);
      break;

    case "text-delta":
      process.stdout.write(event.delta); // AI 답변 실시간 출력
      break;

    case "tool-use-start":
      console.log(`도구 호출: ${event.name}`, event.input);
      break;

    case "tool-use-end":
      console.log(`도구 완료 (${event.durationMs}ms)`);
      break;

    case "done":
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

**AgentEvent 종류**

| 이벤트 타입 | 설명 |
|---|---|
| `turn-start` | AI가 새 응답 생성 시작 |
| `text-delta` | AI 글자 스트리밍 |
| `tool-use-start` | AI가 도구 호출 (실행 전) |
| `tool-use-end` | 도구 실행 완료 + 결과 |
| `turn-end` | 한 턴 완료 |
| `log` | 디버그 로그 |
| `done` | 전체 작업 완료 |
| `error` | 오류 발생 (`error.code === "cancelled"`이면 취소로 인한 것) |

---

## 9. 도구 등록 — 에이전트가 쓸 수 있는 기능 추가

내 플러그인의 기능을 "도구"로 등록하면, `agent()` 호출 시 `pluginId`를 함께 전달할 때 자동으로 병합됩니다.  
등록된 도구는 플러그인이 언로드될 때까지 유지됩니다.

```typescript
// 플러그인 onload()에서 등록
const unregister = api.registerTool("my-plugin-id", {
  name: "create_note",
  description: "지정된 경로에 새 노트를 만듭니다",
  inputSchema: {
    type: "object",
    properties: {
      path:    { type: "string", description: "생성할 경로 (예: folder/note.md)" },
      content: { type: "string", description: "노트 내용" },
    },
    required: ["path", "content"]
  },
  handler: async (input: { path: string; content: string }, ctx) => {
    try {
      await ctx.app.vault.create(input.path, input.content);
      return { content: `노트 생성 완료: ${input.path}` };
    } catch (e) {
      return { content: `생성 실패: ${e.message}`, isError: true };
    }
  }
});

// 플러그인 onunload()에서 해제
onunload() {
  unregister();
}
```

**ToolContext** — `handler`의 두 번째 인자로 제공되는 컨텍스트

| 필드 | 타입 | 설명 |
|---|---|---|
| `app` | `App` | Obsidian App 인스턴스 (vault, workspace 등 접근 가능) |
| `pluginId` | `string` | 도구를 등록한 플러그인 ID |
| `signal` | `AbortSignal` | 요청이 취소되면 발생. fetch 등에 전달할 것 |
| `log` | `(msg: string) => void` | 에이전트 로그 출력 함수 |

**ToolResult** — `handler`의 반환값

```typescript
// 성공
return { content: "작업 완료" };

// 성공 + 여러 블록
return {
  content: [
    { type: "text", text: "분석 결과:" },
    { type: "text", text: JSON.stringify(data) },
  ]
};

// 실패
return { content: "파일을 찾을 수 없습니다", isError: true };
```

---

## 10. 토큰 수 계산

API를 실제로 호출하지 않고도 입력 토큰 수를 추정합니다.  
컨텍스트 창 초과 여부를 미리 확인하거나, 긴 문서를 잘라낼 때 유용합니다.

> 정확도: 실제 값 대비 평균 ±10% 내외입니다.

```typescript
// 문자열 하나
const tokens = api.countTokens("안녕하세요!");

// 메시지 배열
const tokens = api.countTokens([
  { role: "system",    content: "당신은 조수입니다." },
  { role: "user",      content: "이 문서를 요약해줘." },
  { role: "assistant", content: "네, 요약하겠습니다." },
]);

// 특정 프로필의 계수 사용 (더 정확함)
const tokens = api.countTokens(messages, { profileId: "my-profile-id" });

// provider/model 직접 지정
const tokens = api.countTokens(messages, { provider: "anthropic", model: "claude-sonnet-4-6" });

console.log(`입력 토큰: ${tokens}`);
```

---

## 11. 프로필 변경 감지

사용자가 설정에서 프로필을 추가/수정/삭제하면 알림을 받습니다.

```typescript
const unsubscribe = api.on("profiles-changed", () => {
  // 프로필 목록을 다시 불러와 UI 갱신
  const updated = api.listProfiles("chat");
  refreshMyProfileDropdown(updated);
});

// 플러그인 언로드 시 구독 해제
onunload() {
  unsubscribe();
}
```

---

## 12. 타입 전체 참조

### GGAIApi (전체 인터페이스)

```typescript
interface GGAIApi {
  version: string;

  // 프로필
  listProfiles(kind?: "chat" | "text" | "image" | "voice"): PublicProfile[];
  getProfile(id: string): PublicProfile | null;

  // 생성
  generate(req: GenerateRequest): Promise<GenerateResponse>; // chat/text 통합
  chat(req: ChatRequest): Promise<ChatResponse>;
  chatStream(req: ChatRequest): AsyncIterable<ChatEvent>;
  text(req: TextRequest): Promise<TextResponse>;        // NovelAI 전용
  image(req: ImageRequest): Promise<ImageResponse>;     // NovelAI 전용
  tts(req: TTSRequest): Promise<TTSResponse>;           // ElevenLabs 전용
  stt(req: STTRequest): Promise<STTResponse>;

  // 에이전트
  agent(req: AgentRequest): AsyncIterable<AgentEvent>;

  // 도구
  registerTool(pluginId: string, tool: ToolDef): () => void;

  // 유틸리티
  countTokens(input: CountTokensInput, opts?: { profileId?: string } | CountTokensOptions): number;
  on(event: "profiles-changed", handler: () => void): () => void;
}
```

### GenerateRequest / GenerateResponse

```typescript
interface GenerateRequest {
  profileId?: string;               // chat 또는 text 프로필. 생략 시 isDefault 자동 선택
  prompt: string;
  paramsOverride?: Record<string, unknown>;
  signal?: AbortSignal;
}
interface GenerateResponse {
  text: string;
  raw: unknown;
}
```

### ImageRequest

```typescript
interface ImageRequest {
  profileId: string;                // ImageProfile ID (필수)
  prompt: string;
  negativePrompt?: string;          // UC 런타임 재지정. 프로필 기본값보다 우선 적용
  size?: string;
  n?: number;                       // 생성할 이미지 장 수 (기본 1)
  paramsOverride?: Record<string, unknown>; // NAI parameters snake_case 필드
  signal?: AbortSignal;
}
```

### PublicProfile

API Key는 노출되지 않습니다. 프로필의 공개 정보만 포함됩니다.

```typescript
// 공통 필드
{
  id: string;        // 내부 UUID
  name: string;      // 사용자 지정 이름
  kind: ProfileKind; // "chat" | "text" | "image" | "voice"
  provider: ProviderKind;
  model: string;     // 모델 ID (예: "claude-sonnet-4-6")
  baseUrl?: string;
  createdAt: number;
  updatedAt: number;
}
```

### ProviderKind

| 값 | AI 서비스 |
|---|---|
| `"anthropic"` | Anthropic (Claude) |
| `"openai"` | OpenAI (GPT) |
| `"google"` | Google (Gemini) |
| `"openai-compatible"` | Ollama, LM Studio, LocalAI, vLLM 등 |
| `"novelai"` | NovelAI |
| `"elevenlabs"` | ElevenLabs |

### CountTokensInput

```typescript
type CountTokensInput =
  | string                      // 단순 문자열
  | GGAIChatMessage[]           // 메시지 배열
  | {
      messages: GGAIChatMessage[];
      system?: string;
      tools?: ToolDefPublic[];
    };
```

---

## 자주 묻는 질문

**Q. `generate()`와 `chat()`의 차이는 무엇인가요?**  
A. `generate()`는 단순 `prompt: string` 입력만 받고, chat/text 프로필 어느 쪽이든 자동으로 처리합니다. 멀티턴 대화·system 프롬프트·tool use가 필요하면 `chat()`을 사용하세요.

**Q. `generate()`에 chat 프로필을 지정하면 system 프롬프트를 어떻게 넣나요?**  
A. `generate()`는 단순 생성 전용이라 system 프롬프트를 지원하지 않습니다. system 프롬프트가 필요하면 `chat()`에 `messages: [{ role: "system", ... }, { role: "user", ... }]`를 넣어 직접 호출하세요.

**Q. `api.chat()`에서 profileId를 생략하면 어떻게 되나요?**  
A. 사용자가 기본값(isDefault=true)으로 설정한 채팅 프로필이 자동으로 사용됩니다. 기본 프로필이 없으면 오류가 발생합니다.

**Q. 플러그인이 언로드되면 등록한 도구는 어떻게 되나요?**  
A. `registerTool()`이 반환하는 `unregister` 함수를 `onunload()`에서 호출해야 합니다. 호출하지 않으면 도구가 계속 등록된 상태로 남습니다.

**Q. 스트리밍 도중 오류가 나면 어떻게 처리하나요?**  
A. `for await` 루프 내에서 `event.type === "error"` 이벤트를 처리하거나, 루프 전체를 `try/catch`로 감싸면 됩니다.

**Q. 이미지나 파일을 메시지에 첨부하려면?**  
A. `GGAIChatMessage`의 `content`를 배열로 만들고 `{ type: "image", source: ... }` 블록을 넣으면 됩니다. 해당 모델의 `supports.vision`이 `true`여야 합니다.
