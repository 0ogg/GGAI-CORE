// ─── OpenAI chat/completions Adapter ───
// OpenAI-compatible 프로바이더 (OpenRouter, DeepSeek, z.ai, Ollama 등) 포함

import { requestUrl } from "obsidian";
import { requestUrlAbortable } from "../util/request.ts";
import type { ProviderAdapter, ResolvedCall } from "./base.ts";
import type {
  ChatRequest,
  ChatResponse,
  ChatEvent,
  TextRequest,
  TextResponse,
  ToolCall,
} from "../types/chat.ts";
import type { ChatProfile, GGAIModelProfile, ProviderKind } from "../types/profile.ts";
import {
  translateForOpenAI,
  translateToolsForOpenAI,
  translateOpenAIToolChoice,
} from "../util/translate.ts";
import { parseSSE } from "../util/sse-parser.ts";
import { getReasoningSupport, buildReasoningParams } from "../data/provider-params.ts";

export class OpenAIAdapter implements ProviderAdapter {
  kind: ProviderKind;
  supports = { chat: true, text: true };
  // image/tts/stt는 NovelAI/ElevenLabs로 이관됨. 기존 OpenAI /images/generations 경로 제거.

  constructor(kind: "openai" | "openai-compatible" = "openai") {
    this.kind = kind;
  }

  async chat(call: ResolvedCall<ChatRequest>): Promise<ChatResponse> {
    const body = buildOpenAIChatBody(call, /*stream*/ false);
    const url = resolveBaseUrl(call.profile) + "/chat/completions";
    call.log?.({ phase: "request", transport: "chat", url, body: summarizeOpenAIBody(body) });

    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: authHeaders(call.apiKey),
      body: JSON.stringify(body),
      throw: false,
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      call.log?.({ phase: "error", transport: "chat", url, status: res.status, error: res.text ?? "" });
      throw new Error(`OpenAI ${res.status}: ${res.text ?? ""}`);
    }
    const normalized = normalizeOpenAIChat(res.json);
    const chatLogResp: Record<string, unknown> = {
      text: summarizeText(normalized.text),
      stopReason: normalized.stopReason,
      usage: normalized.usage,
      raw: res.json,
    };
    if (normalized.reasoning) {
      chatLogResp.reasoning = summarizeText(normalized.reasoning);
    }
    call.log?.({
      phase: "response",
      transport: "chat",
      url,
      status: res.status,
      response: chatLogResp,
    });
    return normalized;
  }

  async *chatStream(call: ResolvedCall<ChatRequest>): AsyncIterable<ChatEvent> {
    const body = buildOpenAIChatBody(call, /*stream*/ true);
    const url = resolveBaseUrl(call.profile) + "/chat/completions";
    call.log?.({ phase: "request", transport: "chatStream", url, body: summarizeOpenAIBody(body) });

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: authHeaders(call.apiKey),
        body: JSON.stringify(body),
        signal: call.signal,
      });
    } catch (e) {
      // 사용자 취소(abort)는 폴백 없이 즉시 전파한다.
      // fallback this.chat() 가 requestUrl(미지원 abort) 로 새 요청을 보내 취소가 늦어지는 원인.
      if (call.signal.aborted || (e instanceof Error && e.name === "AbortError")) {
        throw e;
      }
      call.log?.({
        phase: "error",
        transport: "chatStream",
        url,
        error: e instanceof Error ? e.message : String(e),
      });
      // fetch() CORS/네트워크 에러 → requestUrl() 기반 비스트리밍으로 폴백
      try {
        const fallback = await this.chat(call);
        if (fallback.text) yield { type: "text-delta", delta: fallback.text };
        yield { type: "done", response: fallback };
      } catch (fallbackErr) {
        yield { type: "error", error: { message: (fallbackErr as Error).message } };
      }
      return;
    }
    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : "";
      call.log?.({ phase: "error", transport: "chatStream", url, status: res.status, error: text });
      yield { type: "error", error: { message: `OpenAI ${res.status}: ${text}` } };
      return;
    }

    let fullText = "";
    let fullReasoning = "";
    const rawEvents: unknown[] = [];
    // id별 tool_call 누적 (OpenAI의 델타는 index 기반이라 별도 배열로 관리)
    const toolAccumByIndex: Record<number, { id: string; name: string; rawArgs: string }> = {};
    let stopReason: ChatResponse["stopReason"] = "end";
    const usage = { inputTokens: 0, outputTokens: 0 };

    for await (const evt of parseSSE(res.body)) {
      if (!evt.data) continue;
      if (evt.data === "[DONE]") break;
      let data: OpenAIStreamEvent;
      try {
        data = JSON.parse(evt.data) as OpenAIStreamEvent;
      } catch {
        rawEvents.push({ parseError: true, data: evt.data });
        continue;
      }
      rawEvents.push(data);
      const choice = data.choices?.[0];
      if (!choice) {
        if (data.usage) {
          usage.inputTokens += data.usage.prompt_tokens ?? 0;
          usage.outputTokens += data.usage.completion_tokens ?? 0;
        }
        continue;
      }
      const delta = choice.delta ?? {};
      const textDelta = extractOpenAIText(delta);
      if (textDelta) {
        fullText += textDelta;
        yield { type: "text-delta", delta: textDelta };
      }
      const reasoningDelta = extractReasoning(delta);
      if (reasoningDelta) {
        fullReasoning += reasoningDelta;
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          let acc = toolAccumByIndex[idx];
          if (!acc) {
            acc = { id: tc.id ?? "", name: tc.function?.name ?? "", rawArgs: "" };
            toolAccumByIndex[idx] = acc;
            if (acc.id && acc.name) {
              yield { type: "tool-call-start", toolCallId: acc.id, name: acc.name };
            }
          }
          if (tc.id && !acc.id) acc.id = tc.id;
          if (tc.function?.name && !acc.name) acc.name = tc.function.name;
          if (tc.function?.arguments) {
            acc.rawArgs += tc.function.arguments;
            if (acc.id) {
              yield {
                type: "tool-call-args-delta",
                toolCallId: acc.id,
                delta: tc.function.arguments,
              };
            }
          }
        }
      }
      if (choice.finish_reason) {
        stopReason = mapOpenAIFinishReason(choice.finish_reason);
      }
      if (data.usage) {
        usage.inputTokens += data.usage.prompt_tokens ?? 0;
        usage.outputTokens += data.usage.completion_tokens ?? 0;
      }
    }

    const toolCalls: ToolCall[] = Object.values(toolAccumByIndex).map((t) => {
      let input: unknown = {};
      try {
        input = JSON.parse(t.rawArgs || "{}");
      } catch {
        input = {};
      }
      return { id: t.id, name: t.name, input };
    });
    for (const tc of toolCalls) {
      yield { type: "tool-call-end", toolCallId: tc.id, name: tc.name, input: tc.input };
    }

    const raw = {
      status: res.status,
      eventCount: rawEvents.length,
      events: rawEvents,
    };
    const logResponse: Record<string, unknown> = { text: summarizeText(fullText), textLen: fullText.length, stopReason, usage, raw };
    if (fullReasoning) {
      logResponse.reasoning = summarizeText(fullReasoning);
    }
    call.log?.({
      phase: "response",
      transport: "chatStream",
      url,
      status: res.status,
      response: logResponse,
    });

    yield {
      type: "done",
      response: {
        text: fullText,
        ...(fullReasoning ? { reasoning: fullReasoning } : {}),
        toolCalls,
        stopReason,
        usage,
        raw,
      },
    };
  }

  async text(call: ResolvedCall<TextRequest>): Promise<TextResponse> {
    const { profile, apiKey, request } = call;
    const url = resolveBaseUrl(profile) + "/completions";
    const body: Record<string, unknown> = {
      model: profile.model,
      prompt: request.prompt,
      ...(request.paramsOverride ?? {}),
    };
    call.log?.({ phase: "request", transport: "text", url, body: summarizeOpenAITextBody(body) });
    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
      throw: false,
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      call.log?.({ phase: "error", transport: "text", url, status: res.status, error: res.text ?? "" });
      throw new Error(`OpenAI text ${res.status}: ${res.text ?? ""}`);
    }
    const text = extractOpenAIText(res.json?.choices?.[0]);
    call.log?.({ phase: "response", transport: "text", url, status: res.status, response: { text: summarizeText(text), raw: res.json } });
    return { text, raw: res.json };
  }

  async validate(profile: GGAIModelProfile, apiKey: string) {
    try {
      const url = resolveBaseUrl(profile) + "/models";
      const res = await requestUrl({
        url,
        method: "GET",
        headers: authHeaders(apiKey),
        throw: false,
      });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      return { ok: false, error: `${res.status} ${res.text ?? ""}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ── 공용 ──

function resolveBaseUrl(profile: GGAIModelProfile): string {
  return (profile.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
}

function authHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  return h;
}

function buildOpenAIChatBody(call: ResolvedCall<ChatRequest>, stream: boolean) {
  const { profile, request } = call;
  const chatProfile = profile as ChatProfile;
  const p = { ...(chatProfile.params ?? {}), ...(request.paramsOverride ?? {}) } as ChatProfile["params"];

  const body: Record<string, unknown> = {
    model: profile.model,
    messages: translateForOpenAI(request.messages),
    stream,
  };
  if (p.maxTokens !== undefined) body.max_tokens = p.maxTokens;
  if (p.temperature !== undefined) body.temperature = p.temperature;
  if (p.topP !== undefined) body.top_p = p.topP;
  // top_k / min_p: OpenAI 본가는 미지원이지만 vLLM/LM Studio/Ollama 등 호환 서버에서 사용됨
  if (p.topK !== undefined) body.top_k = p.topK;
  if ((p as { minP?: number }).minP !== undefined) body.min_p = (p as { minP?: number }).minP;
  if (p.stopSequences?.length) body.stop = p.stopSequences;
  // 추론 제어: 서비스별로 유효 파라미터가 다르므로 (DeepSeek는 reasoning_effort
  // low~xhigh만 허용, Qwen/vLLM은 chat_template_kwargs 등) 능력 테이블을 거쳐 변환.
  if (p.thinkingDisabled || p.reasoningEffort) {
    const support = getReasoningSupport(profile.provider, profile.baseUrl ?? "", profile.model);
    Object.assign(
      body,
      buildReasoningParams(support, { disabled: p.thinkingDisabled, effort: p.reasoningEffort })
    );
  }

  const tools = translateToolsForOpenAI(request.tools);
  if (tools?.length) body.tools = tools;
  const tc = translateOpenAIToolChoice(request.toolChoice);
  if (tc) body.tool_choice = tc;

  if (stream) body.stream_options = { include_usage: true };
  return body;
}

interface OpenAIChatRaw {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string;
      reasoning?: string;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function normalizeOpenAIChat(raw: OpenAIChatRaw): ChatResponse {
  const ch = raw.choices?.[0];
  const msg = ch?.message ?? {};
  const text = extractOpenAIText(msg);
  const reasoning = extractReasoning(msg);
  const toolCalls =
    msg.tool_calls?.map((tc) => {
      let input: unknown = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        input = {};
      }
      return { id: tc.id, name: tc.function.name, input };
    }) ?? [];
  let finalText = text;
  let finalReasoning = reasoning;
  if (!finalReasoning) {
    const thinkMatch = /<think>([\s\S]*?)<\/think>/.exec(text);
    if (thinkMatch) {
      finalReasoning = thinkMatch[1].trim();
      finalText = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
  } else {
    finalText = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }
  return {
    text: finalText,
    ...(finalReasoning ? { reasoning: finalReasoning } : {}),
    toolCalls,
    stopReason: mapOpenAIFinishReason(ch?.finish_reason ?? "stop"),
    usage: {
      inputTokens: raw.usage?.prompt_tokens ?? 0,
      outputTokens: raw.usage?.completion_tokens ?? 0,
    },
    raw,
  };
}

function mapOpenAIFinishReason(r: string): ChatResponse["stopReason"] {
  if (r === "tool_calls" || r === "function_call") return "tool_use";
  if (r === "length") return "max_tokens";
  if (r === "stop") return "end";
  return "end";
}

interface OpenAIStreamEvent {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      output_text?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function extractOpenAIText(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const rec = obj as Record<string, unknown>;
  for (const key of ["content", "text", "output_text"]) {
    const value = rec[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function extractReasoning(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const rec = obj as Record<string, unknown>;
  for (const key of ["reasoning_content", "reasoning"]) {
    const value = rec[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function summarizeOpenAIBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    messages: Array.isArray(body.messages)
      ? body.messages.map((m) => summarizeMessage(m))
      : body.messages,
  };
}

function summarizeOpenAITextBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    prompt:
      typeof body.prompt === "string"
        ? summarizeText(body.prompt)
        : body.prompt,
  };
}

function summarizeMessage(message: unknown): unknown {
  if (!message || typeof message !== "object") return message;
  const rec = message as Record<string, unknown>;
  return {
    ...rec,
    content:
      typeof rec.content === "string"
        ? summarizeText(rec.content)
        : rec.content,
  };
}

function summarizeText(text: string): Record<string, unknown> {
  const head = text.slice(0, 1200);
  const tail = text.length > 1200 ? text.slice(-1200) : "";
  return {
    length: text.length,
    head,
    tail,
    full: text,
  };
}
