// ─── Agent 런타임 (설계 문서 §2.5) ───

import type { GGAIChatMessage, ContentBlock, ChatResponse } from "./chat.ts";
import type { ToolDef, ToolResult } from "./tool.ts";

export interface TotalUsage {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  turns: number;
}

export interface AgentRequest {
  profileId: string;
  systemPrompt: string;
  userMessage: string | ContentBlock[];
  tools: ToolDef[];
  maxTurns?: number;
  maxToolCallsPerTurn?: number;
  paramsOverride?: Record<string, unknown>;
  initialHistory?: GGAIChatMessage[];
  pluginId?: string;   // 호출 주체 식별용
  /** 이 목록의 플러그인들이 registerTool()로 등록한 영구 도구도 병합한다.
   *  예: 어시스턴트가 자기 도구 + 스텔라 도구를 한 세션에서 함께 쓸 때. */
  pluginIds?: string[];
  signal?: AbortSignal;
}

export type AgentEvent =
  | { type: "turn-start"; turn: number }
  | { type: "text-delta"; delta: string }
  | { type: "tool-use-start"; toolCallId: string; name: string; input: unknown }
  | {
      type: "tool-use-end";
      toolCallId: string;
      result: ToolResult;
      durationMs: number;
    }
  | { type: "turn-end"; turn: number; stopReason: ChatResponse["stopReason"] }
  | { type: "log"; from: string; message: string }
  | {
      type: "done";
      finalText: string;
      history: GGAIChatMessage[];
      usage: TotalUsage;
    }
  | { type: "error"; error: { message: string; turn: number; code?: string } };
