import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type GGAICorePlugin from "../main.ts";
import type { GGAIModelProfile, ProfileKind } from "../types/profile.ts";
import type { RequestLogEntry } from "../services/request-log.ts";
import { ProfileModal } from "./profile-modal.ts";
import { makeT, type Lang } from "./strings.ts";

type TabId = "profiles" | "secrets" | "logs" | "advanced" | "about";

export class GGAISettingsTab extends PluginSettingTab {
  private activeTab: TabId = "profiles";
  private unsubProfiles: (() => void) | null = null;

  constructor(app: App, private plugin: GGAICorePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    if (!this.unsubProfiles) {
      this.unsubProfiles = this.plugin.profileStore.on("profiles-changed", () => {
        this.display();
      });
    }

    this.renderTabBar(containerEl);

    const body = containerEl.createDiv();
    body.style.marginTop = "12px";

    if (this.activeTab === "profiles") this.renderProfiles(body);
    else if (this.activeTab === "secrets") this.renderSecrets(body);
    else if (this.activeTab === "logs") this.renderLogs(body);
    else if (this.activeTab === "advanced") this.renderAdvanced(body);
    else this.renderAbout(body);
  }

  hide(): void {
    this.unsubProfiles?.();
    this.unsubProfiles = null;
    super.hide();
  }

  private get lang(): Lang {
    return this.plugin.data.settings.uiLanguage ?? "ko";
  }

  private renderTabBar(el: HTMLElement): void {
    const L = makeT(this.lang);
    const bar = el.createDiv();
    bar.style.display = "flex";
    bar.style.gap = "4px";
    bar.style.borderBottom = "1px solid var(--background-modifier-border)";
    bar.style.paddingBottom = "4px";

    const make = (id: TabId, label: string) => {
      const b = bar.createEl("button", { text: label });
      b.style.background = this.activeTab === id ? "var(--interactive-accent)" : "transparent";
      b.style.color = this.activeTab === id ? "var(--text-on-accent)" : "var(--text-normal)";
      b.onclick = () => {
        this.activeTab = id;
        this.display();
      };
    };
    make("profiles", L("tab_profiles"));
    make("secrets", L("tab_secrets"));
    make("logs", "Logs");
    make("advanced", L("tab_advanced"));
    make("about", L("tab_about"));
  }

  private renderProfiles(el: HTMLElement): void {
    const L = makeT(this.lang);
    el.createEl("h2", { text: L("heading_profiles") });

    const actionRow = el.createDiv();
    actionRow.style.display = "flex";
    actionRow.style.gap = "8px";
    actionRow.style.marginBottom = "8px";

    const addChatBtn = actionRow.createEl("button", { text: "+ Chat" });
    addChatBtn.onclick = () => this.openAddModal("chat");
    const addTextBtn = actionRow.createEl("button", { text: "+ Text" });
    addTextBtn.onclick = () => this.openAddModal("text");
    const addImageBtn = actionRow.createEl("button", { text: "+ Image" });
    addImageBtn.onclick = () => this.openAddModal("image");
    const addVoiceBtn = actionRow.createEl("button", { text: "+ Voice" });
    addVoiceBtn.onclick = () => this.openAddModal("voice");

    const kinds: ProfileKind[] = ["chat", "text", "image", "voice"];
    for (const kind of kinds) {
      const section = el.createDiv();
      section.createEl("h3", { text: kind.toUpperCase() });
      const list = this.plugin.profileStore.list(kind);
      if (list.length === 0) {
        const p = section.createEl("p", {
          text: L("no_profiles").replace("{kind}", kind),
        });
        p.style.opacity = "0.7";
        continue;
      }
      for (const profile of list) {
        this.renderProfileRow(section, profile);
      }
    }
  }

  private renderProfileRow(el: HTMLElement, profile: GGAIModelProfile): void {
    const L = makeT(this.lang);
    const isDefault = (profile.kind === "chat" || profile.kind === "text" || profile.kind === "image")
      && !!(profile as { isDefault?: boolean }).isDefault;

    const setting = new Setting(el)
      .setName(isDefault ? `★ ${profile.name}` : profile.name)
      .setDesc(`${profile.provider} · ${profile.model}`);

    if (isDefault) {
      setting.settingEl.style.border = "2px solid var(--interactive-accent)";
      setting.settingEl.style.borderRadius = "6px";
      setting.settingEl.style.padding = "6px 8px";
    }

    setting.addButton((b) =>
      b.setButtonText(L("btn_edit")).onClick(() => {
        new ProfileModal(this.app, this.plugin, profile).open();
      })
    );
    setting.addButton((b) =>
      b.setButtonText(L("btn_clone")).onClick(async () => {
        const clone: GGAIModelProfile = {
          ...(profile as GGAIModelProfile),
          id: `profile_${Math.random().toString(36).slice(2, 11)}`,
          name: `${profile.name}${L("clone_suffix")}`,
          // 복제본이 원본의 기본 프로필 지위를 가로채지 않도록 항상 해제.
          // 해당 kind에 기본이 하나도 없을 때만 ProfileStore가 자동 지정한다.
          isDefault: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as GGAIModelProfile;
        await this.plugin.profileStore.add(clone);
        this.display();
      })
    );
    setting.addButton((b) =>
      b.setButtonText(L("btn_test")).onClick(async () => {
        new Notice(L("testing_connection"));
        try {
          const r = await this.plugin.generation.validate(profile.id);
          if (r.ok) new Notice(L("test_ok"));
          else new Notice(L("test_failed").replace("{error}", r.error ?? L("unknown")));
        } catch (e) {
          new Notice(L("test_error").replace("{error}", (e as Error).message));
        }
      })
    );
    setting.addButton((b) =>
      b
        .setButtonText(L("btn_delete"))
        .setWarning()
        .onClick(async () => {
          if (!confirm(L("confirm_delete_profile").replace("{name}", profile.name))) return;
          await this.plugin.profileStore.remove(profile.id);
          this.display();
        })
    );
  }

  private openAddModal(kind: ProfileKind): void {
    const modal = new ProfileModal(this.app, this.plugin, null, kind);
    const prevOnClose = modal.onClose.bind(modal);
    modal.onClose = () => {
      prevOnClose();
      this.display();
    };
    modal.open();
  }

  private renderSecrets(el: HTMLElement): void {
    const L = makeT(this.lang);
    el.createEl("h2", { text: L("heading_secrets") });
    const warn = el.createEl("p");
    warn.style.color = "var(--text-warning)";
    warn.setText(L("warn_secrets_plaintext"));

    const refs = this.plugin.secretsVault.listRefs();
    if (refs.length === 0) {
      const p = el.createEl("p");
      p.style.opacity = "0.7";
      p.setText(L("no_secrets"));
      return;
    }

    const queueNote = el.createEl("p");
    queueNote.style.opacity = "0.7";
    queueNote.style.fontSize = "var(--font-ui-smaller)";
    queueNote.setText(L("secrets_queue_note"));

    const refToProfiles = new Map<string, string[]>();
    for (const p of this.plugin.profileStore.list()) {
      if (!refToProfiles.has(p.apiKeyRef)) refToProfiles.set(p.apiKeyRef, []);
      refToProfiles.get(p.apiKeyRef)!.push(p.name);
    }

    for (const ref of refs) {
      const users = refToProfiles.get(ref) ?? [];
      const usageDesc = users.length
        ? L("in_use").replace("{names}", users.join(", "))
        : L("unused");
      new Setting(el)
        .setName(ref)
        .setDesc(`${this.plugin.secretsVault.mask(ref)} · ${usageDesc}`)
        .addToggle((t) => {
          const queued = this.plugin.generation.isQueueEnabled(ref);
          t.setTooltip(L("secrets_queue_name")).setValue(queued).onChange(async (v) => {
            if (!this.plugin.data.settings.serialQueueRefs) {
              this.plugin.data.settings.serialQueueRefs = {};
            }
            this.plugin.data.settings.serialQueueRefs[ref] = v;
            await this.plugin.persist();
          });
        })
        .addButton((b) =>
          b.setButtonText(L("btn_reenter")).onClick(async () => {
            const next = prompt(L("prompt_new_key").replace("{ref}", ref));
            if (next) {
              await this.plugin.secretsVault.set(ref, next);
              this.display();
            }
          })
        )
        .addButton((b) =>
          b
            .setButtonText(L("btn_delete"))
            .setWarning()
            .onClick(async () => {
              if (!confirm(L("confirm_delete_key").replace("{ref}", ref))) return;
              await this.plugin.secretsVault.remove(ref);
              this.display();
            })
        );
    }
  }

  private renderAdvanced(el: HTMLElement): void {
    const L = makeT(this.lang);
    el.createEl("h2", { text: L("heading_advanced") });

    new Setting(el)
      .setName(L("setting_language_name"))
      .setDesc(L("setting_language_desc"))
      .addDropdown((d) =>
        d
          .addOption("ko", L("lang_ko"))
          .addOption("en", L("lang_en"))
          .setValue(this.lang)
          .onChange(async (v) => {
            this.plugin.data.settings.uiLanguage = v as "ko" | "en";
            await this.plugin.persist();
            this.display();
          })
      );

    new Setting(el)
      .setName(L("setting_timeout_name"))
      .setDesc(L("setting_timeout_desc"))
      .addText((t) =>
        t.setValue(String(this.plugin.data.settings.requestTimeoutMs)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            this.plugin.data.settings.requestTimeoutMs = n;
            await this.plugin.persist();
          }
        })
      );

    new Setting(el)
      .setName(L("setting_max_turns_name"))
      .setDesc(L("setting_max_turns_desc"))
      .addText((t) =>
        t.setValue(String(this.plugin.data.settings.defaultMaxTurns)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            this.plugin.data.settings.defaultMaxTurns = n;
            await this.plugin.persist();
          }
        })
      );

    new Setting(el)
      .setName(L("setting_log_name"))
      .setDesc(L("setting_log_desc"))
      .addToggle((t) =>
        t.setValue(this.plugin.data.settings.logRequests).onChange(async (v) => {
          this.plugin.data.settings.logRequests = v;
          await this.plugin.persist();
        })
      );

    new Setting(el)
      .setName(L("setting_cancel_all_name"))
      .addButton((b) =>
        b.setButtonText(L("btn_cancel")).onClick(() => {
          this.plugin.generation.cancelAll();
          this.plugin.agentRuntime.cancelAll();
          new Notice(L("notice_cancelled_all"));
        })
      );
  }

  private renderLogs(el: HTMLElement): void {
    el.createEl("h2", { text: "Request Logs" });
    const actions = el.createDiv();
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginBottom = "12px";

    actions.createEl("button", { text: "Refresh" }).onclick = () => this.display();
    actions.createEl("button", { text: "Clear logs" }).onclick = () => {
      if (!confirm("Clear all GGAI request logs?")) return;
      this.plugin.requestLogs.clear();
      this.display();
    };

    const logs = this.plugin.requestLogs.list();
    if (logs.length === 0) {
      const empty = el.createEl("p", { text: "No request logs yet." });
      empty.style.opacity = "0.7";
      return;
    }

    for (const group of groupRequestLogs(logs)) {
      const latest = group[0];
      const details = el.createEl("details");
      details.style.border = "1px solid var(--background-modifier-border)";
      details.style.borderRadius = "6px";
      details.style.padding = "8px";
      details.style.marginBottom = "8px";

      const time = new Date(latest.createdAt).toLocaleString();
      const phases = group.map((log) => log.phase).join(" -> ");
      details.createEl("summary", {
        text: `${time} | ${phases} | ${latest.transport} | ${latest.profileName} | ${latest.model}`,
      });

      renderLogGroup(details, group);
    }
  }

  private renderAbout(el: HTMLElement): void {
    const L = makeT(this.lang);
    el.createEl("h2", { text: "GGAI Core" });
    const p1 = el.createEl("p");
    p1.setText(L("about_version_desc").replace("{version}", this.plugin.manifest.version));
    const p2 = el.createEl("p");
    p2.style.opacity = "0.7";
    p2.setText(L("about_features"));
  }
}

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

function renderLogGroup(container: HTMLElement, group: RequestLogEntry[]): void {
  const first = group[0];
  const meta = container.createEl("pre");
  meta.style.whiteSpace = "pre-wrap";
  meta.style.fontSize = "12px";
  meta.style.margin = "8px 0";
  meta.setText(
    [
      `${first.provider} / ${first.model}`,
      `profile: ${first.profileName}`,
      `transport: ${first.transport}`,
    ].join("\n")
  );

  for (const log of group) {
    if (log.body !== undefined) {
      renderLogPayload(container, "REQUEST", log, "body", formatPayload(log.body));
    }
    if (log.response !== undefined) {
      renderLogPayload(container, "RESPONSE", log, "response", formatPayload(log.response));
    }
    if (log.error) {
      renderLogPayload(container, "ERROR", log, "error", log.error);
    }
  }
}

function renderLogPayload(
  container: HTMLElement,
  label: "REQUEST" | "RESPONSE" | "ERROR",
  log: RequestLogEntry,
  kind: "body" | "response" | "error",
  text: string
): void {
  const details = container.createEl("details");
  details.style.border = "1px solid var(--background-modifier-border)";
  details.style.borderRadius = "6px";
  details.style.marginTop = "8px";
  details.style.backgroundColor =
    kind === "body"
      ? "rgba(60, 120, 255, 0.08)"
      : kind === "response"
        ? "rgba(80, 170, 120, 0.08)"
        : "rgba(220, 80, 80, 0.08)";

  const summaryParts = [
    `${label} ${new Date(log.createdAt).toLocaleTimeString()}`,
    log.transport,
  ];
  if (log.status != null) summaryParts.push(`status ${log.status}`);
  if (log.url) summaryParts.push(log.url);

  const summary = details.createEl("summary", {
    text: summaryParts.join(" | "),
  });
  summary.style.padding = "6px 8px";
  summary.style.cursor = "pointer";

  const copyBtn = details.createEl("button", { text: "Copy" });
  copyBtn.style.margin = "0 8px 8px";
  copyBtn.onclick = (e) => {
    e.preventDefault();
    void navigator.clipboard.writeText(text).then(
      () => {
        const prev = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        window.setTimeout(() => {
          copyBtn.textContent = prev;
        }, 1500);
      },
      () => {
        copyBtn.textContent = "Copy failed";
      }
    );
  };

  const pre = details.createEl("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.maxHeight = "420px";
  pre.style.overflow = "auto";
  pre.style.fontSize = "12px";
  pre.style.margin = "0";
  pre.style.padding = "8px";
  pre.setText(text);
}

function formatPayload(value: unknown): string {
  if (typeof value === "string") return indent(value);
  if (!value || typeof value !== "object") return indent(String(value));

  const rec = value as Record<string, unknown>;
  const lines: string[] = [];
  for (const [key, v] of Object.entries(rec)) {
    if (key === "raw" || key === "events") continue;
    if (key === "messages" && Array.isArray(v)) {
      lines.push("messages:");
      for (const msg of v) lines.push(indent(formatMessage(msg), 2));
    } else if (key === "prompt" || key === "text" || key === "reasoning") {
      lines.push(`${key}:\n${indent(formatTextSummary(v), 2)}`);
    } else if (key === "usage" && v && typeof v === "object") {
      const usage = v as Record<string, unknown>;
      lines.push(`usage: input ${usage.inputTokens ?? usage.prompt_tokens ?? 0}, output ${usage.outputTokens ?? usage.completion_tokens ?? 0}`);
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
  return text.split("\n").map((line) => `${pad}${line}`).join("\n");
}
