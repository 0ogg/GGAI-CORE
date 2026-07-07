// ─── Agent Runtime (설계 문서 §4.2, §7.5) ───
//
// 멀티턴 루프:
//   1) chatStream 호출 → text/tool-call 이벤트 수집
//   2) assistant 메시지를 history에 push
//   3) stopReason=='tool_use' 이고 tool_call이 있으면 병렬 실행
//   4) tool_result 메시지 history에 push
//   5) 루프 반복
//
// AsyncIterator<AgentEvent>를 반환하기 위해 Deferred 큐를 사용한다.

import type { App } from "obsidian";
import type { AgentRequest, AgentEvent, TotalUsage } from "../types/agent.ts";
import type { GGAIChatMessage, ChatRequest, ChatResponse, ToolCall, ContentBlock } from "../types/chat.ts";
import type { ToolDef } from "../types/tool.ts";
import type { GenerationService } from "./generation-service.ts";
import { mergeSignals, GGAICancelledError } from "./generation-service.ts";

export interface AgentSettings {
  defaultMaxTurns: number;
}

export class AgentRuntime {
  private persistentTools: Map<string, Map<string, ToolDef>> = new Map();
  private active: Set<AbortController> = new Set();

  constructor(
    private gen: GenerationService,
    private app: App,
    private settings: AgentSettings
  ) {}

  registerPersistentTool(pluginId: string, tool: ToolDef): () => void {
    if (!this.persistentTools.has(pluginId)) {
      this.persistentTools.set(pluginId, new Map());
    }
    this.persistentTools.get(pluginId)!.set(tool.name, tool);
    return () => {
      this.persistentTools.get(pluginId)?.delete(tool.name);
    };
  }

  cancelAll(): void {
    for (const c of this.active) c.abort();
    this.active.clear();
  }

  run(req: AgentRequest): AsyncIterable<AgentEvent> {
    const ctrl = new AbortController();
    this.active.add(ctrl);
    const signal = mergeSignals(ctrl.signal, req.signal);

    const queue = new EventQueue<AgentEvent>();

    // 백그라운드로 루프 실행, 이벤트는 queue에 push
    this.loop(req, signal, queue).finally(() => {
      this.active.delete(ctrl);
      queue.end();
    });

    return queue.iterable();
  }

  // ── 실제 에이전트 루프 ──

  private async loop(
    req: AgentRequest,
    signal: AbortSignal,
    out: EventQueue<AgentEvent>
  ): Promise<void> {
    const toolsByName = new Map<string, ToolDef>();
    for (const t of req.tools) toolsByName.set(t.name, t);
    // pluginId / pluginIds에 해당하는 영구 툴 병합 (요청 시 명시한 tools가 우선)
    const mergeIds = [
      ...(req.pluginId ? [req.pluginId] : []),
      ...(req.pluginIds ?? []),
    ];
    for (const pid of mergeIds) {
      const persistent = this.persistentTools.get(pid);
      if (!persistent) continue;
      for (const [name, tool] of persistent) {
        if (!toolsByName.has(name)) toolsByName.set(name, tool);
      }
    }

    const maxTurns = req.maxTurns ?? this.settings.defaultMaxTurns;
    const maxToolCallsPerTurn = req.maxToolCallsPerTurn ?? 10;

    const history: GGAIChatMessage[] = [
      { role: "system", content: req.systemPrompt },
      ...(req.initialHistory ?? []),
      {
        role: "user",
        content: req.userMessage as string | ContentBlock[],
      },
    ];

    const usage: TotalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      turns: 0,
    };
    let finalText = "";

    for (let turn = 1; turn <= maxTurns; turn++) {
      if (signal.aborted) {
        out.push({ type: "error", error: { message: "aborted", turn, code: "cancelled" } });
        return;
      }
      out.push({ type: "turn-start", turn });
      usage.turns = turn;

      const tools = Array.from(toolsByName.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));

      const chatReq: ChatRequest = {
        profileId: req.profileId,
        messages: history,
        tools: tools.length ? tools : undefined,
        paramsOverride: req.paramsOverride,
        signal,
      };

      let turnText = "";
      const toolCalls: ToolCall[] = [];
      let stopReason: ChatResponse["stopReason"] = "end";

      try {
        for await (const ev of this.gen.chatStream(chatReq)) {
          if (ev.type === "text-delta") {
            turnText += ev.delta;
            out.push({ type: "text-delta", delta: ev.delta });
          } else if (ev.type === "tool-call-end") {
            toolCalls.push({ id: ev.toolCallId, name: ev.name, input: ev.input });
          } else if (ev.type === "done") {
            stopReason = ev.response.stopReason;
            usage.inputTokens += ev.response.usage.inputTokens;
            usage.outputTokens += ev.response.usage.outputTokens;
            // 누락된 이름 보정
            for (const tc of ev.response.toolCalls) {
              const existing = toolCalls.find((x) => x.id === tc.id);
              if (existing) {
                if (!existing.name) existing.name = tc.name;
              } else {
                toolCalls.push(tc);
              }
            }
          } else if (ev.type === "error") {
            out.push({ type: "error", error: { message: ev.error.message, turn, code: ev.error.code } });
            return;
          }
        }
      } catch (e) {
        out.push({
          type: "error",
          error: {
            message: (e as Error).message,
            turn,
            code: e instanceof GGAICancelledError ? e.code : undefined,
          },
        });
        return;
      }

      // assistant 메시지 누적
      history.push({
        role: "assistant",
        content: turnText,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      });
      if (turnText) finalText = turnText;

      out.push({ type: "turn-end", turn, stopReason });

      if (stopReason !== "tool_use" || toolCalls.length === 0) break;

      // ── 툴 병렬 실행 ──
      const toExecute = toolCalls.slice(0, maxToolCallsPerTurn);
      const results = await Promise.all(
        toExecute.map(async (tc) => {
          const def = toolsByName.get(tc.name);
          const started = Date.now();
          if (!def) {
            return {
              tc,
              result: { content: `Unknown tool: ${tc.name}`, isError: true },
              durationMs: 0,
            };
          }
          out.push({
            type: "tool-use-start",
            toolCallId: tc.id,
            name: tc.name,
            input: tc.input,
          });
          try {
            const result = await def.handler(tc.input, {
              app: this.app,
              pluginId: req.pluginId ?? "caller",
              signal,
              log: (msg) =>
                out.push({ type: "log", from: tc.name, message: msg }),
            });
            return { tc, result, durationMs: Date.now() - started };
          } catch (e) {
            return {
              tc,
              result: {
                content: String((e as Error).message ?? e),
                isError: true,
              },
              durationMs: Date.now() - started,
            };
          }
        })
      );
      usage.toolCalls += results.length;

      for (const { tc, result, durationMs } of results) {
        out.push({
          type: "tool-use-end",
          toolCallId: tc.id,
          result,
          durationMs,
        });
        history.push({
          role: "tool",
          toolCallId: tc.id,
          content:
            typeof result.content === "string"
              ? result.content
              : (result.content as ContentBlock[]),
        });
      }

      if (signal.aborted) {
        out.push({ type: "error", error: { message: "aborted", turn, code: "cancelled" } });
        return;
      }
    }

    out.push({ type: "done", finalText, history, usage });
  }
}

// ─── Deferred 이벤트 큐 (async generator bridge) ───

class EventQueue<T> {
  private buffer: T[] = [];
  private waiters: Array<(v: IteratorResult<T>) => void> = [];
  private ended = false;

  push(ev: T): void {
    if (this.ended) return;
    const w = this.waiters.shift();
    if (w) w({ value: ev, done: false });
    else this.buffer.push(ev);
  }

  end(): void {
    this.ended = true;
    for (const w of this.waiters) w({ value: undefined as unknown as T, done: true });
    this.waiters = [];
  }

  iterable(): AsyncIterable<T> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next(): Promise<IteratorResult<T>> {
            if (self.buffer.length) {
              const v = self.buffer.shift()!;
              return Promise.resolve({ value: v, done: false });
            }
            if (self.ended) {
              return Promise.resolve({ value: undefined as unknown as T, done: true });
            }
            return new Promise<IteratorResult<T>>((resolve) => self.waiters.push(resolve));
          },
          return(): Promise<IteratorResult<T>> {
            self.end();
            return Promise.resolve({ value: undefined as unknown as T, done: true });
          },
        };
      },
    };
  }
}
