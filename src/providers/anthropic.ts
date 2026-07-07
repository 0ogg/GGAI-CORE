// ─── Anthropic Adapter (설계 문서 §7.4) ───
//
// 구현 메모:
// - 비스트리밍: Obsidian의 requestUrl() 사용 (CORS 우회, 데스크탑/모바일 공용)
// - 스트리밍: fetch() + SSE 파싱 (데스크탑 한정, 모바일은 requestUrl 폴백 후 재조립)

import { requestUrl } from "obsidian";
import { requestUrlAbortable } from "../util/request.ts";
import type { ProviderAdapter, ResolvedCall } from "./base.ts";
import type {
  ChatRequest,
  ChatResponse,
  ChatEvent,
} from "../types/chat.ts";
import type { ChatProfile, GGAIModelProfile } from "../types/profile.ts";
import {
  translateForAnthropic,
  translateToolsForAnthropic,
  translateAnthropicToolChoice,
} from "../util/translate.ts";
import { parseSSE } from "../util/sse-parser.ts";

export class AnthropicAdapter implements ProviderAdapter {
  kind = "anthropic" as const;
  supports = { chat: true };

  async chat(call: ResolvedCall<ChatRequest>): Promise<ChatResponse> {
    const body = buildAnthropicBody(call, /*stream*/ false);
    const url = (call.profile.baseUrl ?? "https://api.anthropic.com") + "/v1/messages";

    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": call.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      throw: false,
    }, call.signal);

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Anthropic ${res.status}: ${res.text ?? ""}`);
    }

    const data = res.json as AnthropicResponseRaw;
    return normalizeAnthropicResponse(data);
  }

  async *chatStream(call: ResolvedCall<ChatRequest>): AsyncIterable<ChatEvent> {
    const body = buildAnthropicBody(call, /*stream*/ true);
    const url = (call.profile.baseUrl ?? "https://api.anthropic.com") + "/v1/messages";

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": call.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: call.signal,
      });
    } catch (e) {
      yield { type: "error", error: { message: (e as Error).message } };
      return;
    }
    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : "";
      yield { type: "error", error: { message: `Anthropic ${res.status}: ${text}` } };
      return;
    }

    let fullText = "";
    let fullReasoning = "";
    const toolCallsAccum: Record<
      string,
      { id: string; name: string; input: unknown; rawJson: string }
    > = {};
    let stopReason: ChatResponse["stopReason"] = "end";
    const usage = { inputTokens: 0, outputTokens: 0 };

    for await (const evt of parseSSE(res.body)) {
      if (!evt.data) continue;
      let data: AnthropicStreamEvent;
      try {
        data = JSON.parse(evt.data) as AnthropicStreamEvent;
      } catch {
        continue;
      }

      if (data.type === "content_block_start" && data.content_block?.type === "tool_use") {
        const cb = data.content_block;
        toolCallsAccum[String(data.index)] = {
          id: cb.id,
          name: cb.name,
          input: {},
          rawJson: "",
        };
        yield { type: "tool-call-start", toolCallId: cb.id, name: cb.name };
      } else if (data.type === "content_block_delta") {
        if (data.delta?.type === "text_delta") {
          fullText += data.delta.text ?? "";
          yield { type: "text-delta", delta: data.delta.text ?? "" };
        } else if (data.delta?.type === "thinking_delta") {
          const d = (data.delta as { thinking?: string }).thinking ?? "";
          if (d) fullReasoning += d;
        } else if (data.delta?.type === "input_json_delta") {
          const acc = toolCallsAccum[String(data.index)];
          if (acc) {
            const d = data.delta.partial_json ?? "";
            acc.rawJson += d;
            yield { type: "tool-call-args-delta", toolCallId: acc.id, delta: d };
          }
        }
      } else if (data.type === "content_block_stop") {
        const acc = toolCallsAccum[String(data.index)];
        if (acc) {
          try {
            acc.input = JSON.parse(acc.rawJson || "{}");
          } catch {
            acc.input = {};
          }
          yield {
            type: "tool-call-end",
            toolCallId: acc.id,
            name: acc.name,
            input: acc.input,
          };
        }
      } else if (data.type === "message_delta") {
        if (data.delta?.stop_reason) stopReason = mapAnthropicStopReason(data.delta.stop_reason);
        if (data.usage) {
          usage.inputTokens += data.usage.input_tokens ?? 0;
          usage.outputTokens += data.usage.output_tokens ?? 0;
        }
      } else if (data.type === "message_start" && data.message?.usage) {
        usage.inputTokens += data.message.usage.input_tokens ?? 0;
        usage.outputTokens += data.message.usage.output_tokens ?? 0;
      }
    }

    const response: ChatResponse = {
      text: fullText,
      ...(fullReasoning ? { reasoning: fullReasoning } : {}),
      toolCalls: Object.values(toolCallsAccum).map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input,
      })),
      stopReason,
      usage,
      raw: null,
    };
    yield { type: "done", response };
  }

  async validate(profile: GGAIModelProfile, apiKey: string) {
    try {
      const res = await requestUrl({
        url: (profile.baseUrl ?? "https://api.anthropic.com") + "/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: profile.model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        throw: false,
      });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      return { ok: false, error: `${res.status} ${res.text ?? ""}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ── 공용 빌더/정규화 ──

function buildAnthropicBody(call: ResolvedCall<ChatRequest>, stream: boolean) {
  const { profile, request } = call;
  const chatProfile = profile as ChatProfile;
  const profileParams = chatProfile.params ?? {};
  const params = { ...profileParams, ...(request.paramsOverride ?? {}) } as ChatProfile["params"];

  const { system, messages } = translateForAnthropic(request.messages);
  const tools = translateToolsForAnthropic(request.tools);

  const body: Record<string, unknown> = {
    model: profile.model,
    max_tokens: params.maxTokens ?? 32000,
    messages,
    stream,
  };
  if (system) body.system = system;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.topP !== undefined) body.top_p = params.topP;
  if (params.topK !== undefined) body.top_k = params.topK;
  if (params.stopSequences?.length) body.stop_sequences = params.stopSequences;
  if (tools?.length) body.tools = tools;
  const tc = translateAnthropicToolChoice(request.toolChoice);
  if (tc) body.tool_choice = tc;
  if (params.thinkingDisabled) {
    body.thinking = { type: "disabled" };
  } else if (params.thinkingBudget) {
    body.thinking = { type: "enabled", budget_tokens: params.thinkingBudget };
  }
  return body;
}

interface AnthropicResponseRaw {
  content?: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string; signature?: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function normalizeAnthropicResponse(data: AnthropicResponseRaw): ChatResponse {
  const blocks = data.content ?? [];
  const text = blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
  const thinkingBlocks = blocks.filter((b): b is { type: "thinking"; thinking: string } => b.type === "thinking");
  const reasoning = thinkingBlocks.length ? thinkingBlocks.map((b) => b.thinking).join("") : undefined;
  const toolCalls = blocks
    .filter((b): b is { type: "tool_use"; id: string; name: string; input: unknown } => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
  return {
    text,
    ...(reasoning ? { reasoning } : {}),
    toolCalls,
    stopReason: mapAnthropicStopReason(data.stop_reason ?? "end_turn"),
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
    raw: data,
  };
}

function mapAnthropicStopReason(r: string): ChatResponse["stopReason"] {
  if (r === "tool_use") return "tool_use";
  if (r === "max_tokens") return "max_tokens";
  if (r === "stop_sequence") return "stop_sequence";
  return "end";
}

// ── SSE 이벤트 타입 ──

interface AnthropicStreamEvent {
  type?: string;
  index?: number;
  content_block?: { type: string; id: string; name: string };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: { input_tokens?: number; output_tokens?: number };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
}
