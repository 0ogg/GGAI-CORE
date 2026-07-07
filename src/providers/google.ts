// ─── Google Gemini Adapter ───
// generativelanguage.googleapis.com/v1beta

import { requestUrl } from "obsidian";
import { requestUrlAbortable } from "../util/request.ts";
import type { ProviderAdapter, ResolvedCall } from "./base.ts";
import type { ChatRequest, ChatResponse, ChatEvent, ToolCall } from "../types/chat.ts";
import type { ChatProfile, GGAIModelProfile } from "../types/profile.ts";
import { translateForGemini, translateToolsForGemini } from "../util/translate.ts";
import { parseSSE } from "../util/sse-parser.ts";

export class GoogleAdapter implements ProviderAdapter {
  kind = "google" as const;
  supports = { chat: true };

  async chat(call: ResolvedCall<ChatRequest>): Promise<ChatResponse> {
    const body = buildGeminiBody(call);
    const url = resolveUrl(call, "generateContent");
    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      throw: false,
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Gemini ${res.status}: ${res.text ?? ""}`);
    }
    return normalizeGeminiResponse(res.json);
  }

  async *chatStream(call: ResolvedCall<ChatRequest>): AsyncIterable<ChatEvent> {
    const body = buildGeminiBody(call);
    const url = resolveUrl(call, "streamGenerateContent") + "&alt=sse";

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: call.signal,
      });
    } catch (e) {
      yield { type: "error", error: { message: (e as Error).message } };
      return;
    }
    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : "";
      yield { type: "error", error: { message: `Gemini ${res.status}: ${text}` } };
      return;
    }

    let fullText = "";
    let fullReasoning = "";
    const toolCalls: ToolCall[] = [];
    let stopReason: ChatResponse["stopReason"] = "end";
    const usage = { inputTokens: 0, outputTokens: 0 };

    for await (const evt of parseSSE(res.body)) {
      if (!evt.data) continue;
      let data: GeminiStreamChunk;
      try {
        data = JSON.parse(evt.data) as GeminiStreamChunk;
      } catch {
        continue;
      }
      const cand = data.candidates?.[0];
      const parts = cand?.content?.parts ?? [];
      for (const p of parts) {
        if (typeof p.text === "string") {
          if (p.thought) {
            fullReasoning += p.text;
          } else {
            fullText += p.text;
            yield { type: "text-delta", delta: p.text };
          }
        }
        if (p.functionCall) {
          const id = genId();
          yield { type: "tool-call-start", toolCallId: id, name: p.functionCall.name };
          yield {
            type: "tool-call-end",
            toolCallId: id,
            name: p.functionCall.name,
            input: p.functionCall.args ?? {},
          };
          toolCalls.push({ id, name: p.functionCall.name, input: p.functionCall.args ?? {} });
        }
      }
      if (cand?.finishReason) stopReason = mapGeminiFinish(cand.finishReason);
      if (data.usageMetadata) {
        usage.inputTokens = data.usageMetadata.promptTokenCount ?? usage.inputTokens;
        usage.outputTokens = data.usageMetadata.candidatesTokenCount ?? usage.outputTokens;
      }
    }

    if (toolCalls.length && stopReason === "end") stopReason = "tool_use";

    yield {
      type: "done",
      response: {
        text: fullText,
        ...(fullReasoning ? { reasoning: fullReasoning } : {}),
        toolCalls,
        stopReason,
        usage,
        raw: null,
      },
    };
  }

  async validate(profile: GGAIModelProfile, apiKey: string) {
    try {
      const url = `${profile.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"}/models?key=${encodeURIComponent(apiKey)}`;
      const res = await requestUrl({ url, method: "GET", throw: false });
      if (res.status >= 200 && res.status < 300) return { ok: true };
      return { ok: false, error: `${res.status} ${res.text ?? ""}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ── 공용 ──

function resolveUrl(call: ResolvedCall<ChatRequest>, method: "generateContent" | "streamGenerateContent"): string {
  const base = (call.profile.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  return `${base}/models/${call.profile.model}:${method}?key=${encodeURIComponent(call.apiKey)}`;
}

function buildGeminiBody(call: ResolvedCall<ChatRequest>) {
  const chatProfile = call.profile as ChatProfile;
  const p = { ...(chatProfile.params ?? {}), ...(call.request.paramsOverride ?? {}) } as ChatProfile["params"];
  const translated = translateForGemini(call.request.messages);

  const body: Record<string, unknown> = { contents: translated.contents };
  if (translated.systemInstruction) body.systemInstruction = translated.systemInstruction;

  const genConfig: Record<string, unknown> = {};
  if (p.temperature !== undefined) genConfig.temperature = p.temperature;
  if (p.topP !== undefined) genConfig.topP = p.topP;
  if (p.topK !== undefined) genConfig.topK = p.topK;
  if (p.maxTokens !== undefined) genConfig.maxOutputTokens = p.maxTokens;
  if (p.stopSequences?.length) genConfig.stopSequences = p.stopSequences;
  if (p.thinkingDisabled) genConfig.thinkingConfig = { thinkingBudget: 0 };
  if (Object.keys(genConfig).length) body.generationConfig = genConfig;

  const tools = translateToolsForGemini(call.request.tools);
  if (tools) body.tools = tools;
  if (call.request.toolChoice) {
    if (call.request.toolChoice === "required") {
      body.toolConfig = { functionCallingConfig: { mode: "ANY" } };
    } else if (call.request.toolChoice === "none") {
      body.toolConfig = { functionCallingConfig: { mode: "NONE" } };
    } else if (call.request.toolChoice === "auto") {
      body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    } else if (typeof call.request.toolChoice === "object") {
      body.toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: [call.request.toolChoice.name],
        },
      };
    }
  }
  return body;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{
      text?: string;
      thought?: boolean;
      functionCall?: { name: string; args?: unknown };
    }>;
  };
  finishReason?: string;
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function normalizeGeminiResponse(raw: GeminiStreamChunk): ChatResponse {
  const cand = raw.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  let text = "";
  let reasoning = "";
  const toolCalls: ToolCall[] = [];
  for (const p of parts) {
    if (typeof p.text === "string") {
      if (p.thought) reasoning += p.text;
      else text += p.text;
    }
    if (p.functionCall) {
      toolCalls.push({ id: genId(), name: p.functionCall.name, input: p.functionCall.args ?? {} });
    }
  }
  let stop = mapGeminiFinish(cand?.finishReason ?? "STOP");
  if (toolCalls.length && stop === "end") stop = "tool_use";
  return {
    text,
    ...(reasoning ? { reasoning } : {}),
    toolCalls,
    stopReason: stop,
    usage: {
      inputTokens: raw.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: raw.usageMetadata?.candidatesTokenCount ?? 0,
    },
    raw,
  };
}

function mapGeminiFinish(r: string): ChatResponse["stopReason"] {
  if (r === "MAX_TOKENS") return "max_tokens";
  if (r === "STOP") return "end";
  return "end";
}

function genId(): string {
  return "tool_" + Math.random().toString(36).slice(2, 11);
}
