// ─── abort 인식 requestUrl ───
//
// Obsidian 의 requestUrl() 은 AbortSignal 을 지원하지 않아, 비스트리밍 호출
// (chat/image/tts 등)은 사용자가 취소해도 응답이 올 때까지 호출자가 블록된다
// — 정지 버튼이 안 먹는 근본 원인.
//
// requestUrl 은 진행 중인 HTTP 자체를 끊을 수단이 없다(백그라운드로 계속됨).
// 하지만 abort 시 호출자를 즉시 rejection 으로 풀어주면, 취소가 사용자에게
// 즉각 반영되고(생성 중단/버튼 복구) 순차 요청 루프도 다음 요청을 발사하지 않는다.
//
// 던지는 에러는 GenerationService.normalizeError 가 signal.aborted 기준으로
// GGAICancelledError(code:"cancelled") 로 정규화한다.

import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";

export function requestUrlAbortable(
  params: RequestUrlParam,
  signal: AbortSignal | undefined
): Promise<RequestUrlResponse> {
  if (!signal) return requestUrl(params);
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<RequestUrlResponse>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    requestUrl(params).then(
      (res) => {
        signal.removeEventListener("abort", onAbort);
        resolve(res);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}
