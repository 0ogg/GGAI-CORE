// ─── Generation Service ───
// 프로필 해결 + 어댑터 디스패치. 취소 컨트롤러 중앙 관리.

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
import type { ChatProfile, GGAIModelProfile, TextProfile } from "../types/profile.ts";
import type { ProfileStore } from "../storage/profile-store.ts";
import type { SecretsVault } from "../storage/secrets-vault.ts";
import type { ProviderRegistry } from "../providers/index.ts";
import type { ResolvedCall, RequestLogEvent } from "../providers/base.ts";
import { gateProfile, gateParamsOverride } from "../util/allowed-params.ts";
import { countTokens } from "../tokens/counter.ts";
import type { RequestLogStore } from "./request-log.ts";
import type { ErrorLogStore, GenerationOutcome } from "./error-log.ts";

type Transport = RequestLogEvent["transport"];

/** 생성 결과 요약 — recordGen()에 전달 */
interface GenOutcome {
  outcome: GenerationOutcome;
  message?: string;
  status?: number;
  url?: string;
}

/** provider 에러 로그에서 뽑아둔 부가 정보(HTTP 상태/URL) 보관용 */
interface ErrorMeta {
  status?: number;
  url?: string;
}

export interface GGAISettings {
  requestTimeoutMs: number;
  defaultMaxTurns: number;
  logRequests: boolean;
  uiLanguage: "ko" | "en";
  // apiKeyRef -> 직렬화 여부. true인 ref는 같은 키를 공유하는 모든 프로필의
  // 요청을 한 번에 하나씩 순차 실행(429 방지).
  serialQueueRefs?: Record<string, boolean>;
}

export interface ActiveTask {
  id: number;
  model: string;
  /** 요청을 유발한 기능 이름(예: "번역"). 요청에 label이 있을 때만 채워진다. */
  label?: string;
}

/**
 * 취소(사용자 signal.abort() 또는 core의 cancel()/cancelAll()/타임아웃)로 인한
 * 실패임을 어댑터 구현에 상관없이 일관되게 알리기 위한 에러.
 * Obsidian requestUrl 기반 어댑터는 네이티브 AbortError를 던지지 못하는 경우가 있어
 * (openai.ts 참고) `e.name === "AbortError"` 체크에 의존할 수 없다.
 * 호출자는 `code === "cancelled"` 로 판별한다.
 */
export class GGAICancelledError extends Error {
  readonly code = "cancelled" as const;
  constructor(message = "요청이 취소되었습니다") {
    super(message);
    this.name = "GGAICancelledError";
  }
}

/** signal이 abort된 상태에서 발생한 에러를 GGAICancelledError로 정규화한다. */
function normalizeError(e: unknown, signal: AbortSignal): unknown {
  return signal.aborted ? new GGAICancelledError() : e;
}

type GenerationEvent = "active-changed";

export class GenerationService {
  private active: Map<number, { ctrl: AbortController; model: string; label?: string }> = new Map();
  private nextId = 1;
  private logRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  private handlers: Map<GenerationEvent, Set<() => void>> = new Map();
  // apiKeyRef별 직렬화 큐의 꼬리 Promise. 같은 키의 요청을 FIFO로 한 개씩 실행.
  private queueTails: Map<string, Promise<void>> = new Map();

  constructor(
    private profiles: ProfileStore,
    private secrets: SecretsVault,
    private providers: ProviderRegistry,
    private settings: GGAISettings,
    private requestLogs: RequestLogStore,
    private errorLogs?: ErrorLogStore
  ) {}

  cancelAll(): void {
    for (const { ctrl } of this.active.values()) ctrl.abort();
    this.active.clear();
    this.emit("active-changed");
  }

  /** 단일 활성 요청만 취소. id가 없으면 무시. */
  cancel(id: number): void {
    const entry = this.active.get(id);
    if (!entry) return;
    entry.ctrl.abort();
    if (this.active.delete(id)) this.emit("active-changed");
  }

  getActive(): ActiveTask[] {
    return Array.from(this.active, ([id, v]) => ({ id, model: v.model, label: v.label }));
  }

  on(event: GenerationEvent, handler: () => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private emit(event: GenerationEvent): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) {
      try { h(); } catch (e) { console.error("[GGAI] handler error", e); }
    }
  }

  // ── chat ──

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { profile, apiKey } = this.resolve(req.profileId, "chat");
    const chatProfile = profile as ChatProfile;
    // streamingEnabled=true면 스트리밍 소비 후 합성
    if (chatProfile.streamingEnabled) {
      return await collectStream(this.chatStream(req));
    }
    const ad = this.providers.forProfile(profile);
    if (!ad.chat) throw new Error(`${profile.provider} 어댑터는 chat을 지원하지 않습니다`);
    return this.runAdapter("chat", profile, apiKey, req, (call) => ad.chat!(call));
  }

  async *chatStream(req: ChatRequest): AsyncIterable<ChatEvent> {
    const { profile, apiKey } = this.resolve(req.profileId, "chat");
    const chatProfile = profile as ChatProfile;
    // 프로필이 스트리밍을 끈 경우: upstream은 비스트리밍 chat() 경로를 사용하고
    // 결과를 단일 text-delta + done 이벤트로 방출한다.
    // streamingEnabled가 chat()의 라우팅만 통제하던 기존 동작을 chatStream()까지 확장하여,
    // 외부 호출자가 chatStream()을 직접 호출해도 프로필 설정이 존중되도록 한다.
    if (!chatProfile.streamingEnabled) {
      try {
        const res = await this.chat(req);
        if (res.text) yield { type: "text-delta", delta: res.text };
        yield { type: "done", response: res };
      } catch (e) {
        yield {
          type: "error",
          error: {
            message: e instanceof Error ? e.message : String(e),
            code: e instanceof GGAICancelledError ? e.code : undefined,
          },
        };
      }
      return;
    }
    const ad = this.providers.forProfile(profile);
    if (!ad.chatStream) throw new Error(`${profile.provider} 어댑터는 chatStream을 지원하지 않습니다`);
    const { call, ctrl, finalize, errorMeta, callId } = this.wrap(profile, apiKey, req, req.signal, "chatStream");
    // 스트림은 끝까지 소비되면 성공, 중간에 error 이벤트/예외가 나오면 그 결과로 덮어쓴다.
    let outcome: GenOutcome = { outcome: "success" };
    try {
      const release = await this.acquireQueue(profile.apiKeyRef);
      const timer = setTimeout(() => ctrl.abort(), this.settings.requestTimeoutMs);
      try {
        for await (const ev of ad.chatStream(call)) {
          if (ev.type === "error") {
            outcome = {
              outcome: ev.error.code === "cancelled" ? "cancelled" : "error",
              message: ev.error.message,
              status: errorMeta.status,
              url: errorMeta.url,
            };
          }
          yield ev;
        }
      } catch (e) {
        const norm = normalizeError(e, call.signal);
        outcome = {
          outcome: norm instanceof GGAICancelledError ? "cancelled" : "error",
          message: norm instanceof Error ? norm.message : String(norm),
          status: errorMeta.status,
          url: errorMeta.url,
        };
        throw norm;
      } finally {
        clearTimeout(timer);
        release();
      }
    } finally {
      finalize();
      this.recordGen("chatStream", profile, req.label, callId, outcome);
    }
  }

  // ── text / image / tts / stt ──

  async text(req: TextRequest): Promise<TextResponse> {
    const { profile, apiKey } = this.resolve(req.profileId, "text");
    const ad = this.providers.forProfile(profile);
    if (!ad.text) throw new Error(`${profile.provider} 어댑터는 text를 지원하지 않습니다`);
    return this.runAdapter("text", profile, apiKey, req, (call) => ad.text!(call));
  }

  async image(req: ImageRequest): Promise<ImageResponse> {
    const { profile, apiKey } = this.resolve(req.profileId, "image");
    const ad = this.providers.forProfile(profile);
    if (!ad.image) throw new Error(`${profile.provider} 어댑터는 image를 지원하지 않습니다`);
    return this.runAdapter("image", profile, apiKey, req, (call) => ad.image!(call));
  }

  async tts(req: TTSRequest): Promise<TTSResponse> {
    const { profile, apiKey } = this.resolve(req.profileId);
    const ad = this.providers.forProfile(profile);
    if (!ad.tts) throw new Error(`${profile.provider} 어댑터는 tts를 지원하지 않습니다`);
    return this.runAdapter("tts", profile, apiKey, req, (call) => ad.tts!(call));
  }

  async stt(req: STTRequest): Promise<STTResponse> {
    const { profile, apiKey } = this.resolve(req.profileId);
    const ad = this.providers.forProfile(profile);
    if (!ad.stt) throw new Error(`${profile.provider} 어댑터는 stt를 지원하지 않습니다`);
    return this.runAdapter("stt", profile, apiKey, req, (call) => ad.stt!(call));
  }

  // ── 유틸 ──

  async validate(profileId: string): Promise<{ ok: boolean; error?: string }> {
    const { profile, apiKey } = this.resolve(profileId);
    const ad = this.providers.forProfile(profile);
    // validate는 활성 추적/타이머는 없지만, 같은 키의 rate limit을 타므로
    // 큐에는 참여시킨다.
    const ctrl = new AbortController();
    return this.runWithGate(profile.apiKeyRef, ctrl, () => {}, () => ad.validate(profile, apiKey));
  }

  private resolve(
    profileId: string | undefined,
    defaultKind?: "chat" | "text" | "image"
  ): { profile: GGAIModelProfile; apiKey: string } {
    const profile = profileId
      ? this.profiles.get(profileId)
      : defaultKind
        ? this.profiles.getDefault(defaultKind)
        : null;
    if (!profile) {
      throw new Error(
        profileId
          ? `프로필을 찾을 수 없습니다: ${profileId}`
          : `기본 ${defaultKind ?? ""} 프로필이 설정되지 않았습니다`
      );
    }
    // apiKeyRef가 vault에 있으면 우선, 없으면 profile의 apiKey 필드(레거시) 사용
    const vaultKey = this.secrets.get(profile.apiKeyRef);
    const embedded = (profile as unknown as { apiKey?: string }).apiKey;
    const apiKey = vaultKey ?? embedded ?? "";
    return { profile, apiKey };
  }

  private wrap<TReq extends { signal?: AbortSignal; paramsOverride?: Record<string, unknown>; label?: string }>(
    profile: GGAIModelProfile,
    apiKey: string,
    request: TReq,
    externalSignal: AbortSignal | undefined,
    transport: Transport
  ): { call: ResolvedCall<TReq>; ctrl: AbortController; finalize: () => void; errorMeta: ErrorMeta; callId: string } {
    // allowedParams 게이트: chat/text 프로필이면 미허용 샘플링 키를
    // profile.params와 request.paramsOverride 양쪽에서 제거.
    // 출력 길이(maxTokens)는 외부 요청 override 값을 그대로 존중한다 (다른 샘플링
    // 파라미터와 동일하게 취급 — 프로필 값으로 깎지 않음).
    const gatedProfile = gateProfile(profile);
    const gatedOverride = gateParamsOverride(request.paramsOverride, profile);
    const gatedRequest =
      gatedOverride === request.paramsOverride
        ? request
        : ({ ...request, paramsOverride: gatedOverride } as TReq);

    // 입력(프롬프트) 토큰 상한 체크: 프로필에 maxContextTokens 가 설정돼 있고
    // 실제 입력이 이를 초과하면, 실제 provider 호출 전에 명확한 에러로 거부한다.
    // (출력 토큰 초과는 provider 가 대부분 조용히 잘라 응답하지만, 입력 토큰
    //  초과는 provider 가 바로 400 에러를 내므로 사전에 막는 편이 낫다.)
    // active 등록/토스트 생성보다 먼저 검증해야 한다 — 여기서 던지면 finalize가
    // 아직 반환되지 않아 호출자가 active 항목을 정리할 방법이 없고, "생성 중"
    // 토스트가 영구히 남는다.
    assertInputWithinContext(profile, request);

    const ctrl = new AbortController();
    const id = this.nextId++;
    // 생성 로그(errorLogs)와 상세 요청 로그(requestLogs)를 잇는 키. 같은 호출의
    // request/response/error 본문을 뷰에서 이 키로 매칭한다.
    const callId = `${this.logRunId}:${id}`;
    this.active.set(id, { ctrl, model: profile.model, label: request.label });
    this.emit("active-changed");
    // 타임아웃은 큐를 통과해 실제 실행되는 시점(runWithGate)에 시작한다.
    // 대기 중인 요청이 타임아웃을 소진하지 않도록 하기 위함.
    const signal = mergeSignals(ctrl.signal, externalSignal);

    const finalize = () => {
      if (this.active.delete(id)) this.emit("active-changed");
    };

    // provider가 phase==="error"로 남긴 HTTP 상태/URL을 담아뒀다가 recordGen에서 활용.
    // (생성 로그의 outcome/message는 GenerationService가 중앙에서 기록하고, provider는
    //  상세 요청 로그(requestLogs)만 채운다.)
    const errorMeta: ErrorMeta = {};

    const call: ResolvedCall<TReq> = {
      profile: gatedProfile,
      apiKey,
      request: gatedRequest,
      signal,
      log: (event) => {
        this.requestLogs.add({
          ...event,
          callId,
          profileId: profile.id,
          profileName: profile.name,
          provider: profile.provider,
          model: profile.model,
          label: request.label,
        });
        if (event.phase === "error") {
          errorMeta.status = event.status;
          errorMeta.url = event.url;
        }
      },
    };
    if (this.settings.logRequests) {
      console.log("[GGAI] request", profile.kind, profile.name, profile.model);
    }
    return { call, ctrl, finalize, errorMeta, callId };
  }

  /**
   * wrap + 큐/타임아웃 실행 + 생성 로그 기록을 한 번에 처리하는 비스트리밍 공통 경로.
   * 성공/에러/취소를 provider 구현과 무관하게 errorLogs에 항상 남긴다.
   */
  private async runAdapter<
    TReq extends { signal?: AbortSignal; paramsOverride?: Record<string, unknown>; label?: string },
    T
  >(
    transport: Transport,
    profile: GGAIModelProfile,
    apiKey: string,
    req: TReq,
    exec: (call: ResolvedCall<TReq>) => Promise<T>
  ): Promise<T> {
    const { call, ctrl, finalize, errorMeta, callId } = this.wrap(profile, apiKey, req, req.signal, transport);
    try {
      const res = await this.runWithGate(profile.apiKeyRef, ctrl, finalize, () => exec(call));
      this.recordGen(transport, profile, req.label, callId, { outcome: "success" });
      return res;
    } catch (e) {
      const norm = normalizeError(e, call.signal);
      this.recordGen(transport, profile, req.label, callId, {
        outcome: norm instanceof GGAICancelledError ? "cancelled" : "error",
        message: norm instanceof Error ? norm.message : String(norm),
        status: errorMeta.status,
        url: errorMeta.url,
      });
      throw norm;
    }
  }

  /** 생성 결과 한 건을 압축 로그에 기록한다. */
  private recordGen(
    transport: Transport,
    profile: GGAIModelProfile,
    label: string | undefined,
    callId: string,
    info: GenOutcome
  ): void {
    this.errorLogs?.record({
      profileId: profile.id,
      profileName: profile.name,
      provider: profile.provider,
      model: profile.model,
      transport,
      outcome: info.outcome,
      label,
      callId,
      status: info.status,
      url: info.url,
      message: info.message,
    });
  }

  // ── 직렬화 큐 ──

  /**
   * 해당 apiKeyRef의 큐 활성화 여부.
   * 명시적 설정(serialQueueRefs)이 있으면 그 값을 따르고, 미설정 시
   * 이 키를 NovelAI 프로필이 사용 중이면 기본 활성화로 간주한다.
   * (NovelAI는 키 단위 동시 요청 429가 잦아 기본 직렬화 대상)
   */
  isQueueEnabled(ref: string): boolean {
    const explicit = this.settings.serialQueueRefs?.[ref];
    if (explicit !== undefined) return explicit;
    return this.profiles.list().some(
      (p) => p.apiKeyRef === ref && p.provider === "novelai"
    );
  }

  /**
   * ref의 큐 슬롯을 획득한다. ref가 직렬화 대상이 아니면 즉시 no-op release 반환.
   * 대상이면 이전 요청 체인을 기다린 뒤, 내 차례가 왔을 때 release를 반환한다.
   * release()를 호출해야 다음 대기 요청이 진행된다.
   */
  private async acquireQueue(ref: string): Promise<() => void> {
    if (!this.isQueueEnabled(ref)) return noop;
    const prev = this.queueTails.get(ref) ?? Promise.resolve();
    let resolveGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    // tail 갱신을 await 이전에 수행해 FIFO 순서를 보장한다.
    this.queueTails.set(ref, prev.then(() => gate));
    await prev;
    return resolveGate;
  }

  /**
   * 큐(필요시) + 타임아웃을 적용해 task를 실행하고, 완료 후 finalize를 항상 호출.
   * 비직렬화 ref는 곧바로 실행되므로 타임아웃 시작 시점이 기존과 동일하다.
   */
  private runWithGate<T>(
    ref: string,
    ctrl: AbortController,
    finalize: () => void,
    task: () => Promise<T>
  ): Promise<T> {
    const run = async (): Promise<T> => {
      const release = await this.acquireQueue(ref);
      const timer = setTimeout(() => ctrl.abort(), this.settings.requestTimeoutMs);
      try {
        return await task();
      } finally {
        clearTimeout(timer);
        release();
      }
    };
    return run().finally(finalize);
  }
}

// ── 내부 유틸 ──

/**
 * 프로필에 설정된 maxContextTokens(입력 상한)를 넘는 요청을 전송 전에 거부한다.
 * chat 프로필의 messages/tools, text 프로필의 prompt 만 대상 — image/tts/stt 등은 대상 아님.
 * 프로필에 값이 없으면 검사하지 않는다 (기본은 무제한, 레거시 프로필도 영향 없음).
 */
function assertInputWithinContext(
  profile: GGAIModelProfile,
  request: unknown
): void {
  if (profile.kind !== "chat" && profile.kind !== "text") return;
  const limit = (profile as ChatProfile | TextProfile).params?.maxContextTokens;
  if (typeof limit !== "number") return;

  const req = request as Partial<ChatRequest & TextRequest>;
  const inputTokens =
    profile.kind === "chat"
      ? countTokens(
          { messages: req.messages ?? [], tools: req.tools },
          { provider: profile.provider, model: profile.model }
        )
      : countTokens(req.prompt ?? "", { provider: profile.provider, model: profile.model });

  if (inputTokens > limit) {
    throw new Error(
      `입력 토큰(${inputTokens})이 프로필 "${profile.name}"의 최대 입력 토큰(${limit})을 초과했습니다.`
    );
  }
}

async function collectStream(iter: AsyncIterable<ChatEvent>): Promise<ChatResponse> {
  let response: ChatResponse | null = null;
  for await (const ev of iter) {
    if (ev.type === "done") response = ev.response;
    if (ev.type === "error") throw new Error(ev.error.message);
  }
  if (!response) throw new Error("스트리밍 응답이 없습니다");
  return response;
}

function noop(): void {}

export function mergeSignals(a: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!b) return a;
  const ctrl = new AbortController();
  const onA = () => ctrl.abort((a as AbortSignal & { reason?: unknown }).reason);
  const onB = () => ctrl.abort((b as AbortSignal & { reason?: unknown }).reason);
  if (a.aborted) ctrl.abort();
  else a.addEventListener("abort", onA, { once: true });
  if (b.aborted) ctrl.abort();
  else b.addEventListener("abort", onB, { once: true });
  return ctrl.signal;
}
