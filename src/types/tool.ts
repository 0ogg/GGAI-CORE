// ─── Tool 정의 (설계 문서 §2.4) ───

import type { App } from "obsidian";
import type { ContentBlock } from "./chat.ts";

export interface ToolContext {
  app: App;
  pluginId: string;
  signal: AbortSignal;
  log: (msg: string) => void;
}

export interface ToolResult {
  content: string | ContentBlock[];
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema draft-07
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}
