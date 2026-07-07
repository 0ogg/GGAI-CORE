// ─── 에러 전용 로그 저장소 ───
//
// RequestLogStore(전체 요청 로그, 100건 캡)와 별개로 phase==="error" 이벤트만
// 압축된 형태로 모은다. body/response 원문은 저장하지 않으므로 크기가 작고,
// 어시스턴트 등 외부 플러그인이 "무슨 에러가 났는지"를 토큰 부담 없이
// 조회하는 용도로 쓴다.

export interface ErrorLogEntry {
  id: string;
  createdAt: number;
  profileId: string;
  profileName: string;
  provider: string;
  model: string;
  /** chat | chatStream | text | image | tts | stt */
  transport: string;
  /** HTTP 상태 코드 (있을 때만) */
  status?: number;
  url?: string;
  /** 에러 메시지 본문. MAX_MESSAGE_CHARS 로 절단 저장 */
  message: string;
}

const MAX_ENTRIES = 200;
const MAX_MESSAGE_CHARS = 2_000;

export class ErrorLogStore {
  private entries: ErrorLogEntry[];

  constructor(entries: ErrorLogEntry[], private onChange: () => void) {
    this.entries = Array.isArray(entries) ? entries : [];
  }

  /** 최신순 정렬 목록 */
  list(limit?: number): ErrorLogEntry[] {
    const sorted = this.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
    return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  }

  add(base: Omit<ErrorLogEntry, "id" | "createdAt" | "message"> & { message: string }): void {
    this.entries.push({
      ...base,
      message:
        base.message.length > MAX_MESSAGE_CHARS
          ? base.message.slice(0, MAX_MESSAGE_CHARS) + "…(절단)"
          : base.message,
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
    void this.onChange();
  }

  clear(): void {
    this.entries = [];
    void this.onChange();
  }

  snapshot(): ErrorLogEntry[] {
    return this.entries.slice();
  }
}
