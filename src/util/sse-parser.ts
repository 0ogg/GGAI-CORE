// ─── 공용 SSE 파서 (설계 문서 §7.6) ───
// fetch() 응답의 ReadableStream을 이벤트 단위로 나눠준다.

export interface SSEEvent {
  event?: string;
  data?: string;
  id?: string;
}

export async function* parseSSE(
  body: ReadableStream<Uint8Array>
): AsyncIterable<SSEEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let cur: SSEEvent = {};
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (line === "") {
          if (cur.data !== undefined || cur.event !== undefined) yield cur;
          cur = {};
        } else if (line.startsWith(":")) {
          // comment
        } else {
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "data") {
            cur.data = cur.data === undefined ? value : cur.data + "\n" + value;
          } else if (field === "event") {
            cur.event = value;
          } else if (field === "id") {
            cur.id = value;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
