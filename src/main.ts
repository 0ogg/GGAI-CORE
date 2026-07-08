// ─── GGAI Core Plugin 엔트리 ───

import { Plugin, Notice, SuggestModal } from "obsidian";

import { ProfileStore } from "./storage/profile-store.ts";
import { SecretsVault } from "./storage/secrets-vault.ts";
import { ProviderRegistry } from "./providers/index.ts";
import { GenerationService, GGAISettings } from "./services/generation-service.ts";
import { RequestLogStore, type RequestLogEntry } from "./services/request-log.ts";
import { ErrorLogStore, type ErrorLogEntry } from "./services/error-log.ts";
import { AgentRuntime } from "./services/agent-runtime.ts";
import { createApi, GGAIApi } from "./api.ts";
import { GGAISettingsTab } from "./ui/settings-tab.ts";
import { ProfileModal } from "./ui/profile-modal.ts";
import { LogModal } from "./ui/log-modal.ts";
import { makeT } from "./ui/strings.ts";
import type { GGAIModelProfile } from "./types/profile.ts";

// ── Public 타입 ──

export type { GGAIApi, RequestLogSummary } from "./api.ts";
export type { ErrorLogEntry } from "./services/error-log.ts";
export type {
  GGAIModelProfile,
  ChatProfile,
  TextProfile,
  ImageProfile,
  VoiceProfile,
  PublicProfile,
  ProfileKind,
  ProviderKind,
} from "./types/profile.ts";
export type {
  ChatRequest,
  ChatResponse,
  ChatEvent,
  GGAIChatMessage,
  ContentBlock,
  ToolCall,
  TextRequest,
  TextResponse,
  ImageRequest,
  ImageResponse,
  TTSRequest,
  TTSResponse,
  STTRequest,
  STTResponse,
} from "./types/chat.ts";
export type { AgentRequest, AgentEvent, TotalUsage } from "./types/agent.ts";
export type { ToolDef, ToolContext, ToolResult } from "./types/tool.ts";
export type { CountTokensInput, CountTokensOptions } from "./tokens/counter.ts";
export { countTokens } from "./tokens/counter.ts";
export { GGAICancelledError } from "./services/generation-service.ts";

// ── 데이터 스키마 ──

interface GGAIDataShape {
  ggai_profiles: GGAIModelProfile[];
  ggai_secrets: Record<string, string>;
  ggai_settings: GGAISettings;
  ggai_request_logs: RequestLogEntry[];
  ggai_error_logs: ErrorLogEntry[];
  [otherKey: string]: unknown;
}

const DEFAULT_GGAI_SETTINGS: GGAISettings = {
  requestTimeoutMs: 120_000,
  defaultMaxTurns: 20,
  logRequests: false,
  uiLanguage: "ko",
  serialQueueRefs: {},
};

declare global {
  interface Window {
    GGAICorePlugin?: GGAICorePlugin;
  }
}

const SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
const SPINNER_INTERVAL_MS = 80;

export default class GGAICorePlugin extends Plugin {
  data!: {
    profiles: GGAIModelProfile[];
    secrets: Record<string, string>;
    settings: GGAISettings;
    requestLogs: RequestLogEntry[];
    errorLogs: ErrorLogEntry[];
  };
  profileStore!: ProfileStore;
  secretsVault!: SecretsVault;
  providers!: ProviderRegistry;
  generation!: GenerationService;
  agentRuntime!: AgentRuntime;
  requestLogs!: RequestLogStore;
  errorLogs!: ErrorLogStore;
  api!: GGAIApi;
  // 활성 요청 id → 그 요청을 표시 중인 토스트 + 스피너 span
  private activeNotices: Map<number, { notice: Notice; spinnerEl: HTMLElement }> = new Map();
  private spinnerTimer: number | null = null;
  private spinnerFrame = 0;
  private unsubActive: (() => void) | null = null;
  private unsubError: (() => void) | null = null;

  async onload(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<GGAIDataShape> | null;

    this.data = {
      profiles: loaded?.ggai_profiles ?? [],
      secrets: loaded?.ggai_secrets ?? {},
      settings: {
        ...DEFAULT_GGAI_SETTINGS,
        ...(loaded?.ggai_settings ?? {}),
      },
      requestLogs: loaded?.ggai_request_logs ?? [],
      errorLogs: loaded?.ggai_error_logs ?? [],
    };

    this.secretsVault = new SecretsVault(this.data.secrets, () => this.persist());
    this.profileStore = new ProfileStore(this.data.profiles, () => this.persist());
    this.requestLogs = new RequestLogStore(this.data.requestLogs, () => this.persist());
    this.errorLogs = new ErrorLogStore(this.data.errorLogs, () => this.persist());
    this.providers = new ProviderRegistry();
    this.generation = new GenerationService(
      this.profileStore,
      this.secretsVault,
      this.providers,
      this.data.settings,
      this.requestLogs,
      this.errorLogs
    );
    this.agentRuntime = new AgentRuntime(this.generation, this.app, {
      defaultMaxTurns: this.data.settings.defaultMaxTurns,
    });
    this.api = createApi(this);

    this.addSettingTab(new GGAISettingsTab(this.app, this));

    // 생성 진행 상태는 Obsidian 토스트(Notice)로 표시한다 — 요청당 하나씩,
    // 각 토스트에 개별 취소(✕) 버튼. 네이티브 알림 스택에 함께 쌓이므로
    // 다른 플러그인/기본 알림과 겹치거나 가리지 않는다.
    this.unsubActive = this.generation.on("active-changed", () => this.syncNotices());

    // API 요청 에러 발생 시 3초짜리 토스트를 띄우고, 클릭하면 로그 창을 연다.
    this.unsubError = this.errorLogs.onError((entry) => this.showErrorNotice(entry));

    this.addCommand({
      id: "open-settings",
      name: "GGAI: 설정 열기",
      callback: () => {
        const setting = (this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting;
        setting.open();
        setting.openTabById(this.manifest.id);
      },
    });

    this.addCommand({
      id: "add-profile",
      name: "GGAI: 모델 프로필 추가",
      callback: () => {
        new ProfileModal(this.app, this, null).open();
      },
    });

    this.addCommand({
      id: "test-profile",
      name: "GGAI: 프로필 연결 테스트",
      callback: async () => {
        const list = this.profileStore.list();
        if (!list.length) {
          new Notice("등록된 프로필이 없습니다");
          return;
        }
        const profile = list[0];
        new Notice(`테스트 중: ${profile.name}`);
        try {
          const r = await this.generation.validate(profile.id);
          new Notice(r.ok ? "✅ 연결 OK" : `❌ ${r.error ?? "실패"}`);
        } catch (e) {
          new Notice(`❌ ${(e as Error).message}`);
        }
      },
    });

    this.addCommand({
      id: "cancel-all",
      name: "GGAI: 진행 중인 모든 요청 취소",
      callback: () => {
        this.generation.cancelAll();
        this.agentRuntime.cancelAll();
        new Notice("모든 요청 취소 요청됨");
      },
    });

    this.addCommand({
      id: "edit-profile",
      name: "GGAI: 프로필 편집",
      callback: () => this.promptEditProfile(),
    });

    window.GGAICorePlugin = this;
    console.log(`[GGAI Core] loaded v${this.manifest.version}`);
  }

  async onunload(): Promise<void> {
    try {
      this.generation?.cancelAll();
      this.agentRuntime?.cancelAll();
    } catch { /* ignore */ }
    this.unsubActive?.();
    this.unsubActive = null;
    this.unsubError?.();
    this.unsubError = null;
    this.stopSpinner();
    for (const { notice } of this.activeNotices.values()) notice.hide();
    this.activeNotices.clear();
    window.GGAICorePlugin = undefined;
    console.log("[GGAI Core] unloaded");
  }

  // 활성 요청 집합과 떠 있는 토스트를 일치시킨다.
  // 새 요청 → 토스트 생성, 끝난 요청 → 토스트 hide.
  private syncNotices(): void {
    const active = this.generation.getActive();
    const activeIds = new Set(active.map((t) => t.id));

    // 끝난 요청의 토스트 제거
    for (const [id, entry] of this.activeNotices) {
      if (!activeIds.has(id)) {
        entry.notice.hide();
        this.activeNotices.delete(id);
      }
    }

    // 새 요청의 토스트 생성
    for (const task of active) {
      if (this.activeNotices.has(task.id)) continue;

      const frag = document.createDocumentFragment();
      const wrap = frag.createDiv();
      wrap.style.cssText = "display:flex;align-items:center;gap:8px;";

      const spinner = wrap.createSpan();
      spinner.setText(SPINNER_FRAMES[this.spinnerFrame]);
      spinner.style.cssText = "flex:0 0 auto;font-family:var(--font-monospace)";

      const label = wrap.createSpan({ text: task.model });
      label.style.cssText = "flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

      const cancelBtn = wrap.createEl("span", { text: "✕" });
      cancelBtn.setAttr("aria-label", `요청 취소: ${task.model}`);
      cancelBtn.setAttr("role", "button");
      cancelBtn.style.cssText =
        "flex:0 0 auto;cursor:pointer;color:var(--text-muted);font-size:12px;line-height:1";

      // ✕ 또는 토스트 본문 클릭 → 해당 요청만 취소. cancel()은 멱등이라
      // 본문 클릭(토스트 자동 dismiss)과 ✕ 클릭이 겹쳐도 안전하다.
      const cancel = () => this.generation.cancel(task.id);
      cancelBtn.onclick = cancel;
      wrap.onclick = cancel;

      const notice = new Notice(frag, 0);
      this.activeNotices.set(task.id, { notice, spinnerEl: spinner });
    }

    if (this.activeNotices.size > 0) {
      if (this.spinnerTimer === null) {
        this.spinnerTimer = window.setInterval(() => {
          this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
          const frame = SPINNER_FRAMES[this.spinnerFrame];
          for (const { spinnerEl } of this.activeNotices.values()) spinnerEl.setText(frame);
        }, SPINNER_INTERVAL_MS);
      }
    } else {
      this.stopSpinner();
    }
  }

  // 에러 토스트: 3초간 표시, 클릭하면 로그 창(LogModal)이 해당 에러를 펼친 채 열린다.
  private showErrorNotice(entry: ErrorLogEntry): void {
    const L = makeT(this.data.settings.uiLanguage ?? "ko");
    const frag = document.createDocumentFragment();
    const wrap = frag.createDiv();
    wrap.style.cssText = "cursor:pointer;line-height:1.4;";

    const head = wrap.createDiv();
    const status = entry.status != null ? ` (${entry.status})` : "";
    head.setText(`❌ ${entry.model}${status}`);
    head.style.cssText = "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

    const msg = wrap.createDiv();
    msg.setText(entry.message);
    msg.style.cssText =
      "font-size:12px;opacity:0.85;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;";

    const hint = wrap.createDiv();
    hint.setText(L("error_notice_hint"));
    hint.style.cssText = "font-size:11px;opacity:0.6;margin-top:4px;";

    const notice = new Notice(frag, 3000);
    wrap.onclick = () => {
      notice.hide();
      new LogModal(this.app, this, entry.id).open();
    };
  }

  private stopSpinner(): void {
    if (this.spinnerTimer !== null) {
      window.clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.spinnerFrame = 0;
  }

  async persist(): Promise<void> {
    const existing = ((await this.loadData()) as Record<string, unknown>) ?? {};
    const merged: Record<string, unknown> = {
      ...existing,
      ggai_profiles: this.profileStore ? this.profileStore.snapshot() : this.data.profiles,
      ggai_secrets: this.secretsVault ? this.secretsVault.snapshot() : this.data.secrets,
      ggai_settings: this.data.settings,
      ggai_request_logs: this.requestLogs ? this.requestLogs.snapshot() : this.data.requestLogs,
      ggai_error_logs: this.errorLogs ? this.errorLogs.snapshot() : this.data.errorLogs,
    };
    await this.saveData(merged);
  }

  /**
   * 특정 프로필 편집 모달을 연다. 외부 플러그인(예: Stella)에서 호출.
   * @returns profileId 가 비어 있거나 프로필을 못 찾으면 false.
   */
  openProfileEditor(profileId?: string): boolean {
    if (!profileId) return false;
    const profile = this.profileStore.get(profileId);
    if (!profile) return false;
    new ProfileModal(this.app, this, profile).open();
    return true;
  }

  /** 커맨드 팔레트 진입점: 프로필을 선택해 편집 모달을 연다. */
  private promptEditProfile(): void {
    const list = this.profileStore.list();
    if (list.length === 0) {
      new Notice("등록된 프로필이 없습니다");
      return;
    }
    if (list.length === 1) {
      new ProfileModal(this.app, this, list[0]).open();
      return;
    }
    new ProfileSelectModal(this.app, list, (p) => {
      new ProfileModal(this.app, this, p).open();
    }).open();
  }
}

/**
 * 명령 팔레트에서 프로필을 선택하기 위한 검색 모달.
 * list 가 2개 이상일 때만 사용된다.
 */
class ProfileSelectModal extends SuggestModal<GGAIModelProfile> {
  constructor(
    app: import("obsidian").App,
    private profiles: GGAIModelProfile[],
    private onPick: (p: GGAIModelProfile) => void
  ) {
    super(app);
    this.setPlaceholder("편집할 프로필 선택...");
  }

  getSuggestions(query: string): GGAIModelProfile[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.profiles;
    return this.profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        `${p.provider} ${p.model}`.toLowerCase().includes(q)
    );
  }

  renderSuggestion(p: GGAIModelProfile, el: HTMLElement): void {
    el.createEl("div", { text: p.name });
    el.createEl("div", {
      text: `${p.provider} · ${p.model}`,
      cls: "mod-muted",
    });
  }

  onChooseSuggestion(p: GGAIModelProfile): void {
    this.onPick(p);
  }
}
