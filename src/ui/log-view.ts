// ─── 공용 로그 뷰 ───
// 하나의 화면에서 (1) 모든 요청 내역, (2) 라벨/결과별 칩 필터, (3) 각 호출의 요청/응답
// 본문(보낸 컨텍스트·받은 컨텍스트, 복사 버튼)을 모두 보여준다. 로그 모달과 설정 탭이
// 동일하게 이 컴포넌트를 사용한다.
//
// 데이터는 두 저장소를 합쳐 만든다:
//  - requestLogs(RequestLogStore): provider가 남긴 request/response/error 본문. 리치 렌더의 원천.
//  - errorLogs(ErrorLogStore): 모든 생성의 결과(성공/에러/취소)·라벨. 본문 없는 항목
//    (취소, resolve 실패 등)까지 빠짐없이 채워 "모든 내역"을 보장한다.
// 둘은 callId로 매칭한다.

import type GGAICorePlugin from "../main.ts";
import type { ErrorLogEntry, GenerationOutcome } from "../services/error-log.ts";
import type { RequestLogEntry } from "../services/request-log.ts";
import type { makeT } from "./strings.ts";

const NO_LABEL = "__none__";
const DEFAULT_MAX = 200;

type Outcome = GenerationOutcome | "pending";

const OUTCOME_STYLE: Record<Outcome, { bg: string; icon: string }> = {
  success: { bg: "rgba(80, 170, 120, 0.08)", icon: "✅" },
  error: { bg: "rgba(220, 80, 80, 0.08)", icon: "❌" },
  cancelled: { bg: "rgba(150, 150, 150, 0.10)", icon: "✋" },
  pending: { bg: "rgba(120, 120, 120, 0.06)", icon: "⏳" },
};

type L = ReturnType<typeof makeT>;

/** requestLogs 그룹(본문)과 errorLogs(결과·라벨)를 합친, 화면 렌더용 단위 */
interface MergedEntry {
  id: string;
  createdAt: number;
  provider: string;
  model: string;
  profileName: string;
  transport: string;
  label?: string;
  outcome: Outcome;
  status?: number;
  url?: string;
  /** 본문 상세(요청/응답/에러). requestLogs에서 온 경우에만 존재. */
  group?: RequestLogEntry[];
  /** 본문이 없는 항목(취소 등)의 에러/취소 메시지. */
  message?: string;
}

export interface LogViewOptions {
  focusId?: string;
  maxShown?: number;
}

export class LogView {
  private labelFilter = "";
  private outcomeFilter: "" | Outcome = "";
  private filtersEl!: HTMLElement;
  private listEl!: HTMLElement;

  constructor(
    private plugin: GGAICorePlugin,
    private L: L,
    private opts: LogViewOptions = {}
  ) {}

  mount(container: HTMLElement): void {
    if (this.buildEntries().length === 0) {
      const empty = container.createEl("p", { text: this.L("log_modal_empty") });
      empty.style.opacity = "0.7";
      return;
    }
    this.filtersEl = container.createDiv();
    this.listEl = container.createDiv();
    this.renderFilters();
    this.renderList();
  }

  private max(): number {
    return this.opts.maxShown ?? DEFAULT_MAX;
  }

  // ── 데이터: 두 저장소 병합 ──

  private buildEntries(): MergedEntry[] {
    const groups = groupRequestLogs(this.plugin.requestLogs.list());
    const genList = this.plugin.errorLogs.list();
    const genByCallId = new Map<string, ErrorLogEntry>();
    for (const g of genList) {
      if (g.callId && !genByCallId.has(g.callId)) genByCallId.set(g.callId, g);
    }

    const usedCallIds = new Set<string>();
    const merged: MergedEntry[] = [];

    // 1) 본문이 있는 요청 그룹 (리치 렌더)
    for (const group of groups) {
      const first = group[0];
      const last = group[group.length - 1];
      const callId = String(first.callId ?? first.id);
      usedCallIds.add(callId);
      const gen = first.callId ? genByCallId.get(String(first.callId)) : undefined;
      const errLog = group.find((g) => g.phase === "error");
      const respLog = group.find((g) => g.phase === "response");
      merged.push({
        id: gen?.id ?? callId,
        createdAt: last.createdAt,
        provider: first.provider,
        model: first.model,
        profileName: first.profileName,
        transport: first.transport,
        label: gen?.label ?? first.label,
        outcome: gen?.outcome ?? deriveOutcome(group),
        status: errLog?.status ?? respLog?.status,
        url: (errLog ?? respLog ?? first).url,
        group,
      });
    }

    // 2) 본문이 없는 생성 항목 (취소, resolve 실패, 본문 미로깅 등)
    for (const gen of genList) {
      if (gen.callId && usedCallIds.has(gen.callId)) continue;
      merged.push({
        id: gen.id,
        createdAt: gen.createdAt,
        provider: gen.provider,
        model: gen.model,
        profileName: gen.profileName,
        transport: gen.transport,
        label: gen.label,
        outcome: gen.outcome,
        status: gen.status,
        url: gen.url,
        message: gen.message,
      });
    }

    merged.sort((a, b) => b.createdAt - a.createdAt);
    return merged.slice(0, this.max());
  }

  private outcomeFiltered(): MergedEntry[] {
    return this.buildEntries().filter((e) =>
      this.outcomeFilter ? e.outcome === this.outcomeFilter : true
    );
  }

  // ── 필터 칩 ──

  private renderFilters(): void {
    const L = this.L;
    this.filtersEl.empty();

    const outcomeRow = this.filtersEl.createDiv();
    outcomeRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;";
    outcomeRow.createSpan({ text: L("log_filter_outcome") }).style.cssText =
      "opacity:0.7;font-size:12px;margin-right:2px;";
    const outcomes: { value: "" | Outcome; text: string }[] = [
      { value: "", text: L("log_filter_all") },
      { value: "success", text: L("log_outcome_success") },
      { value: "error", text: L("log_outcome_error") },
      { value: "cancelled", text: L("log_outcome_cancelled") },
    ];
    for (const o of outcomes) {
      this.chip(outcomeRow, o.text, this.outcomeFilter === o.value, () => {
        this.outcomeFilter = o.value;
        this.renderFilters();
        this.renderList();
      });
    }

    const scoped = this.outcomeFiltered();
    const counts = new Map<string, number>();
    let unlabeled = 0;
    for (const e of scoped) {
      if (e.label) counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
      else unlabeled++;
    }
    const labels = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));

    const labelRow = this.filtersEl.createDiv();
    labelRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:12px;";
    labelRow.createSpan({ text: L("log_filter_label") }).style.cssText =
      "opacity:0.7;font-size:12px;margin-right:2px;";
    this.chip(labelRow, `${L("log_filter_all")} (${scoped.length})`, this.labelFilter === "", () => {
      this.labelFilter = "";
      this.renderFilters();
      this.renderList();
    });
    for (const lb of labels) {
      this.chip(labelRow, `${lb} (${counts.get(lb)})`, this.labelFilter === lb, () => {
        this.labelFilter = lb;
        this.renderFilters();
        this.renderList();
      });
    }
    if (unlabeled > 0) {
      this.chip(labelRow, `${L("log_filter_no_label")} (${unlabeled})`, this.labelFilter === NO_LABEL, () => {
        this.labelFilter = NO_LABEL;
        this.renderFilters();
        this.renderList();
      });
    }
  }

  private chip(parent: HTMLElement, text: string, active: boolean, onClick: () => void): void {
    const chip = parent.createEl("button", { text });
    chip.style.cssText = [
      "padding:3px 10px",
      "border-radius:999px",
      "font-size:12px",
      "cursor:pointer",
      "border:1px solid var(--background-modifier-border)",
      active ? "background:var(--interactive-accent)" : "background:var(--background-secondary)",
      active ? "color:var(--text-on-accent)" : "color:var(--text-normal)",
      active ? "font-weight:600" : "font-weight:400",
    ].join(";");
    chip.onclick = () => onClick();
  }

  // ── 목록 ──

  private renderList(): void {
    const L = this.L;
    this.listEl.empty();
    const entries = this.outcomeFiltered().filter((e) =>
      this.labelFilter === ""
        ? true
        : this.labelFilter === NO_LABEL
          ? !e.label
          : e.label === this.labelFilter
    );

    if (entries.length === 0) {
      const empty = this.listEl.createEl("p", { text: L("log_modal_empty") });
      empty.style.opacity = "0.7";
      return;
    }
    for (const entry of entries) this.renderEntry(entry);
  }

  private renderEntry(entry: MergedEntry): void {
    const L = this.L;
    const style = OUTCOME_STYLE[entry.outcome];
    const details = this.listEl.createEl("details");
    details.style.border = "1px solid var(--background-modifier-border)";
    details.style.borderRadius = "6px";
    details.style.padding = "8px";
    details.style.marginBottom = "8px";
    details.style.backgroundColor = style.bg;
    if (this.opts.focusId && entry.id === this.opts.focusId) details.open = true;

    const time = new Date(entry.createdAt).toLocaleString();
    const parts = [`${style.icon} ${time}`, `${entry.provider} / ${entry.model}`];
    if (entry.label) parts.push(entry.label);
    if (entry.status != null) parts.push(`status ${entry.status}`);
    const summary = details.createEl("summary", { text: parts.join(" | ") });
    summary.style.cursor = "pointer";

    const metaParts = [
      entry.profileName,
      entry.transport,
      entry.label ? `label: ${entry.label}` : L("log_no_label"),
      entry.url,
    ].filter(Boolean);
    const metaEl = details.createEl("div", { text: metaParts.join(" | ") });
    metaEl.style.opacity = "0.7";
    metaEl.style.fontSize = "12px";
    metaEl.style.margin = "4px 0";

    if (entry.group && entry.group.length > 0) {
      // 요청/응답/에러 본문 (보낸 컨텍스트·받은 컨텍스트) — 각각 복사 버튼 포함
      for (const log of entry.group) {
        if (log.body !== undefined) this.renderPayload(details, "REQUEST", log, "body", formatPayload(log.body));
        if (log.response !== undefined) this.renderPayload(details, "RESPONSE", log, "response", formatPayload(log.response));
        if (log.error) this.renderPayload(details, "ERROR", log, "error", log.error);
      }
    } else if (entry.message) {
      this.renderText(details, entry.message);
    }
  }

  private renderPayload(
    container: HTMLElement,
    label: "REQUEST" | "RESPONSE" | "ERROR",
    log: RequestLogEntry,
    kind: "body" | "response" | "error",
    text: string
  ): void {
    const details = container.createEl("details");
    // REQUEST/RESPONSE는 기본으로 펼쳐 보여준다(보낸/받은 컨텍스트를 바로 보이도록).
    details.open = kind !== "error";
    details.style.border = "1px solid var(--background-modifier-border)";
    details.style.borderRadius = "6px";
    details.style.marginTop = "8px";
    details.style.backgroundColor =
      kind === "body"
        ? "rgba(60, 120, 255, 0.08)"
        : kind === "response"
          ? "rgba(80, 170, 120, 0.08)"
          : "rgba(220, 80, 80, 0.08)";

    const summaryParts = [`${label} ${new Date(log.createdAt).toLocaleTimeString()}`, log.transport];
    if (log.status != null) summaryParts.push(`status ${log.status}`);
    if (log.url) summaryParts.push(log.url);
    const summary = details.createEl("summary", { text: summaryParts.join(" | ") });
    summary.style.padding = "6px 8px";
    summary.style.cursor = "pointer";

    this.renderText(details, text);
  }

  /** 복사 버튼 + <pre> 텍스트 블록. */
  private renderText(container: HTMLElement, text: string): void {
    const L = this.L;
    const copyBtn = container.createEl("button", { text: L("btn_copy") });
    copyBtn.style.margin = "4px 8px 8px";
    copyBtn.onclick = (e) => {
      e.preventDefault();
      void navigator.clipboard.writeText(text).then(
        () => {
          const prev = copyBtn.textContent;
          copyBtn.textContent = L("copied");
          window.setTimeout(() => (copyBtn.textContent = prev), 1500);
        },
        () => (copyBtn.textContent = L("copy_failed"))
      );
    };

    const pre = container.createEl("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.maxHeight = "420px";
    pre.style.overflow = "auto";
    pre.style.fontSize = "12px";
    pre.style.margin = "0";
    pre.style.padding = "8px";
    pre.setText(text);
  }
}

// ── requestLogs 그룹핑 (설정 탭에서 이관) ──

function groupRequestLogs(logs: RequestLogEntry[]): RequestLogEntry[][] {
  const groups = new Map<string, RequestLogEntry[][]>();
  for (const log of logs.slice().sort((a, b) => a.createdAt - b.createdAt)) {
    const key = log.callId != null ? `call:${log.callId}` : log.id;
    let buckets = groups.get(key);
    if (!buckets) {
      buckets = [];
      groups.set(key, buckets);
    }
    const current = buckets[buckets.length - 1];
    if (!current || startsNewLogGroup(current, log)) buckets.push([log]);
    else current.push(log);
  }
  return Array.from(groups.values())
    .flat()
    .map((group) => group.sort((a, b) => a.createdAt - b.createdAt))
    .sort((a, b) => b[b.length - 1].createdAt - a[a.length - 1].createdAt);
}

function startsNewLogGroup(group: RequestLogEntry[], log: RequestLogEntry): boolean {
  if (log.phase !== "request") return false;
  const last = group[group.length - 1];
  if (!last) return false;
  if (last.phase === "response") return true;
  return last.phase === "error" && log.createdAt - last.createdAt > 5000;
}

/** 요청 그룹의 phase들로 결과를 추정(생성 로그 매칭이 없을 때의 폴백). */
function deriveOutcome(group: RequestLogEntry[]): Outcome {
  if (group.some((g) => g.phase === "error" || g.error)) return "error";
  if (group.some((g) => g.phase === "response")) return "success";
  return "pending";
}

// ── 본문 포매팅 (설정 탭에서 이관) ──

function formatPayload(value: unknown): string {
  if (typeof value === "string") return indent(value);
  if (!value || typeof value !== "object") return indent(String(value));

  const rec = value as Record<string, unknown>;
  const lines: string[] = [];
  for (const [key, v] of Object.entries(rec)) {
    if (key === "raw" || key === "events") continue;
    if ((key === "messages" || key === "contents") && Array.isArray(v)) {
      lines.push(`${key}:`);
      for (const msg of v) lines.push(indent(formatMessage(msg), 2));
    } else if (key === "prompt" || key === "text" || key === "reasoning") {
      lines.push(`${key}:\n${indent(formatTextSummary(v), 2)}`);
    } else if (key === "usage" && v && typeof v === "object") {
      const usage = v as Record<string, unknown>;
      lines.push(
        `usage: input ${usage.inputTokens ?? usage.prompt_tokens ?? 0}, output ${usage.outputTokens ?? usage.completion_tokens ?? 0}`
      );
    } else if (isScalar(v)) {
      lines.push(`${key}: ${String(v)}`);
    } else {
      lines.push(`${key}: ${formatCompact(v)}`);
    }
  }
  return indent(lines.join("\n"));
}

function formatMessage(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const rec = value as Record<string, unknown>;
  return `[${String(rec.role ?? "?")}]\n${formatTextSummary(rec.content)}`;
}

function formatTextSummary(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.full === "string") return rec.full;
    const head = typeof rec.head === "string" ? rec.head : "";
    const tail = typeof rec.tail === "string" ? rec.tail : "";
    const length = rec.length != null ? ` (${rec.length} chars)` : "";
    return tail ? `${head}\n...\n${tail}${length}` : `${head}${length}`;
  }
  return formatCompact(value);
}

function isScalar(value: unknown): boolean {
  return value == null || ["string", "number", "boolean"].includes(typeof value);
}

function formatCompact(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function indent(text: string, spaces = 2): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}
