// ─── 생성 로그 저장소 (전체 생성 내역 + 에러) ───
//
// RequestLogStore(provider가 call.log를 호출할 때만 채워지는 상세 요청 로그, 100건 캡)와
// 달리, 이 저장소는 GenerationService 레벨에서 "모든" 생성 호출의 결과를 압축된 형태로
// 남긴다. 성공/에러/취소를 provider 구현과 무관하게 빠짐없이 기록하며, 각 요청을 유발한
// 기능 라벨(플러그인이 지정한 label)도 함께 저장한다. body/response 원문은 담지 않아
// 크기가 작고, 어시스턴트 등 외부 플러그인이 "무슨 생성이 있었고 무슨 에러가 났는지"를
// 토큰 부담 없이 조회하는 용도로 쓴다.
//
// (클래스/타입 이름은 공개 API·저장 키 호환을 위해 ErrorLog* 로 유지한다.)

/** 생성 결과 구분 */
export type GenerationOutcome = "success" | "error" | "cancelled";

export interface ErrorLogEntry {
  id: string;
  createdAt: number;
  profileId: string;
  profileName: string;
  provider: string;
  model: string;
  /** chat | chatStream | text | image | tts | stt */
  transport: string;
  /** 생성 결과. 레거시(필드 없는) 엔트리는 에러로 간주한다. */
  outcome: GenerationOutcome;
  /** 요청을 유발한 기능 이름(플러그인이 지정한 label). 없을 수 있음. */
  label?: string;
  /** 상세 요청 로그(RequestLogStore)와 잇는 키. 같은 호출의 body/response 조회용. */
  callId?: string;
  /** HTTP 상태 코드 (있을 때만) */
  status?: number;
  url?: string;
  /** 에러 메시지 본문. 에러일 때만 채워지며 MAX_MESSAGE_CHARS 로 절단 저장 */
  message?: string;
}

const MAX_ENTRIES = 300;
const MAX_MESSAGE_CHARS = 2_000;

export type ErrorLogListener = (entry: ErrorLogEntry) => void;

export class ErrorLogStore {
  private entries: ErrorLogEntry[];
  private listeners = new Set<ErrorLogListener>();

  constructor(entries: ErrorLogEntry[], private onChange: () => void) {
    // 레거시 엔트리(outcome 없음)는 에러로 정규화한다.
    this.entries = (Array.isArray(entries) ? entries : []).map((e) => ({
      ...e,
      outcome: e.outcome ?? "error",
    }));
  }

  /** 최신순 정렬 전체 목록 */
  list(limit?: number): ErrorLogEntry[] {
    const sorted = this.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
    return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  }

  /** 에러만(최신순). 어시스턴트의 원인 분석 진입점(getErrorLog)에서 사용. */
  listErrors(limit?: number): ErrorLogEntry[] {
    return this.list().filter((e) => e.outcome === "error").slice(0, limit ?? Infinity);
  }

  /** 기록된 라벨 목록(중복 제거). 라벨별 필터 UI용. */
  labels(): string[] {
    const set = new Set<string>();
    for (const e of this.entries) if (e.label) set.add(e.label);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /** 새 에러가 기록될 때마다 호출된다. 반환 함수로 구독 해제. (토스트 알림 등에 사용) */
  onError(fn: ErrorLogListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 생성 결과 한 건을 기록한다. outcome==="error" 일 때만 리스너(토스트)를 깨운다. */
  record(base: Omit<ErrorLogEntry, "id" | "createdAt">): void {
    const message =
      base.message != null && base.message.length > MAX_MESSAGE_CHARS
        ? base.message.slice(0, MAX_MESSAGE_CHARS) + "…(절단)"
        : base.message;
    const entry: ErrorLogEntry = {
      ...base,
      message,
      id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
    void this.onChange();
    if (entry.outcome !== "error") return;
    for (const fn of this.listeners) {
      try {
        fn(entry);
      } catch (e) {
        console.warn("[GGAI] error-log listener failed", e);
      }
    }
  }

  clear(): void {
    this.entries = [];
    void this.onChange();
  }

  snapshot(): ErrorLogEntry[] {
    return this.entries.slice();
  }
}
