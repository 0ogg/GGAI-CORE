// ─── 에러 로그 모달 ───
// 요청 에러 토스트를 클릭하면 열리는 창. ErrorLogStore의 최근 에러를 최신순으로
// 보여준다(설정 탭의 전체 요청 로그와 달리 에러만, 전체 메시지 포함).

import { App, Modal } from "obsidian";
import type GGAICorePlugin from "../main.ts";
import type { ErrorLogEntry } from "../services/error-log.ts";
import { makeT } from "./strings.ts";

const MAX_SHOWN = 50;

export class LogModal extends Modal {
  constructor(app: App, private plugin: GGAICorePlugin, private focusId?: string) {
    super(app);
  }

  onOpen(): void {
    const L = makeT(this.plugin.data.settings.uiLanguage ?? "ko");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: L("log_modal_title") });

    const entries = this.plugin.errorLogs.list(MAX_SHOWN);
    if (entries.length === 0) {
      const empty = contentEl.createEl("p", { text: L("log_modal_empty") });
      empty.style.opacity = "0.7";
      return;
    }

    for (const entry of entries) {
      this.renderEntry(contentEl, entry, L);
    }
  }

  private renderEntry(
    parent: HTMLElement,
    entry: ErrorLogEntry,
    L: ReturnType<typeof makeT>
  ): void {
    const details = parent.createEl("details");
    details.style.border = "1px solid var(--background-modifier-border)";
    details.style.borderRadius = "6px";
    details.style.padding = "8px";
    details.style.marginBottom = "8px";
    details.style.backgroundColor = "rgba(220, 80, 80, 0.08)";
    // 토스트에서 클릭해 들어온 에러는 펼친 상태로 보여준다.
    if (this.focusId && entry.id === this.focusId) details.open = true;

    const time = new Date(entry.createdAt).toLocaleString();
    const parts = [time, `${entry.provider} / ${entry.model}`];
    if (entry.status != null) parts.push(`status ${entry.status}`);
    const summary = details.createEl("summary", { text: parts.join(" | ") });
    summary.style.cursor = "pointer";

    const meta = [entry.profileName, entry.transport, entry.url].filter(Boolean).join(" | ");
    if (meta) {
      const metaEl = details.createEl("div", { text: meta });
      metaEl.style.opacity = "0.7";
      metaEl.style.fontSize = "12px";
      metaEl.style.margin = "4px 0";
    }

    const copyBtn = details.createEl("button", { text: L("btn_copy") });
    copyBtn.style.margin = "4px 0 8px";
    copyBtn.onclick = (e) => {
      e.preventDefault();
      void navigator.clipboard.writeText(entry.message).then(
        () => {
          const prev = copyBtn.textContent;
          copyBtn.textContent = L("copied");
          window.setTimeout(() => (copyBtn.textContent = prev), 1500);
        },
        () => (copyBtn.textContent = L("copy_failed"))
      );
    };

    const pre = details.createEl("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.maxHeight = "420px";
    pre.style.overflow = "auto";
    pre.style.fontSize = "12px";
    pre.style.margin = "0";
    pre.style.padding = "8px";
    pre.setText(entry.message);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
