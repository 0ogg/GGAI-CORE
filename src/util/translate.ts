// ─── 공용 ChatMessage ↔ 각 프로바이더 포맷 변환 유틸 ───

import type { GGAIChatMessage, ContentBlock, ToolDefPublic } from "../types/chat.ts";

// ─── Anthropic ───

export interface AnthropicTranslated {
  system?: string;
  messages: AnthropicMessage[];
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[] | string;
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[]; is_error?: boolean };

export function translateForAnthropic(messages: GGAIChatMessage[]): AnthropicTranslated {
  let system: string | undefined;
  const out: AnthropicMessage[] = [];

  // system은 별도 필드로 분리 (여러 system은 합침)
  const sysTexts: string[] = [];
  const rest: GGAIChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      sysTexts.push(typeof m.content === "string" ? m.content : flattenBlocksToText(m.content));
    } else {
      rest.push(m);
    }
  }
  if (sysTexts.length) system = sysTexts.join("\n\n");

  // tool role은 user의 tool_result 블록으로 변환
  // assistant의 toolCalls는 tool_use 블록으로 변환
  for (const m of rest) {
    if (m.role === "tool") {
      const text = typeof m.content === "string" ? m.content : flattenBlocksToText(m.content);
      out.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: m.toolCallId ?? "",
          content: text,
        }],
      });
      continue;
    }

    if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (typeof m.content === "string") {
        if (m.content) blocks.push({ type: "text", text: m.content });
      } else {
        for (const b of m.content) blocks.push(toAnthropicBlock(b));
      }
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        }
      }
      out.push({ role: "assistant", content: blocks.length ? blocks : "" });
      continue;
    }

    // user
    if (typeof m.content === "string") {
      out.push({ role: "user", content: m.content });
    } else {
      out.push({ role: "user", content: m.content.map(toAnthropicBlock) });
    }
  }

  return { system, messages: out };
}

function toAnthropicBlock(b: ContentBlock): AnthropicContentBlock {
  if (b.type === "text") return { type: "text", text: b.text };
  if (b.source.kind === "base64") {
    return { type: "image", source: { type: "base64", media_type: b.source.mediaType, data: b.source.data } };
  }
  return { type: "image", source: { type: "url", url: b.source.url } };
}

export function translateToolsForAnthropic(tools?: ToolDefPublic[]) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

export function translateAnthropicToolChoice(
  tc: "auto" | "none" | "required" | { type: "tool"; name: string } | undefined
): unknown | undefined {
  if (!tc) return undefined;
  if (tc === "auto") return { type: "auto" };
  if (tc === "none") return { type: "none" };
  if (tc === "required") return { type: "any" };
  return { type: "tool", name: tc.name };
}

// ─── OpenAI (chat/completions) ───

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export function translateForOpenAI(messages: GGAIChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId ?? "",
        content: typeof m.content === "string" ? m.content : flattenBlocksToText(m.content),
      });
      continue;
    }
    if (m.role === "assistant") {
      const content = typeof m.content === "string" ? m.content : flattenBlocksToText(m.content);
      const msg: OpenAIMessage = { role: "assistant", content };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
        }));
      }
      out.push(msg);
      continue;
    }
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
    } else {
      out.push({
        role: m.role,
        content: m.content.map((b) =>
          b.type === "text"
            ? { type: "text" as const, text: b.text }
            : {
                type: "image_url" as const,
                image_url: {
                  url:
                    b.source.kind === "url"
                      ? b.source.url
                      : `data:${b.source.mediaType};base64,${b.source.data}`,
                },
              }
        ),
      });
    }
  }
  return out;
}

export function translateToolsForOpenAI(tools?: ToolDefPublic[]) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

export function translateOpenAIToolChoice(
  tc: "auto" | "none" | "required" | { type: "tool"; name: string } | undefined
): unknown | undefined {
  if (!tc) return undefined;
  if (tc === "auto" || tc === "none" || tc === "required") return tc;
  return { type: "function", function: { name: tc.name } };
}

// ─── Google Gemini ───

export interface GeminiTranslated {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{
    role: "user" | "model";
    parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
      | { functionCall: { name: string; args: unknown } }
      | { functionResponse: { name: string; response: { content: string } } }
    >;
  }>;
}

export function translateForGemini(messages: GGAIChatMessage[]): GeminiTranslated {
  let systemText = "";
  const contents: GeminiTranslated["contents"] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemText +=
        (systemText ? "\n\n" : "") +
        (typeof m.content === "string" ? m.content : flattenBlocksToText(m.content));
      continue;
    }
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.toolCallId ?? "",
              response: {
                content:
                  typeof m.content === "string" ? m.content : flattenBlocksToText(m.content),
              },
            },
          },
        ],
      });
      continue;
    }
    if (m.role === "assistant") {
      const parts: GeminiTranslated["contents"][number]["parts"] = [];
      const textContent =
        typeof m.content === "string" ? m.content : flattenBlocksToText(m.content);
      if (textContent) parts.push({ text: textContent });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.input } });
        }
      }
      contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });
      continue;
    }
    // user
    if (typeof m.content === "string") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else {
      const parts: GeminiTranslated["contents"][number]["parts"] = [];
      for (const b of m.content) {
        if (b.type === "text") parts.push({ text: b.text });
        else if (b.source.kind === "base64") {
          parts.push({
            inlineData: { mimeType: b.source.mediaType, data: b.source.data },
          });
        } else {
          // Gemini는 URL 이미지를 직접 받지 않으므로 텍스트 프레임워크로 대체
          parts.push({ text: `[image: ${b.source.url}]` });
        }
      }
      contents.push({ role: "user", parts });
    }
  }

  const out: GeminiTranslated = { contents };
  if (systemText) out.systemInstruction = { parts: [{ text: systemText }] };
  return out;
}

export function translateToolsForGemini(tools?: ToolDefPublic[]) {
  if (!tools?.length) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    },
  ];
}

// ─── 공용 유틸 ───

export function flattenBlocksToText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}
