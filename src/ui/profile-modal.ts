import { App, Modal, Notice, Setting, setIcon, setTooltip } from "obsidian";
import type GGAICorePlugin from "../main.ts";
import type {
  ChatProfile,
  GGAIModelProfile,
  ImageProfile,
  ProfileKind,
  ProviderKind,
  TextProfile,
  VoiceProfile,
} from "../types/profile.ts";
import { fetchElevenLabsVoices, fetchModels } from "../api/fetchModels.ts";
import { parseNovelAiImage, type NaiImportedParams } from "../util/nai-metadata.ts";
import { getProvider } from "../data/providers.ts";
import {
  getProviderParamDefaults,
  detectCompatService,
  compatServiceLabel,
  getReasoningSupport,
  COMPAT_PRESET_BASE_URL,
  type CompatService,
} from "../data/provider-params.ts";
import type { Provider, ModelInfo } from "../data/providers.ts";
import { makeT, type Lang } from "./strings.ts";

// ── NAI image size presets ──
const NAI_SIZE_PRESETS: { key: string; label: string; w: number; h: number }[] = [
  { key: "portrait", label: "Portrait 832×1216", w: 832, h: 1216 },
  { key: "landscape", label: "Landscape 1216×832", w: 1216, h: 832 },
  { key: "square", label: "Square 1024×1024", w: 1024, h: 1024 },
];

const NAI_SAMPLERS = [
  "k_euler",
  "k_euler_ancestral",
  "k_dpmpp_2s_ancestral",
  "k_dpmpp_2m",
  "k_dpmpp_2m_sde",
  "k_dpmpp_sde",
  "ddim_v3",
];

const NAI_NOISE_SCHEDULES = ["karras", "native", "exponential", "polyexponential"];

type SizePresetKey = "portrait" | "landscape" | "square" | "custom";

type EditorState = {
  id: string;
  name: string;
  kind: ProfileKind;
  provider: ProviderKind;
  baseUrl: string;
  apiKeyRef: string;
  apiKey: string;
  model: string;
  availableModels: ModelInfo[];
  isDefault: boolean;
  // chat
  temperature?: number;
  maxTokens?: number;
  /** 입력(프롬프트) 토큰 상한. undefined=제한 없음. */
  maxContextTokens?: number;
  thinkingBudget?: number;
  thinkingDisabled: boolean;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "max" | "xhigh";
  streamingEnabled: boolean;
  // sampling (chat & text)
  topP?: number;
  topK?: number;
  minP?: number;
  // 외부 플러그인 paramsOverride에 허용할 샘플링 키 (체크박스)
  allowTopK: boolean;
  allowTopP: boolean;
  allowMinP: boolean;
  // text (NovelAI)
  stopSequences?: string;
  // image (NovelAI) ─ size
  sizePreset?: SizePresetKey;
  width?: number;
  height?: number;
  // image ─ sampling
  scale?: number;
  sampler?: string;
  steps?: number;
  nSamples?: number;
  seed?: number;
  noiseSchedule?: string;
  // image ─ CFG
  cfgRescale?: number;
  uncondScale?: number;
  skipCfgAboveSigma?: number;
  skipCfgBelowSigma?: number;
  // image ─ Dynamic Thresholding
  dynamicThresholding?: boolean;
  dynamicThresholdingPercentile?: number;
  dynamicThresholdingMimicScale?: number;
  // image ─ prompt (v4)
  imagePrompt?: string;
  negativePrompt?: string;
  useOrder?: boolean;
  // image ─ advanced
  controlnetStrength?: number;
  preferBrownian?: boolean;
  cfgSchedEligibility?: string;
  deliberateEulerAncestralBug?: boolean;
  explikeFineDetail?: boolean;
  minimizeSigmaInf?: boolean;
  uncondPerVibe?: boolean;
  wonkyVibeCorrelation?: boolean;
  // voice (ElevenLabs TTS)
  voice?: string;
  format?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  language?: string;
  availableVoices?: Array<{ id: string; name: string; category?: string }>;
};

export class ProfileModal extends Modal {
  private state: EditorState;
  private readonly isEdit: boolean;
  private readonly original: GGAIModelProfile | null;

  constructor(
    app: App,
    private plugin: GGAICorePlugin,
    existing: GGAIModelProfile | null,
    defaultKind: ProfileKind = "chat"
  ) {
    super(app);
    this.original = existing;
    this.isEdit = !!existing;
    this.state = initState(existing, defaultKind, plugin);
    this.syncProviderToKind();
  }

  private get lang(): Lang {
    return this.plugin.data.settings.uiLanguage ?? "ko";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    const L = makeT(this.lang);

    contentEl.createEl("h2", { text: this.isEdit ? L("modal_title_edit") : L("modal_title_add") });

    new Setting(contentEl).setName(L("field_display_name")).addText((t) =>
      t
        .setPlaceholder(L("placeholder_display_name"))
        .setValue(this.state.name)
        .onChange((v) => (this.state.name = v))
    );

    new Setting(contentEl).setName(L("field_kind")).addDropdown((d) => {
      d.addOption("chat", L("kind_chat"))
        .addOption("text", L("kind_text"))
        .addOption("image", L("kind_image"))
        .addOption("voice", L("kind_voice"))
        .setValue(this.state.kind)
        .onChange((v) => {
          this.state.kind = v as ProfileKind;
          this.syncProviderToKind();
          // 바뀐 provider 기준으로 샘플링 게이트 토글 기본값 재계산
          // (예: chat→text 전환 시 novelai의 min_p 지원 반영)
          this.applyProviderParamDefaults();
          this.render();
        });
    });

    if (this.state.kind === "chat") {
      new Setting(contentEl).setName(L("field_provider")).addDropdown((d) => {
        d.addOption("anthropic", "Anthropic")
          .addOption("openai", "OpenAI")
          .addOption("google", "Google Gemini")
          .addOption("deepseek", "DeepSeek")
          .addOption("openrouter", "OpenRouter")
          .addOption("zai", "z.ai")
          .addOption("nanogpt", "NanoGPT")
          .addOption("openai-compatible", L("provider_openai_compatible"))
          .setValue(providerDropdownValue(this.state))
          .onChange((v) => {
            const preset = COMPAT_PRESET_BASE_URL[v as CompatService];
            if (preset) {
              this.state.provider = "openai-compatible";
              this.state.baseUrl = preset;
            } else {
              this.state.provider = v as ProviderKind;
            }
            this.applyProviderParamDefaults();
            this.render();
          });
      });
    } else {
      this.tip(
        new Setting(contentEl).setName(L("field_provider")).addText((t) => {
          t.setValue(providerLabel(this.state.provider, L)).setDisabled(true);
        }),
        providerLockDesc(this.state.kind, L)
      );
    }

    this.tip(
      new Setting(contentEl).setName(L("field_base_url")).addText((t) =>
        t
          .setPlaceholder("https://...")
          .setValue(this.state.baseUrl)
          .onChange((v) => (this.state.baseUrl = v))
      ),
      baseUrlDesc(this.state, L)
    );

    this.tip(
      new Setting(contentEl).setName(L("field_api_key")).addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.state.apiKey).onChange((v) => (this.state.apiKey = v));
      }),
      L("desc_api_key")
    );

    const storedRefs = this.plugin.secretsVault.listRefs();
    const refsHint =
      storedRefs.length > 0
        ? L("stored_refs_hint").replace(
            "{refs}",
            storedRefs.map((r) => `${r} (${this.plugin.secretsVault.mask(r)})`).join(", ")
          )
        : L("no_stored_refs");
    this.tip(
      new Setting(contentEl).setName(L("field_api_key_ref")).addText((t) =>
        t
          .setPlaceholder(this.defaultApiKeyRef())
          .setValue(this.state.apiKeyRef)
          .onChange((v) => (this.state.apiKeyRef = v))
      ),
      `${L("desc_api_key_ref_prefix").replace("{default}", this.defaultApiKeyRef())} ${refsHint}`
    );

    this.renderModelRow(contentEl);

    if (this.state.kind === "chat") this.renderChatSection(contentEl);
    if (this.state.kind === "text") this.renderTextSection(contentEl);
    if (this.state.kind === "image") this.renderImageSection(contentEl);
    if (this.state.kind === "voice") this.renderVoiceSection(contentEl);

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "16px";
    btnRow.style.justifyContent = "flex-end";

    const saveBtn = btnRow.createEl("button", {
      text: this.isEdit ? L("btn_save") : L("btn_add"),
      cls: "mod-cta",
    });
    saveBtn.onclick = async () => {
      await this.save();
    };
    const cancelBtn = btnRow.createEl("button", { text: L("btn_cancel_modal") });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.onOpen();
  }

  private tip(s: Setting, text: string): Setting {
    attachHelpIcon(s.nameEl, text);
    return s;
  }

  private syncProviderToKind(): void {
    if (this.state.kind === "text" || this.state.kind === "image") {
      this.state.provider = "novelai";
    } else if (this.state.kind === "voice") {
      this.state.provider = "elevenlabs";
    } else if (
      this.state.provider === "novelai" ||
      this.state.provider === "elevenlabs"
    ) {
      this.state.provider = "anthropic";
    }
  }

  /** 현재 provider/baseUrl/model 기준으로 allowedParams 체크박스를 자동 설정 */
  private applyProviderParamDefaults(): void {
    const d = getProviderParamDefaults(
      this.state.provider,
      this.state.baseUrl,
      this.state.model
    );
    this.state.allowTopP = d.topP;
    this.state.allowTopK = d.topK;
    this.state.allowMinP = d.minP;
  }

  /** 선택한 모델의 최대 입력 토큰 수가 알려져 있으면 max input tokens를 그 값으로 채운다.
   *  chat/text 프로필에만 의미가 있고, 값이 없는 모델(Anthropic/OpenAI 등)은 건드리지 않는다. */
  private applyModelInputLimit(modelId: string): void {
    if (this.state.kind !== "chat" && this.state.kind !== "text") return;
    const info = this.state.availableModels.find((m) => m.id === modelId);
    if (info?.inputTokenLimit !== undefined) {
      this.state.maxContextTokens = info.inputTokenLimit;
    }
  }

  private defaultApiKeyRef(): string {
    if (this.state.provider === "novelai") return "novelai-default";
    if (this.state.provider === "elevenlabs") return "elevenlabs-default";
    if (this.state.provider === "openai-compatible") {
      // DeepSeek/OpenRouter/z.ai/NanoGPT 등 서로 다른 서비스가 모두 "openai-compatible"로
      // 저장되므로, 감지된 서비스별로 키 참조를 나눠야 여러 프로필의 API 키가 서로 덮어쓰지 않는다.
      const svc = detectCompatService(this.state.baseUrl, this.state.model);
      if (svc !== "unknown") return `${svc}-default`;
    }
    return `${this.state.provider}-default`;
  }

  private renderModelRow(contentEl: HTMLElement): void {
    const L = makeT(this.lang);
    const modelSetting = this.tip(
      new Setting(contentEl).setName(L("field_model")),
      L("desc_model")
    );
    modelSetting.addText((t) => {
      t.inputEl.style.width = "260px";
      t.setPlaceholder(this.modelPlaceholder())
        .setValue(this.state.model)
        .onChange((v) => (this.state.model = v));
    });

    const row = contentEl.createDiv();
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    row.style.margin = "4px 0 12px 0";
    row.style.paddingLeft = "16px";

    const loadBtn = row.createEl("button", { text: L("btn_load_models") });
    const statusSpan = row.createEl("span");
    statusSpan.style.fontSize = "12px";
    statusSpan.style.color = "var(--text-muted)";

    const renderDropdown = () => {
      const existing = row.querySelector("select.ggai-model-select");
      if (existing) existing.remove();
      if (this.state.availableModels.length === 0) return;
      const sel = row.createEl("select") as HTMLSelectElement;
      sel.className = "ggai-model-select";
      sel.style.maxWidth = "260px";
      const placeholder = sel.createEl("option", { text: L("placeholder_select_list") });
      (placeholder as HTMLOptionElement).value = "";
      for (const m of this.state.availableModels) {
        const opt = sel.createEl("option", { text: m.name !== m.id ? `${m.name} (${m.id})` : m.id });
        (opt as HTMLOptionElement).value = m.id;
      }
      sel.value = this.state.model;
      sel.onchange = () => {
        if (sel.value) {
          this.state.model = sel.value;
          this.applyModelInputLimit(sel.value);
          this.render();
        }
      };
    };

    if (this.state.kind === "image") {
      const nai = getProvider("novelai");
      const list = nai?.staticModels ?? [];
      this.state.availableModels = list.map((m) => ({ id: m.id, name: m.name }));
      statusSpan.textContent = L("n_models_built_in").replace("{count}", String(list.length));
      renderDropdown();
      loadBtn.style.display = "none";
      return;
    }
    renderDropdown();

    loadBtn.onclick = async () => {
      const provider = this.resolveProvider();
      if (!provider) {
        new Notice(L("notice_no_model_list"));
        return;
      }
      const apiKey =
        this.state.apiKey ||
        this.plugin.secretsVault.get(this.state.apiKeyRef || this.defaultApiKeyRef()) ||
        "";
      if (!apiKey && this.state.provider !== "openai-compatible") {
        new Notice(L("notice_enter_api_key"));
        return;
      }
      statusSpan.textContent = L("loading");
      try {
        const models = await fetchModels(provider, apiKey);
        this.state.availableModels = models;
        statusSpan.textContent = L("n_models").replace("{count}", String(models.length));
        renderDropdown();
      } catch (e) {
        statusSpan.textContent = L("failed");
        new Notice(L("notice_model_load_failed").replace("{error}", (e as Error).message));
      }
    };
  }

  private modelPlaceholder(): string {
    const L = makeT(this.lang);
    if (this.state.kind === "image") return L("model_ph_image");
    if (this.state.kind === "text") return L("model_ph_text");
    if (this.state.kind === "voice") return L("model_ph_voice");
    return L("model_ph_chat");
  }

  private resolveProvider(): Provider | null {
    const kind = this.state.provider;
    if (kind === "anthropic") {
      const p = getProvider("anthropic");
      if (!p) return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (kind === "openai") {
      const p = getProvider("openai");
      if (!p) return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (kind === "google") {
      const p = getProvider("gemini");
      if (!p) return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (kind === "novelai") {
      const p = getProvider("novelai");
      if (!p) return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (kind === "elevenlabs") {
      const p = getProvider("elevenlabs");
      if (!p) return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (!this.state.baseUrl) return null;
    return {
      id: "openai-compatible",
      name: "OpenAI Compatible",
      baseUrl: this.state.baseUrl,
      authType: "api_key",
      authHeader: "Authorization",
      authPrefix: "Bearer ",
      modelsEndpoint: "/models",
      modelsResponsePath: "data",
      isOpenAICompatible: true,
      requiresServer: false,
      capabilities: ["chat"],
    };
  }

  // top_p / top_k / min_p — 외부 플러그인 호출에 허용할지 여부를 체크박스로 게이팅.
  // 체크 해제된 키는 paramsOverride로 들어와도 무시되고 프로필 값도 전송되지 않음.
  private renderSamplingGateSection(el: HTMLElement): void {
    const L = makeT(this.lang);
    const samplingGateH = el.createEl("h4", { text: L("section_sampling_gate") });
    attachHelpIcon(samplingGateH, L("desc_sampling_gate"));

    // openai-compatible: 서비스 감지 버튼 + 현재 감지 결과 표시
    if (this.state.provider === "openai-compatible") {
      const row = el.createDiv();
      row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
      const detectBtn = row.createEl("button", { text: L("btn_detect_params") });
      const detectHint = row.createEl("span");
      detectHint.style.cssText = "font-size:12px;color:var(--text-muted);";
      const svc = detectCompatService(this.state.baseUrl, this.state.model);
      detectHint.textContent =
        svc !== "unknown"
          ? `${compatServiceLabel(svc)} ${L("hint_params_detected")}`
          : L("hint_params_unknown");
      detectBtn.onclick = () => {
        this.applyProviderParamDefaults();
        this.render();
      };
    }

    const renderRow = (
      key: "topP" | "topK" | "minP",
      allowKey: "allowTopP" | "allowTopK" | "allowMinP",
      label: string,
      desc: string,
      placeholder: string,
      parse: (v: string) => number
    ) => {
      const setting = new Setting(el).setName(label);
      attachHelpIcon(setting.nameEl, desc);
      let textInput: import("obsidian").TextComponent | undefined;
      setting.addToggle((t) =>
        t.setValue(this.state[allowKey]).onChange((v) => {
          this.state[allowKey] = v;
          textInput?.setDisabled(!v);
          textInput?.inputEl &&
            (textInput.inputEl.style.opacity = v ? "1" : "0.5");
        })
      );
      setting.addText((t) => {
        textInput = t;
        t.setPlaceholder(placeholder)
          .setValue(String(this.state[key] ?? ""))
          .onChange((v) => {
            const n = parse(v);
            this.state[key] = isNaN(n) ? undefined : n;
          });
        t.setDisabled(!this.state[allowKey]);
        t.inputEl.style.opacity = this.state[allowKey] ? "1" : "0.5";
      });
    };

    renderRow("topK", "allowTopK", "top_k", L("desc_top_k"), L("placeholder_none"), (v) =>
      parseInt(v, 10)
    );
    renderRow("topP", "allowTopP", "top_p", L("desc_top_p"), L("placeholder_none"), (v) =>
      parseFloat(v)
    );
    renderRow("minP", "allowMinP", "min_p", L("desc_min_p"), L("placeholder_none"), (v) =>
      parseFloat(v)
    );
  }

  private renderChatSection(el: HTMLElement): void {
    const L = makeT(this.lang);
    el.createEl("h3", { text: L("section_chat") });

    const defaultSetting = this.tip(
      new Setting(el)
        .setName(L("setting_default_profile"))
        .addToggle((t) =>
          t.setValue(this.state.isDefault).onChange((v) => {
            this.state.isDefault = v;
            applyDefaultBorder(defaultSetting.settingEl, v);
          })
        ),
      L("desc_default_profile_chat")
    );
    applyDefaultBorder(defaultSetting.settingEl, this.state.isDefault);

    this.tip(
      new Setting(el).setName("max input tokens").addText((t) =>
        t.setPlaceholder(L("placeholder_none")).setValue(String(this.state.maxContextTokens ?? "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.maxContextTokens = isNaN(n) ? undefined : n;
        })
      ),
      "입력 토큰 상한. 하위 플러그인은 이 설정값 이상의 수치에 접근할 수 없습니다."
    );
    new Setting(el).setName("max output tokens").addText((t) =>
      t.setPlaceholder("32000").setValue(String(this.state.maxTokens ?? "")).onChange((v) => {
        const n = parseInt(v, 10);
        this.state.maxTokens = isNaN(n) ? undefined : n;
      })
    );
    new Setting(el).setName("temperature").addText((t) =>
      t.setPlaceholder("0.7").setValue(String(this.state.temperature ?? "")).onChange((v) => {
        const n = parseFloat(v);
        this.state.temperature = isNaN(n) ? undefined : n;
      })
    );
    this.renderSamplingGateSection(el);
    if (this.state.provider === "anthropic") {
      new Setting(el).setName("thinking budget (Anthropic)").addText((t) =>
        t
          .setPlaceholder(L("placeholder_thinking_disabled"))
          .setValue(String(this.state.thinkingBudget ?? ""))
          .onChange((v) => {
            const n = parseInt(v, 10);
            this.state.thinkingBudget = isNaN(n) ? undefined : n;
          })
      );
    }
    // 추론 제어: 감지된 서비스의 유효 레벨만 노출 (DeepSeek: low~xhigh, OpenAI: minimal~high 등)
    const reasoning = getReasoningSupport(this.state.provider, this.state.baseUrl, this.state.model);
    if (reasoning.efforts.length) {
      const svcName =
        this.state.provider === "openai-compatible"
          ? compatServiceLabel(detectCompatService(this.state.baseUrl, this.state.model))
          : "OpenAI";
      this.tip(
        new Setting(el)
          .setName(`reasoning effort (${svcName})`)
          .addDropdown((d) => {
            d.addOption("", L("placeholder_none"));
            for (const e of reasoning.efforts) d.addOption(e, e);
            // 저장된 값이 현재 서비스에서 무효하면 표시만 비움 (전송 시에도 자동 보정됨)
            const cur = this.state.reasoningEffort ?? "";
            d.setValue(reasoning.efforts.includes(cur as (typeof reasoning.efforts)[number]) ? cur : "")
              .onChange((v) => (this.state.reasoningEffort = (v || undefined) as typeof this.state.reasoningEffort));
          }),
        L("desc_reasoning_effort")
      );
    }

    const thinkingUnsupported =
      !reasoning.canDisable &&
      (this.state.provider === "openai" || this.state.provider === "openai-compatible");
    const thinkingSetting = this.tip(
      new Setting(el)
        .setName(L("setting_thinking_disabled"))
        .addToggle((t) =>
          t.setValue(this.state.thinkingDisabled).onChange((v) => (this.state.thinkingDisabled = v))
        ),
      thinkingUnsupported ? L("desc_thinking_disable_unsupported") : L("desc_thinking_disabled")
    );


    this.tip(
      new Setting(el).setName(L("setting_streaming")).addToggle((t) =>
        t.setValue(this.state.streamingEnabled).onChange((v) => (this.state.streamingEnabled = v))
      ),
      L("desc_streaming")
    );
  }

  private renderTextSection(el: HTMLElement): void {
    const L = makeT(this.lang);
    el.createEl("h3", { text: L("section_text") });

    const defaultSetting = this.tip(
      new Setting(el)
        .setName(L("setting_default_profile"))
        .addToggle((t) =>
          t.setValue(this.state.isDefault).onChange((v) => {
            this.state.isDefault = v;
            applyDefaultBorder(defaultSetting.settingEl, v);
          })
        ),
      L("desc_default_profile_text")
    );
    applyDefaultBorder(defaultSetting.settingEl, this.state.isDefault);

    this.tip(
      new Setting(el).setName("max input tokens").addText((t) =>
        t.setPlaceholder(L("placeholder_none")).setValue(String(this.state.maxContextTokens ?? "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.maxContextTokens = isNaN(n) ? undefined : n;
        })
      ),
      "입력 토큰 상한. 하위 플러그인은 이 설정값 이상의 수치에 접근할 수 없습니다."
    );
    this.tip(
      new Setting(el).setName("max output tokens").addText((t) =>
        t.setPlaceholder(L("placeholder_none")).setValue(String(this.state.maxTokens ?? "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.maxTokens = isNaN(n) ? undefined : n;
        })
      ),
      "출력 토큰 상한. 비워두면 제한 없음."
    );
    new Setting(el).setName("temperature").addText((t) =>
      t.setPlaceholder("1.0").setValue(String(this.state.temperature ?? "")).onChange((v) => {
        const n = parseFloat(v);
        this.state.temperature = isNaN(n) ? undefined : n;
      })
    );
    this.renderSamplingGateSection(el);
    new Setting(el).setName(L("setting_stop_sequences")).addText((t) =>
      t
        .setPlaceholder("\\n\\n, ###")
        .setValue(this.state.stopSequences ?? "")
        .onChange((v) => (this.state.stopSequences = v || undefined))
    );
  }

  /** NAI 이미지에서 파싱한 파라미터를 editor state에 반영. undefined 필드는 기존값 유지. */
  private applyNaiImport(p: NaiImportedParams): void {
    const s = this.state;
    if (p.prompt !== undefined) s.imagePrompt = p.prompt || undefined;
    if (p.negativePrompt !== undefined) s.negativePrompt = p.negativePrompt;
    if (p.width !== undefined) s.width = p.width;
    if (p.height !== undefined) s.height = p.height;
    if (p.width !== undefined || p.height !== undefined) {
      s.sizePreset = inferPreset(s.width, s.height);
    }
    if (p.scale !== undefined) s.scale = p.scale;
    if (p.sampler !== undefined) s.sampler = p.sampler;
    if (p.steps !== undefined) s.steps = p.steps;
    if (p.nSamples !== undefined) s.nSamples = p.nSamples;
    if (p.seed !== undefined) s.seed = p.seed;
    if (p.noiseSchedule !== undefined) s.noiseSchedule = p.noiseSchedule;
    if (p.cfgRescale !== undefined) s.cfgRescale = p.cfgRescale;
    if (p.uncondScale !== undefined) s.uncondScale = p.uncondScale;
    if (p.skipCfgAboveSigma !== undefined) {
      s.skipCfgAboveSigma = p.skipCfgAboveSigma ?? undefined;
    }
    if (p.skipCfgBelowSigma !== undefined) s.skipCfgBelowSigma = p.skipCfgBelowSigma;
    if (p.dynamicThresholding !== undefined) s.dynamicThresholding = p.dynamicThresholding;
    if (p.dynamicThresholdingPercentile !== undefined) {
      s.dynamicThresholdingPercentile = p.dynamicThresholdingPercentile;
    }
    if (p.dynamicThresholdingMimicScale !== undefined) {
      s.dynamicThresholdingMimicScale = p.dynamicThresholdingMimicScale;
    }
    if (p.useOrder !== undefined) s.useOrder = p.useOrder;
    if (p.controlnetStrength !== undefined) s.controlnetStrength = p.controlnetStrength;
    if (p.preferBrownian !== undefined) s.preferBrownian = p.preferBrownian;
    if (p.cfgSchedEligibility !== undefined) s.cfgSchedEligibility = p.cfgSchedEligibility;
    if (p.deliberateEulerAncestralBug !== undefined) {
      s.deliberateEulerAncestralBug = p.deliberateEulerAncestralBug;
    }
    if (p.explikeFineDetail !== undefined) s.explikeFineDetail = p.explikeFineDetail;
    if (p.minimizeSigmaInf !== undefined) s.minimizeSigmaInf = p.minimizeSigmaInf;
    if (p.uncondPerVibe !== undefined) s.uncondPerVibe = p.uncondPerVibe;
    if (p.wonkyVibeCorrelation !== undefined) s.wonkyVibeCorrelation = p.wonkyVibeCorrelation;
  }

  private renderImageSection(el: HTMLElement): void {
    const L = makeT(this.lang);

    el.createEl("h3", { text: L("section_image") });

    const defaultSetting = this.tip(
      new Setting(el)
        .setName(L("setting_default_profile"))
        .addToggle((t) =>
          t.setValue(this.state.isDefault).onChange((v) => {
            this.state.isDefault = v;
            applyDefaultBorder(defaultSetting.settingEl, v);
          })
        ),
      L("desc_default_profile_image")
    );
    applyDefaultBorder(defaultSetting.settingEl, this.state.isDefault);

    // ── 0. NovelAI 이미지에서 파라미터 가져오기 ──────────────────────────────
    const importInput = el.createEl("input", { type: "file" });
    importInput.accept = "image/png,.png";
    importInput.style.display = "none";
    importInput.onchange = async () => {
      const file = importInput.files?.[0];
      importInput.value = ""; // 동일 파일 재선택 허용
      if (!file) return;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const imported = await parseNovelAiImage(bytes);
        if (!imported) {
          new Notice(L("notice_nai_parse_failed"));
          return;
        }
        this.applyNaiImport(imported);
        new Notice(L("notice_nai_imported"));
        this.render();
      } catch (e) {
        new Notice(L("notice_nai_parse_failed"));
        console.error("[ggai] NAI import failed", e);
      }
    };
    this.tip(
      new Setting(el).setName(L("btn_import_nai")).addButton((b) =>
        b.setButtonText(L("btn_import_nai")).onClick(() => importInput.click())
      ),
      L("desc_import_nai")
    );

    // ── 1. Main Prompt ───────────────────────────────────────────────────────
    el.createEl("h4", { text: L("section_main_prompt") });
    this.tip(
      new Setting(el).setName(L("section_main_prompt")).addTextArea((t) => {
        t.inputEl.rows = 3;
        t.inputEl.style.width = "100%";
        t.setValue(this.state.imagePrompt ?? "").onChange(
          (v) => (this.state.imagePrompt = v || undefined)
        );
      }),
      L("desc_main_prompt")
    );

    // ── 2. Negative Prompt (UC) ──────────────────────────────────────────────
    el.createEl("h4", { text: L("section_negative_prompt") });
    this.tip(
      new Setting(el).setName("negative prompt (uc)").addTextArea((t) => {
        t.inputEl.rows = 3;
        t.inputEl.style.width = "100%";
        t.setValue(this.state.negativePrompt ?? "").onChange((v) => (this.state.negativePrompt = v));
      }),
      L("tooltip_negative_prompt")
    );
    this.tip(
      new Setting(el).setName("use_order").addToggle((t) =>
        t.setValue(this.state.useOrder ?? true).onChange((v) => (this.state.useOrder = v))
      ),
      L("tooltip_use_order")
    );

    // ── 2. Size ──────────────────────────────────────────────────────────────
    el.createEl("h4", { text: L("section_size") });
    const currentPreset = this.state.sizePreset ?? inferPreset(this.state.width, this.state.height);
    this.tip(
      new Setting(el).setName(L("setting_size_preset")).addDropdown((d) => {
        for (const p of NAI_SIZE_PRESETS) d.addOption(p.key, p.label);
        d.addOption("custom", L("option_custom"));
        d.setValue(currentPreset).onChange((v) => {
          this.state.sizePreset = v as SizePresetKey;
          if (v !== "custom") {
            const p = NAI_SIZE_PRESETS.find((x) => x.key === v)!;
            this.state.width = p.w;
            this.state.height = p.h;
          }
          this.render();
        });
      }),
      L("tooltip_size_preset")
    );
    if (currentPreset === "custom") {
      new Setting(el).setName("width (px)").addText((t) =>
        t.setPlaceholder("832").setValue(String(this.state.width ?? "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.width = isNaN(n) ? undefined : n;
        })
      );
      new Setting(el).setName("height (px)").addText((t) =>
        t.setPlaceholder("1216").setValue(String(this.state.height ?? "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.height = isNaN(n) ? undefined : n;
        })
      );
    }

    // ── 3. Sampling (official NAI order) ─────────────────────────────────────
    el.createEl("h4", { text: L("section_sampling") });
    this.tip(
      new Setting(el).setName("steps").addText((t) =>
        t.setPlaceholder("28").setValue(String(this.state.steps ?? "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.steps = isNaN(n) ? undefined : n;
        })
      ),
      L("tooltip_steps")
    );
    this.tip(
      new Setting(el).setName("scale (Prompt Guidance)").addText((t) =>
        t.setPlaceholder("5.0").setValue(String(this.state.scale ?? "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.scale = isNaN(n) ? undefined : n;
        })
      ),
      L("tooltip_scale")
    );
    this.tip(
      new Setting(el).setName("seed").addText((t) =>
        t.setPlaceholder(L("placeholder_seed")).setValue(String(this.state.seed ?? "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.seed = isNaN(n) ? undefined : n;
        })
      ),
      L("tooltip_seed")
    );
    this.tip(
      new Setting(el).setName("sampler").addDropdown((d) => {
        for (const s of NAI_SAMPLERS) d.addOption(s, s);
        d.setValue(this.state.sampler ?? "k_euler_ancestral").onChange((v) => (this.state.sampler = v));
      }),
      L("tooltip_sampler")
    );
    this.tip(
      new Setting(el).setName("cfg_rescale (Prompt Guidance Rescale)").addText((t) =>
        t.setPlaceholder("0.0").setValue(String(this.state.cfgRescale ?? "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.cfgRescale = isNaN(n) ? undefined : n;
        })
      ),
      L("tooltip_cfg_rescale")
    );
    this.tip(
      new Setting(el).setName("noise_schedule").addDropdown((d) => {
        for (const s of NAI_NOISE_SCHEDULES) d.addOption(s, s);
        d.setValue(this.state.noiseSchedule ?? "karras").onChange((v) => (this.state.noiseSchedule = v));
      }),
      L("tooltip_noise_schedule")
    );
    this.tip(
      new Setting(el).setName("n_samples").addText((t) =>
        t.setPlaceholder("1").setValue(String(this.state.nSamples ?? "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.nSamples = isNaN(n) ? undefined : n;
        })
      ),
      L("tooltip_n_samples")
    );

    // ── 4. CFG (나머지 CFG 파라미터) ─────────────────────────────────────────
    el.createEl("h4", { text: L("section_cfg") });
    this.tip(
      new Setting(el)
        .setName("Variety+ (skip_cfg_above_sigma)")
        .addToggle((t) =>
          t
            .setValue(typeof this.state.skipCfgAboveSigma === "number")
            .onChange((v) => {
              this.state.skipCfgAboveSigma = v ? 19.0 : undefined;
            })
        ),
      L("tooltip_skip_cfg_above")
    );
    this.tip(
      new Setting(el).setName("uncond_scale").addText((t) =>
        t.setPlaceholder("1.0").setValue(String(this.state.uncondScale ?? "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.uncondScale = isNaN(n) ? undefined : n;
        })
      ),
      L("tooltip_uncond_scale")
    );
    this.tip(
      new Setting(el).setName("skip_cfg_below_sigma").addText((t) =>
        t
          .setPlaceholder(L("placeholder_cfg_disabled"))
          .setValue(String(this.state.skipCfgBelowSigma ?? ""))
          .onChange((v) => {
            const n = parseFloat(v);
            this.state.skipCfgBelowSigma = isNaN(n) ? undefined : n;
          })
      ),
      L("tooltip_skip_cfg_below")
    );

    // ── 5. Dynamic Thresholding ───────────────────────────────────────────────
    el.createEl("h4", { text: L("section_dynamic_thresholding") });
    this.tip(
      new Setting(el).setName("dynamic_thresholding").addToggle((t) =>
        t.setValue(!!this.state.dynamicThresholding).onChange((v) => (this.state.dynamicThresholding = v))
      ),
      L("tooltip_dynamic_thresholding")
    );
    this.tip(
      new Setting(el).setName("dynamic_thresholding_mimic_scale").addText((t) =>
        t
          .setPlaceholder("10.0")
          .setValue(String(this.state.dynamicThresholdingMimicScale ?? ""))
          .onChange((v) => {
            const n = parseFloat(v);
            this.state.dynamicThresholdingMimicScale = isNaN(n) ? undefined : n;
          })
      ),
      L("tooltip_dt_mimic_scale")
    );
    this.tip(
      new Setting(el).setName("dynamic_thresholding_percentile").addText((t) =>
        t
          .setPlaceholder("0.999")
          .setValue(String(this.state.dynamicThresholdingPercentile ?? ""))
          .onChange((v) => {
            const n = parseFloat(v);
            this.state.dynamicThresholdingPercentile = isNaN(n) ? undefined : n;
          })
      ),
      L("tooltip_dt_percentile")
    );

    // ── 6. Vibe Transfer ─────────────────────────────────────────────────────
    el.createEl("h4", { text: L("section_vibe_transfer") });
    this.tip(
      new Setting(el).setName("uncond_per_vibe").addToggle((t) =>
        t.setValue(this.state.uncondPerVibe ?? true).onChange((v) => (this.state.uncondPerVibe = v))
      ),
      L("tooltip_uncond_per_vibe")
    );
    this.tip(
      new Setting(el).setName("wonky_vibe_correlation").addToggle((t) =>
        t.setValue(this.state.wonkyVibeCorrelation ?? true).onChange((v) => (this.state.wonkyVibeCorrelation = v))
      ),
      L("tooltip_wonky_vibe")
    );

    // ── 7. Advanced ──────────────────────────────────────────────────────────
    el.createEl("h4", { text: L("section_advanced_image") });
    this.tip(
      new Setting(el).setName("controlnet_strength").addText((t) =>
        t.setPlaceholder("1.0").setValue(String(this.state.controlnetStrength ?? "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.controlnetStrength = isNaN(n) ? undefined : n;
        })
      ),
      L("tooltip_controlnet")
    );
    this.tip(
      new Setting(el).setName("prefer_brownian").addToggle((t) =>
        t.setValue(this.state.preferBrownian ?? true).onChange((v) => (this.state.preferBrownian = v))
      ),
      L("tooltip_prefer_brownian")
    );
    this.tip(
      new Setting(el).setName("cfg_sched_eligibility").addText((t) =>
        t
          .setPlaceholder("enable_for_post_summer_samplers")
          .setValue(this.state.cfgSchedEligibility ?? "")
          .onChange((v) => (this.state.cfgSchedEligibility = v || undefined))
      ),
      L("tooltip_cfg_sched")
    );
    this.tip(
      new Setting(el).setName("deliberate_euler_ancestral_bug").addToggle((t) =>
        t
          .setValue(!!this.state.deliberateEulerAncestralBug)
          .onChange((v) => (this.state.deliberateEulerAncestralBug = v))
      ),
      L("tooltip_euler_bug")
    );
    this.tip(
      new Setting(el).setName("explike_fine_detail").addToggle((t) =>
        t.setValue(!!this.state.explikeFineDetail).onChange((v) => (this.state.explikeFineDetail = v))
      ),
      L("tooltip_explike")
    );
    this.tip(
      new Setting(el).setName("minimize_sigma_inf").addToggle((t) =>
        t.setValue(!!this.state.minimizeSigmaInf).onChange((v) => (this.state.minimizeSigmaInf = v))
      ),
      L("tooltip_minimize_sigma")
    );
  }

  private renderVoiceSection(el: HTMLElement): void {
    const L = makeT(this.lang);
    el.createEl("h3", { text: L("section_voice") });

    new Setting(el).setName("voice_id").addText((t) =>
      t
        .setPlaceholder(L("placeholder_voice_id"))
        .setValue(this.state.voice ?? "")
        .onChange((v) => (this.state.voice = v || undefined))
    );
    const voiceRow = el.createDiv();
    voiceRow.style.display = "flex";
    voiceRow.style.gap = "8px";
    voiceRow.style.alignItems = "center";
    voiceRow.style.margin = "4px 0 12px 0";
    voiceRow.style.paddingLeft = "16px";
    const loadVoicesBtn = voiceRow.createEl("button", { text: L("btn_load_voices") });
    const voiceStatus = voiceRow.createEl("span");
    voiceStatus.style.fontSize = "12px";
    voiceStatus.style.color = "var(--text-muted)";

    const renderVoiceDropdown = () => {
      const existing = voiceRow.querySelector("select.ggai-voice-select");
      if (existing) existing.remove();
      if (!this.state.availableVoices?.length) return;
      const sel = voiceRow.createEl("select") as HTMLSelectElement;
      sel.className = "ggai-voice-select";
      sel.style.maxWidth = "260px";
      const ph = sel.createEl("option", { text: L("placeholder_select_list") });
      (ph as HTMLOptionElement).value = "";
      for (const v of this.state.availableVoices) {
        const label = v.category ? `${v.name} [${v.category}]` : v.name;
        const opt = sel.createEl("option", { text: `${label} (${v.id})` });
        (opt as HTMLOptionElement).value = v.id;
      }
      sel.value = this.state.voice ?? "";
      sel.onchange = () => {
        if (sel.value) {
          this.state.voice = sel.value;
          this.render();
        }
      };
    };
    renderVoiceDropdown();

    loadVoicesBtn.onclick = async () => {
      const apiKey =
        this.state.apiKey ||
        this.plugin.secretsVault.get(this.state.apiKeyRef || "elevenlabs-default") ||
        "";
      if (!apiKey) {
        new Notice(L("notice_enter_api_key"));
        return;
      }
      voiceStatus.textContent = L("loading");
      try {
        const voices = await fetchElevenLabsVoices(apiKey, this.state.baseUrl || undefined);
        this.state.availableVoices = voices;
        voiceStatus.textContent = L("n_voices").replace("{count}", String(voices.length));
        renderVoiceDropdown();
      } catch (e) {
        voiceStatus.textContent = L("failed");
        new Notice(L("notice_voice_load_failed").replace("{error}", (e as Error).message));
      }
    };

    this.tip(
      new Setting(el).setName("output format").addText((t) =>
        t
          .setPlaceholder("mp3_44100_128")
          .setValue(this.state.format ?? "")
          .onChange((v) => (this.state.format = v || undefined))
      ),
      L("desc_output_format")
    );

    new Setting(el).setName("stability (0~1)").addText((t) =>
      t.setPlaceholder("0.5").setValue(String(this.state.stability ?? "")).onChange((v) => {
        const n = parseFloat(v);
        this.state.stability = isNaN(n) ? undefined : n;
      })
    );
    new Setting(el).setName("similarity_boost (0~1)").addText((t) =>
      t.setPlaceholder("0.75").setValue(String(this.state.similarityBoost ?? "")).onChange((v) => {
        const n = parseFloat(v);
        this.state.similarityBoost = isNaN(n) ? undefined : n;
      })
    );
    new Setting(el).setName("style (0~1)").addText((t) =>
      t.setPlaceholder("0").setValue(String(this.state.style ?? "")).onChange((v) => {
        const n = parseFloat(v);
        this.state.style = isNaN(n) ? undefined : n;
      })
    );
    new Setting(el).setName("use_speaker_boost").addToggle((t) =>
      t.setValue(!!this.state.useSpeakerBoost).onChange((v) => (this.state.useSpeakerBoost = v))
    );
    this.tip(
      new Setting(el).setName("language_code").addText((t) =>
        t.setValue(this.state.language ?? "").onChange((v) => (this.state.language = v || undefined))
      ),
      L("desc_language_code")
    );
  }

  private async save(): Promise<void> {
    const L = makeT(this.lang);
    if (!this.state.model.trim()) {
      new Notice(L("notice_model_required"));
      return;
    }
    if (!this.state.name.trim()) {
      this.state.name = `${this.state.model.trim()} (${this.state.provider})`;
    }
    if (this.state.provider === "openai-compatible" && !this.state.baseUrl.trim()) {
      new Notice(L("notice_base_url_required"));
      return;
    }
    if (this.state.kind === "voice" && !this.state.voice) {
      new Notice(L("notice_voice_id_required"));
      return;
    }

    const apiKeyRef = this.state.apiKeyRef.trim() || this.defaultApiKeyRef();
    if (this.state.apiKey) {
      await this.plugin.secretsVault.set(apiKeyRef, this.state.apiKey);
    }

    const base = {
      id: this.state.id,
      name: this.state.name.trim(),
      provider: this.state.provider,
      baseUrl: this.state.baseUrl.trim() || undefined,
      apiKeyRef,
      model: this.state.model.trim(),
      createdAt: this.original?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    const legacyApiKey = this.state.apiKey
      ? { apiKey: this.state.apiKey }
      : this.original && (this.original as unknown as { apiKey?: string }).apiKey
      ? { apiKey: (this.original as unknown as { apiKey?: string }).apiKey }
      : {};

    // allowedParams: 체크된 키만 저장 + 게이트 통과 키만 params에 포함.
    const allowedParams = {
      topK: this.state.allowTopK,
      topP: this.state.allowTopP,
      minP: this.state.allowMinP,
    };

    let profile: GGAIModelProfile;
    if (this.state.kind === "chat") {
      const chat: ChatProfile = {
        ...base,
        kind: "chat",
        isDefault: this.state.isDefault,
        params: {
          ...(this.state.temperature !== undefined ? { temperature: this.state.temperature } : {}),
          ...(this.state.maxTokens !== undefined ? { maxTokens: this.state.maxTokens } : {}),
          ...(this.state.maxContextTokens !== undefined ? { maxContextTokens: this.state.maxContextTokens } : {}),
          ...(allowedParams.topP && this.state.topP !== undefined ? { topP: this.state.topP } : {}),
          ...(allowedParams.topK && this.state.topK !== undefined ? { topK: this.state.topK } : {}),
          ...(allowedParams.minP && this.state.minP !== undefined ? { minP: this.state.minP } : {}),
          ...(this.state.thinkingBudget !== undefined ? { thinkingBudget: this.state.thinkingBudget } : {}),
          ...(this.state.reasoningEffort ? { reasoningEffort: this.state.reasoningEffort } : {}),
          ...(this.state.thinkingDisabled ? { thinkingDisabled: true } : {}),
        },
        allowedParams,
        supports: { tools: true, vision: true, streaming: true, systemPrompt: true },
        streamingEnabled: this.state.streamingEnabled,
      };
      profile = { ...chat, ...legacyApiKey } as ChatProfile;
    } else if (this.state.kind === "text") {
      const text: TextProfile = {
        ...base,
        provider: "novelai",
        kind: "text",
        isDefault: this.state.isDefault,
        params: {
          ...(this.state.temperature !== undefined ? { temperature: this.state.temperature } : {}),
          ...(this.state.maxTokens !== undefined ? { maxTokens: this.state.maxTokens } : {}),
          ...(this.state.maxContextTokens !== undefined ? { maxContextTokens: this.state.maxContextTokens } : {}),
          ...(allowedParams.topP && this.state.topP !== undefined ? { topP: this.state.topP } : {}),
          ...(allowedParams.topK && this.state.topK !== undefined ? { topK: this.state.topK } : {}),
          ...(allowedParams.minP && this.state.minP !== undefined ? { minP: this.state.minP } : {}),
          ...(this.state.stopSequences
            ? {
                stopSequences: this.state.stopSequences
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : {}),
        },
        allowedParams,
      };
      profile = { ...text, ...legacyApiKey } as TextProfile;
    } else if (this.state.kind === "image") {
      const image: ImageProfile = {
        ...base,
        provider: "novelai",
        kind: "image",
        isDefault: this.state.isDefault,
        params: {
          ...(this.state.width !== undefined ? { width: this.state.width } : {}),
          ...(this.state.height !== undefined ? { height: this.state.height } : {}),
          ...(this.state.scale !== undefined ? { scale: this.state.scale } : {}),
          ...(this.state.sampler ? { sampler: this.state.sampler } : {}),
          ...(this.state.steps !== undefined ? { steps: this.state.steps } : {}),
          ...(this.state.nSamples !== undefined ? { nSamples: this.state.nSamples } : {}),
          ...(this.state.seed !== undefined ? { seed: this.state.seed } : {}),
          ...(this.state.noiseSchedule
            ? { noiseSchedule: this.state.noiseSchedule as ImageProfile["params"]["noiseSchedule"] }
            : {}),
          ...(this.state.cfgRescale !== undefined ? { cfgRescale: this.state.cfgRescale } : {}),
          ...(this.state.uncondScale !== undefined ? { uncondScale: this.state.uncondScale } : {}),
          ...(this.state.skipCfgAboveSigma !== undefined
            ? { skipCfgAboveSigma: this.state.skipCfgAboveSigma }
            : {}),
          ...(this.state.skipCfgBelowSigma !== undefined
            ? { skipCfgBelowSigma: this.state.skipCfgBelowSigma }
            : {}),
          ...(this.state.dynamicThresholding !== undefined
            ? { dynamicThresholding: this.state.dynamicThresholding }
            : {}),
          ...(this.state.dynamicThresholdingPercentile !== undefined
            ? { dynamicThresholdingPercentile: this.state.dynamicThresholdingPercentile }
            : {}),
          ...(this.state.dynamicThresholdingMimicScale !== undefined
            ? { dynamicThresholdingMimicScale: this.state.dynamicThresholdingMimicScale }
            : {}),
          ...(this.state.imagePrompt ? { prompt: this.state.imagePrompt } : {}),
          ...(this.state.negativePrompt !== undefined ? { negativePrompt: this.state.negativePrompt } : {}),
          ...(this.state.useOrder !== undefined ? { useOrder: this.state.useOrder } : {}),
          ...(this.state.controlnetStrength !== undefined
            ? { controlnetStrength: this.state.controlnetStrength }
            : {}),
          ...(this.state.preferBrownian !== undefined ? { preferBrownian: this.state.preferBrownian } : {}),
          ...(this.state.cfgSchedEligibility
            ? { cfgSchedEligibility: this.state.cfgSchedEligibility }
            : {}),
          ...(this.state.deliberateEulerAncestralBug !== undefined
            ? { deliberateEulerAncestralBug: this.state.deliberateEulerAncestralBug }
            : {}),
          ...(this.state.explikeFineDetail !== undefined
            ? { explikeFineDetail: this.state.explikeFineDetail }
            : {}),
          ...(this.state.minimizeSigmaInf !== undefined
            ? { minimizeSigmaInf: this.state.minimizeSigmaInf }
            : {}),
          ...(this.state.uncondPerVibe !== undefined ? { uncondPerVibe: this.state.uncondPerVibe } : {}),
          ...(this.state.wonkyVibeCorrelation !== undefined
            ? { wonkyVibeCorrelation: this.state.wonkyVibeCorrelation }
            : {}),
        },
      };
      profile = { ...image, ...legacyApiKey } as ImageProfile;
    } else {
      const voice: VoiceProfile = {
        ...base,
        provider: "elevenlabs",
        kind: "voice",
        subKind: "tts",
        params: {
          ...(this.state.voice ? { voice: this.state.voice } : {}),
          ...(this.state.format ? { format: this.state.format } : {}),
          ...(this.state.stability !== undefined ? { stability: this.state.stability } : {}),
          ...(this.state.similarityBoost !== undefined
            ? { similarityBoost: this.state.similarityBoost }
            : {}),
          ...(this.state.style !== undefined ? { style: this.state.style } : {}),
          ...(this.state.useSpeakerBoost !== undefined
            ? { useSpeakerBoost: this.state.useSpeakerBoost }
            : {}),
          ...(this.state.language ? { language: this.state.language } : {}),
        },
      };
      profile = { ...voice, ...legacyApiKey } as VoiceProfile;
    }

    if (this.isEdit) {
      await this.plugin.profileStore.update(profile.id, profile);
    } else {
      await this.plugin.profileStore.add(profile);
    }
    new Notice(this.isEdit ? L("notice_profile_saved") : L("notice_profile_added"));
    this.close();
  }
}

// ── helpers ─────────────────────────────────────

function applyDefaultBorder(el: HTMLElement, active: boolean): void {
  if (active) {
    el.style.border = "2px solid var(--interactive-accent)";
    el.style.borderRadius = "6px";
    el.style.padding = "6px 8px";
  } else {
    el.style.border = "";
    el.style.borderRadius = "";
    el.style.padding = "";
  }
}

function attachHelpIcon(el: HTMLElement, text: string): void {
  if (!text) return;
  const icon = el.createSpan({
    attr: { tabindex: "0", role: "button", "aria-label": text },
  });
  icon.style.cssText =
    "display:inline-flex;align-items:center;margin-left:6px;cursor:pointer;color:var(--text-muted);";
  setIcon(icon, "help-circle");
  const svg = icon.querySelector("svg");
  if (svg) {
    svg.style.width = "1em";
    svg.style.height = "1em";
    // svg 가 포인터 이벤트를 삼켜 클릭/hover 가 부모 span 에 안 닿는 것을 막는다.
    svg.style.pointerEvents = "none";
  }
  // hover 툴팁(데스크탑) — 스타일된 Obsidian 툴팁.
  setTooltip(icon, text, { placement: "top" });
  // 클릭/탭·키보드로도 설명을 띄운다 (모바일엔 hover 가 없어 필수).
  const show = () => new Notice(text, 8000);
  icon.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    show();
  });
  icon.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    show();
  });
}

// provider 드롭다운에 표시할 값 계산.
// provider="openai-compatible"이라도 baseUrl이 DeepSeek/OpenRouter/z.ai/NanoGPT로 감지되면
// 해당 프리셋을 선택된 상태로 보여준다 (그 외 Ollama/vLLM/LM Studio/Kimi/unknown은 일반 "OpenAI 호환"으로 표시).
function providerDropdownValue(state: EditorState): string {
  if (state.provider !== "openai-compatible") return state.provider;
  const svc = detectCompatService(state.baseUrl, state.model);
  if (svc in COMPAT_PRESET_BASE_URL) return svc;
  return "openai-compatible";
}

function providerLabel(kind: ProviderKind, L: ReturnType<typeof makeT>): string {
  switch (kind) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google Gemini";
    case "openai-compatible":
      return L("provider_label_openai_compat");
    case "novelai":
      return "NovelAI";
    case "elevenlabs":
      return "ElevenLabs";
  }
}

function providerLockDesc(kind: ProfileKind, L: ReturnType<typeof makeT>): string {
  if (kind === "text") return L("provider_lock_text");
  if (kind === "image") return L("provider_lock_image");
  if (kind === "voice") return L("provider_lock_voice");
  return "";
}

function baseUrlDesc(state: EditorState, L: ReturnType<typeof makeT>): string {
  if (state.kind === "image") return L("base_url_desc_image");
  if (state.kind === "text") return L("base_url_desc_text");
  if (state.kind === "voice") return L("base_url_desc_voice");
  if (state.provider === "openai-compatible") return L("base_url_desc_openai_compat");
  return L("base_url_desc_default");
}

function inferPreset(w?: number, h?: number): SizePresetKey {
  if (w === 832 && h === 1216) return "portrait";
  if (w === 1216 && h === 832) return "landscape";
  if (w === 1024 && h === 1024) return "square";
  if (w || h) return "custom";
  return "portrait";
}

function initState(
  existing: GGAIModelProfile | null,
  defaultKind: ProfileKind,
  plugin: GGAICorePlugin
): EditorState {
  const rand = Math.random().toString(36).slice(2, 11);
  if (!existing) {
    // 새 프로필: 종류에 맞는 기본 제공자의 지원 파라미터를 자동 체크.
    // (text/image=novelai, voice=elevenlabs, chat=anthropic — syncProviderToKind와 동일 규칙)
    const provider: ProviderKind =
      defaultKind === "text" || defaultKind === "image"
        ? "novelai"
        : defaultKind === "voice"
        ? "elevenlabs"
        : "anthropic";
    const initDefaults = getProviderParamDefaults(provider, "", "");
    return {
      id: `profile_${rand}`,
      name: "",
      kind: defaultKind,
      provider,
      baseUrl: "",
      apiKeyRef: "",
      apiKey: "",
      model: "",
      isDefault: false,
      streamingEnabled: false,
      thinkingDisabled: false,
      maxTokens: 4000,
      allowTopK: initDefaults.topK,
      allowTopP: initDefaults.topP,
      allowMinP: initDefaults.minP,
      availableModels: [],
    };
  }
  const base: EditorState = {
    id: existing.id,
    name: existing.name,
    kind: existing.kind,
    provider: existing.provider,
    baseUrl: existing.baseUrl ?? "",
    apiKeyRef: existing.apiKeyRef,
    apiKey:
      plugin.secretsVault.get(existing.apiKeyRef) ??
      (existing as unknown as { apiKey?: string }).apiKey ??
      "",
    model: existing.model,
    isDefault: !!(existing as { isDefault?: boolean }).isDefault,
    streamingEnabled: false,
    thinkingDisabled: false,
    // legacy 프로필(allowedParams 없음): 기존에 값을 설정해 둔 키는 체크된 상태로 시작.
    // allowedParams가 있으면 그대로 사용.
    allowTopK: false,
    allowTopP: false,
    allowMinP: false,
    availableModels: [],
  };
  if (existing.kind === "chat") {
    base.temperature = existing.params.temperature;
    base.maxTokens = existing.params.maxTokens;
    base.maxContextTokens = existing.params.maxContextTokens;
    base.topP = existing.params.topP;
    base.topK = existing.params.topK;
    base.minP = existing.params.minP;
    base.thinkingBudget = existing.params.thinkingBudget;
    base.thinkingDisabled = !!existing.params.thinkingDisabled;
    base.reasoningEffort = existing.params.reasoningEffort;
    base.streamingEnabled = !!existing.streamingEnabled;
    const ap = existing.allowedParams;
    base.allowTopK = ap ? !!ap.topK : existing.params.topK !== undefined;
    base.allowTopP = ap ? !!ap.topP : existing.params.topP !== undefined;
    base.allowMinP = ap ? !!ap.minP : existing.params.minP !== undefined;
  } else if (existing.kind === "text") {
    base.temperature = existing.params.temperature;
    base.maxTokens = existing.params.maxTokens;
    base.maxContextTokens = existing.params.maxContextTokens;
    base.topP = existing.params.topP;
    base.topK = existing.params.topK;
    base.minP = existing.params.minP;
    base.stopSequences = existing.params.stopSequences?.join(", ");
    const ap = existing.allowedParams;
    base.allowTopK = ap ? !!ap.topK : existing.params.topK !== undefined;
    base.allowTopP = ap ? !!ap.topP : existing.params.topP !== undefined;
    base.allowMinP = ap ? !!ap.minP : existing.params.minP !== undefined;
  } else if (existing.kind === "image") {
    const p = existing.params;
    base.width = p.width;
    base.height = p.height;
    base.sizePreset = inferPreset(p.width, p.height);
    base.scale = p.scale;
    base.sampler = p.sampler;
    base.steps = p.steps;
    base.nSamples = p.nSamples;
    base.seed = p.seed;
    base.noiseSchedule = p.noiseSchedule;
    base.cfgRescale = p.cfgRescale;
    base.uncondScale = p.uncondScale;
    base.skipCfgAboveSigma = p.skipCfgAboveSigma ?? undefined;
    base.skipCfgBelowSigma = p.skipCfgBelowSigma;
    base.dynamicThresholding = p.dynamicThresholding;
    base.dynamicThresholdingPercentile = p.dynamicThresholdingPercentile;
    base.dynamicThresholdingMimicScale = p.dynamicThresholdingMimicScale;
    base.imagePrompt = p.prompt;
    base.negativePrompt = p.negativePrompt;
    base.useOrder = p.useOrder;
    base.controlnetStrength = p.controlnetStrength;
    base.preferBrownian = p.preferBrownian;
    base.cfgSchedEligibility = p.cfgSchedEligibility;
    base.deliberateEulerAncestralBug = p.deliberateEulerAncestralBug;
    base.explikeFineDetail = p.explikeFineDetail;
    base.minimizeSigmaInf = p.minimizeSigmaInf;
    base.uncondPerVibe = p.uncondPerVibe;
    base.wonkyVibeCorrelation = p.wonkyVibeCorrelation;
  } else if (existing.kind === "voice") {
    base.voice = existing.params.voice;
    base.format = existing.params.format;
    base.stability = existing.params.stability;
    base.similarityBoost = existing.params.similarityBoost;
    base.style = existing.params.style;
    base.useSpeakerBoost = existing.params.useSpeakerBoost;
    base.language = existing.params.language;
  }
  return base;
}
