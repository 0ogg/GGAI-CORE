export type Lang = "ko" | "en";

const STRINGS = {
  ko: {
    // Tabs
    tab_profiles: "프로필",
    tab_secrets: "Secrets",
    tab_advanced: "고급",
    tab_about: "정보",

    // Profile tab
    heading_profiles: "모델 프로필",
    no_profiles: "등록된 {kind} 프로필이 없습니다.",
    btn_edit: "편집",
    btn_clone: "복제",
    clone_suffix: " (복제)",
    btn_test: "테스트",
    testing_connection: "연결 테스트 중...",
    test_ok: "✅ 연결 OK",
    test_failed: "❌ 실패: {error}",
    test_error: "❌ 오류: {error}",
    btn_delete: "삭제",
    confirm_delete_profile: "'{name}' 프로필을 삭제할까요?",
    unknown: "(알 수 없음)",

    // Secrets tab
    heading_secrets: "API 키 (Secrets Vault)",
    warn_secrets_plaintext:
      "⚠ API 키는 data.json에 평문으로 저장됩니다. 이 Vault 폴더를 공유/동기화하는 경우 키가 노출될 수 있습니다.",
    no_secrets: "저장된 키가 없습니다. 프로필 추가 시 자동 생성됩니다.",
    in_use: "사용 중: {names}",
    unused: "미사용",
    btn_reenter: "재입력",
    prompt_new_key: "새 API 키 입력 ({ref})",
    confirm_delete_key: "{ref}를 삭제할까요?",
    secrets_queue_note:
      "토글 ON: 같은 키를 공유하는 모든 프로필의 요청을 한 번에 하나씩 순차 실행합니다 (동시 요청 429 방지). NovelAI 키는 기본 ON.",
    secrets_queue_name: "동시 요청 순차 실행",

    // Advanced tab
    heading_advanced: "고급 설정",
    setting_language_name: "인터페이스 언어",
    setting_language_desc: "UI 언어를 선택합니다",
    lang_ko: "한국어",
    lang_en: "English",
    setting_timeout_name: "요청 타임아웃 (ms)",
    setting_timeout_desc: "단일 요청이 이 시간을 넘으면 자동 취소",
    setting_max_turns_name: "에이전트 기본 maxTurns",
    setting_max_turns_desc: "agent() 요청에 maxTurns가 없을 때 사용",
    setting_log_name: "요청 로그 (콘솔)",
    setting_log_desc: "켜면 generation/agent 호출 시 콘솔에 프로필 정보 출력",
    setting_cancel_all_name: "모든 진행 중 요청 취소",
    btn_cancel: "취소",
    notice_cancelled_all: "진행 중인 모든 요청을 취소했습니다",

    // About tab
    about_version_desc: "v{version} · 옵시디언 AI 응답 허브.",
    about_features:
      "제공 기능: 모델 프로필 관리 / chat·text·image·tts·stt 생성 / 멀티턴 에이전트 런타임 / 이벤트 스트림.",

    // Profile modal
    modal_title_edit: "프로필 편집",
    modal_title_add: "프로필 추가",
    field_display_name: "표시명",
    placeholder_display_name: "UI 표시명",
    field_kind: "종류",
    kind_chat: "Chat",
    kind_text: "Text Completion (NovelAI)",
    kind_image: "Image (NovelAI)",
    kind_voice: "Voice TTS (ElevenLabs)",
    field_provider: "프로바이더",
    provider_openai_compatible: "OpenAI-호환",
    provider_label_openai_compat: "OpenAI-호환",
    provider_lock_text: "Text Completion은 NovelAI로 고정됩니다",
    provider_lock_image: "Image 생성은 NovelAI로 고정됩니다",
    provider_lock_voice: "Voice TTS는 ElevenLabs로 고정됩니다",
    field_base_url: "Base URL",
    base_url_desc_image: "선택. 비워두면 https://image.novelai.net",
    base_url_desc_text: "선택. 비워두면 https://text.novelai.net/oa/v1",
    base_url_desc_voice: "선택. 비워두면 https://api.elevenlabs.io/v1",
    base_url_desc_openai_compat: "필수. 예: http://localhost:11434/v1 (Ollama)",
    base_url_desc_vertex:
      "선택. 서비스 계정 JSON 인증 시에는 리전만 입력하세요(예: us-central1, asia-northeast3). 비우면 global. " +
      "Express 모드(API 키)는 비워도 됩니다. " +
      "OAuth 액세스 토큰을 쓰려면 .../projects/{프로젝트}/locations/{리전}/publishers/google/models 전체 경로를 입력합니다.",
    base_url_desc_default: "선택. 비워두면 기본값 사용",
    field_api_key: "API 키",
    desc_api_key:
      "저장 시 아래 'API 키 이름'으로 Secrets Vault에 보관됩니다. 이미 저장된 키가 있으면 비워도 됩니다.",
    api_key_vertex_placeholder: '{\n  "type": "service_account",\n  ...\n}',
    desc_api_key_vertex:
      "권장: 서비스 계정 키 파일(JSON) 전체를 붙여넣으면 JWT를 서명해 OAuth 토큰으로 자동 인증합니다(project_id는 JSON에서 읽음, 리전은 위 baseUrl). " +
      "또는 Express API 키나 임시 OAuth 액세스 토큰을 넣어도 됩니다. 저장 시 'API 키 이름'으로 Secrets Vault에 보관됩니다.",
    field_api_key_ref: "API 키 이름 (apiKeyRef)",
    desc_api_key_ref_prefix:
      "키를 구분하는 이름입니다. 같은 이름을 여러 프로필에 지정하면 API 키를 공유합니다. 비워두면 '{default}' 사용.",
    stored_refs_hint: "저장된 키 이름: {refs}",
    no_stored_refs: "아직 저장된 키 없음",
    field_model: "모델명",
    desc_model: "직접 입력하거나 '모델 불러오기'로 목록에서 선택",
    btn_load_models: "모델 불러오기",
    placeholder_select_list: "-- 목록에서 선택 --",
    n_models: "{count}개 모델",
    n_models_built_in: "{count}개 (내장)",
    failed: "실패",
    notice_no_model_list: "이 프로바이더는 모델 목록 불러오기를 지원하지 않습니다",
    notice_enter_api_key: "API 키를 먼저 입력하세요",
    loading: "불러오는 중...",
    notice_model_load_failed: "모델 로드 실패: {error}",

    // Model placeholders
    model_ph_image: "nai-diffusion-4-5-full",
    model_ph_text: "NovelAI text 모델",
    model_ph_voice: "eleven_multilingual_v2",
    model_ph_chat: "claude-opus-4-8 / gpt-4o / gemini-pro-latest",

    // Chat section
    section_chat: "Chat 파라미터",
    setting_default_profile: "기본 생성 프로필",
    desc_default_profile_chat:
      "활성화하면 profileId가 지정되지 않은 chat 요청에 이 프로필이 사용됩니다",
    desc_default_profile_text:
      "활성화하면 profileId가 지정되지 않은 text 요청에 이 프로필이 사용됩니다",
    desc_default_profile_image:
      "활성화하면 profileId가 지정되지 않은 image 요청에 이 프로필이 사용됩니다",
    desc_top_p: "모델이 지원하는지 확실하지 않으면 비워두세요",
    desc_top_k: "모델이 지원하는지 확실하지 않으면 비워두세요",
    desc_min_p: "확률 임계 컷오프 (vLLM/LM Studio 계열에서 지원)",
    section_sampling_gate: "샘플링 파라미터 허용 (외부 플러그인 노출)",
    desc_sampling_gate:
      "체크된 키만 외부 플러그인의 paramsOverride로 받아 적용됩니다. 체크 해제된 키는 요청에 들어와도 무시되고, 프로필에 입력한 값도 모델로 전송되지 않습니다. temperature와 max tokens는 항상 허용됩니다.",
    btn_detect_params: "파라미터 자동 감지",
    hint_params_detected: "감지됨 — 파라미터가 자동 설정되었습니다",
    hint_params_unknown: "서비스 미확인 — BaseURL을 입력 후 다시 감지하세요",
    placeholder_thinking_disabled: "0 = 비활성",
    placeholder_none: "(없음)",
    setting_streaming: "스트리밍 사용",
    desc_streaming: "켜면 chat() 호출도 내부에서 토큰 단위 스트림 방식으로 처리",
    setting_thinking_disabled: "사고 비활성화",
    desc_thinking_disabled:
      "사고 모델의 thinking/reasoning을 끕니다. 서비스별로 올바른 파라미터로 변환되어 전송됩니다 (Anthropic: thinking=disabled · Google: thinkingBudget=0 · OpenAI·호환: 감지된 서비스별 방식)",
    desc_reasoning_effort:
      "감지된 서비스가 지원하는 추론 레벨만 표시됩니다. BaseURL/모델 변경 후에는 '파라미터 자동 감지'를 다시 실행하세요.",
    desc_thinking_disable_unsupported:
      "⚠ 이 서비스는 추론 끄기를 지원하지 않습니다. 켜면 지원되는 최저 레벨로 대체하거나 파라미터를 생략합니다.",

    // Text section
    section_text: "Text 파라미터 (NovelAI)",
    setting_stop_sequences: "stop sequences (쉼표 구분)",

    // Image section
    section_image: "Image 파라미터 (NovelAI v4.5)",
    setting_size_preset: "사이즈 프리셋",
    option_custom: "커스텀",
    section_size: "사이즈",
    section_sampling: "샘플링",
    desc_seed: "비워두면 매 요청마다 랜덤",
    placeholder_seed: "랜덤",
    section_cfg: "CFG",
    desc_cfg_rescale: "0.0 ~ 1.0",
    desc_skip_cfg: "비워두면 비활성 (null)",
    placeholder_cfg_disabled: "(비활성)",
    section_dynamic_thresholding: "Dynamic Thresholding",
    section_main_prompt: "Main Prompt",
    desc_main_prompt:
      "메인 프롬프트(v4_prompt.base_caption). 요청에 prompt가 비어 있을 때 fallback으로 사용됩니다.",
    btn_import_nai: "NovelAI 이미지에서 가져오기",
    desc_import_nai:
      "NovelAI가 생성한 PNG를 불러와 프롬프트/파라미터를 자동으로 채웁니다.",
    notice_nai_imported: "NovelAI 파라미터를 가져왔습니다.",
    notice_nai_parse_failed:
      "NovelAI 메타데이터를 찾지 못했습니다. NAI 생성 원본 PNG인지 확인하세요.",
    section_negative_prompt: "Negative Prompt (UC)",
    desc_negative_prompt:
      "v4_negative_prompt.base_caption 및 루트 uc 둘 다에 적용. 비워두면 공란.",
    desc_use_order: "캐릭터 프롬프트 순서 강제. 기본 ON",
    section_vibe_transfer: "Vibe Transfer",
    section_advanced_image: "고급",
    desc_prefer_brownian: "기본 ON",
    desc_uncond_per_vibe: "기본 ON",
    desc_wonky_vibe: "기본 ON",

    // Image tooltips (hover / long-press)
    tooltip_size_preset:
      "이미지의 가로×세로 해상도 프리셋입니다. 8의 배수여야 하며, NAI는 세로형(832×1216)을 기본 권장합니다.",
    tooltip_steps:
      "디노이징 스텝 수입니다. 높을수록 디테일해지지만 생성 시간이 길어집니다. 기본값 28.",
    tooltip_scale:
      "Prompt Guidance (CFG Scale). 프롬프트를 얼마나 엄격하게 따를지 결정합니다. 낮으면 자유롭고, 높으면 강하게 묶이지만 색이 타버릴 수 있습니다. NAI V4는 5~7 전후가 적정값.",
    tooltip_seed:
      "노이즈 생성의 랜덤 시드입니다. 같은 시드+파라미터면 항상 같은 이미지가 생성됩니다. 비워두면 매 요청마다 랜덤.",
    tooltip_sampler:
      "노이즈를 제거(디노이징)하는 샘플링 알고리즘입니다. k_euler_ancestral이나 k_dpmpp_2m_sde 계열이 자주 사용됩니다.",
    tooltip_cfg_rescale:
      "CFG Scale이 높을 때 발생하는 색상 과포화(타는 현상)를 완화합니다. 0.0~1.0 사이 값. 높은 CFG와 함께 사용하세요.",
    tooltip_noise_schedule:
      "노이즈 감소 스케줄러입니다. karras가 디테일 보존에 가장 일반적으로 유리합니다.",
    tooltip_n_samples: "한 번의 요청으로 생성할 이미지 수입니다.",
    tooltip_uncond_scale:
      "네거티브 프롬프트(Unconditional)의 영향력 배율입니다. 기본값 1.0.",
    tooltip_skip_cfg_above:
      "이미지가 거의 완성된(노이즈가 적은) 구간에서 CFG 계산을 스킵합니다. Variety+로 표시되며, 연산량 감소와 다양성 향상에 사용됩니다. 비워두면 비활성.",
    tooltip_skip_cfg_below:
      "초기 뼈대를 잡는(노이즈가 큰) 구간에서 CFG 계산을 스킵합니다. 비워두면 비활성.",
    tooltip_dynamic_thresholding:
      "CFG Scale을 극단적으로 높였을 때 이미지 붕괴를 막아주는 기능입니다. 주로 CFG 10 이상에서 사용합니다.",
    tooltip_dt_mimic_scale:
      "실제 CFG는 높게 두되, 모델이 마치 이 값의 CFG처럼 행동하게 만듭니다. 낮추면 과포화를 막으면서 프롬프트 구성력은 유지합니다.",
    tooltip_dt_percentile:
      "동적 임계값을 결정할 때 참조할 픽셀의 백분위수입니다. 기본값 0.999.",
    tooltip_negative_prompt:
      "이미지에서 제외하고 싶은 요소를 입력합니다. v4_negative_prompt.base_caption과 루트 uc 모두에 적용됩니다.",
    tooltip_use_coords:
      "V4 멀티 캐릭터 배치 시 각 캐릭터의 위치(좌표)를 프롬프트에 명시합니다.",
    tooltip_use_order:
      "멀티 캐릭터 프롬프트에서 캐릭터 등장 순서를 강제합니다. 기본 ON.",
    tooltip_legacy_uc:
      "V3 이하 방식의 네거티브 프롬프트 파싱을 사용합니다. V4의 새 파서가 마음에 들지 않을 때 활성화하세요.",
    tooltip_uncond_per_vibe:
      "Vibe Transfer 사용 시 각 Vibe마다 개별적으로 네거티브(Unconditional) 연산을 수행합니다. true면 Vibe 간 간섭이 줄어듭니다. 기본 ON.",
    tooltip_wonky_vibe:
      "Vibe Transfer 상관관계 계산 방식 토글입니다. 일반적으로 true 권장. 기본 ON.",
    tooltip_controlnet:
      "ControlNet 적용 강도입니다. 자세(포즈)나 선화 구조를 강제하는 기능으로 1.0이 최대.",
    tooltip_prefer_brownian:
      "브라운 운동 기반 노이즈 생성 방식을 선호합니다. 미세한 디테일에 영향을 줍니다. 기본 ON.",
    tooltip_cfg_sched:
      "CFG 스케줄링을 적용할 샘플러 범위를 지정합니다.",
    tooltip_euler_bug:
      "과거 Euler Ancestral 샘플러의 버그를 의도적으로 재현합니다. 이 버그 특유의 거친 질감을 원하는 경우 활성화하세요.",
    tooltip_explike: "극도의 미세 디테일을 끌어내기 위한 실험적 옵션입니다.",
    tooltip_minimize_sigma: "무한대 시그마(Sigma) 값을 최소화하는 수학적 설정입니다.",

    // Voice section
    section_voice: "Voice 파라미터 (ElevenLabs TTS)",
    placeholder_voice_id: "예: 21m00Tcm4TlvDq8ikWAM (Rachel)",
    btn_load_voices: "보이스 불러오기",
    n_voices: "{count}개 보이스",
    notice_voice_load_failed: "보이스 로드 실패: {error}",
    desc_output_format: "ElevenLabs 포맷 코드 (예: mp3_44100_128, pcm_16000, opus_48000_192)",
    desc_language_code: "일부 모델에서만 사용 (예: ko, en, ja)",

    // Buttons
    btn_save: "저장",
    btn_add: "추가",
    btn_cancel_modal: "취소",

    // Validation notices
    notice_model_required: "모델명을 입력하세요",
    notice_base_url_required: "OpenAI-호환 프로바이더는 Base URL이 필수입니다",
    notice_voice_id_required: "ElevenLabs voice_id를 입력하세요 (보이스 불러오기에서 선택 가능)",
    notice_profile_saved: "프로필 저장 완료",
    notice_profile_added: "프로필 추가 완료",
    error_notice_hint: "클릭하면 로그가 열립니다",
    log_modal_title: "요청 에러 로그",
    log_modal_empty: "기록된 에러가 없습니다.",
    btn_copy: "복사",
    copied: "복사됨!",
    copy_failed: "복사 실패",
  },

  en: {
    // Tabs
    tab_profiles: "Profiles",
    tab_secrets: "Secrets",
    tab_advanced: "Advanced",
    tab_about: "About",

    // Profile tab
    heading_profiles: "Model Profiles",
    no_profiles: "No {kind} profiles registered.",
    btn_edit: "Edit",
    btn_clone: "Clone",
    clone_suffix: " (copy)",
    btn_test: "Test",
    testing_connection: "Testing connection...",
    test_ok: "✅ Connected",
    test_failed: "❌ Failed: {error}",
    test_error: "❌ Error: {error}",
    btn_delete: "Delete",
    confirm_delete_profile: "Delete profile '{name}'?",
    unknown: "(unknown)",

    // Secrets tab
    heading_secrets: "API Keys (Secrets Vault)",
    warn_secrets_plaintext:
      "⚠ API keys are stored in plaintext in data.json. If you share or sync this vault folder, keys may be exposed.",
    no_secrets: "No keys stored. They will be created when you add a profile.",
    in_use: "In use: {names}",
    unused: "Unused",
    btn_reenter: "Re-enter",
    prompt_new_key: "Enter new API key ({ref})",
    confirm_delete_key: "Delete {ref}?",
    secrets_queue_note:
      "Toggle ON: serialize requests from all profiles sharing this key (prevents concurrent 429 errors). NovelAI keys default to ON.",
    secrets_queue_name: "Serialize requests",

    // Advanced tab
    heading_advanced: "Advanced Settings",
    setting_language_name: "Interface Language",
    setting_language_desc: "Select UI language",
    lang_ko: "한국어",
    lang_en: "English",
    setting_timeout_name: "Request Timeout (ms)",
    setting_timeout_desc: "Requests exceeding this duration are automatically cancelled",
    setting_max_turns_name: "Agent Default maxTurns",
    setting_max_turns_desc: "Used when maxTurns is not specified in agent() requests",
    setting_log_name: "Request Logging (Console)",
    setting_log_desc: "Logs profile info to console on generation/agent calls",
    setting_cancel_all_name: "Cancel All Active Requests",
    btn_cancel: "Cancel",
    notice_cancelled_all: "All active requests cancelled",

    // About tab
    about_version_desc: "v{version} · Obsidian AI response hub.",
    about_features:
      "Features: Model profile management / chat·text·image·tts·stt generation / Multi-turn agent runtime / Event streaming.",

    // Profile modal
    modal_title_edit: "Edit Profile",
    modal_title_add: "Add Profile",
    field_display_name: "Display Name",
    placeholder_display_name: "e.g. NAI workspace",
    field_kind: "Kind",
    kind_chat: "Chat",
    kind_text: "Text completion (NovelAI)",
    kind_image: "Image (NovelAI)",
    kind_voice: "Voice TTS (ElevenLabs)",
    field_provider: "Provider",
    provider_openai_compatible: "OpenAI-compatible (Ollama, LM Studio, vLLM, Kimi, etc.)",
    provider_label_openai_compat: "OpenAI-compatible",
    provider_lock_text: "Text completion is locked to NovelAI",
    provider_lock_image: "Image generation is locked to NovelAI",
    provider_lock_voice: "Voice TTS is locked to ElevenLabs",
    field_base_url: "Base URL",
    base_url_desc_image: "Optional. Defaults to https://image.novelai.net",
    base_url_desc_text: "Optional. Defaults to https://text.novelai.net/oa/v1",
    base_url_desc_voice: "Optional. Defaults to https://api.elevenlabs.io/v1",
    base_url_desc_openai_compat: "Required. e.g. http://localhost:11434/v1 (Ollama)",
    base_url_desc_vertex:
      "Optional. With service-account JSON auth, enter only the region (e.g. us-central1, asia-northeast3); empty = global. " +
      "Express mode (API key) can be left empty. " +
      "To use an OAuth access token, enter the full .../projects/{project}/locations/{region}/publishers/google/models path.",
    base_url_desc_default: "Optional. Uses provider default if empty",
    field_api_key: "API Key",
    desc_api_key:
      "Saved to Secrets Vault under the 'API Key Name' below. Leave empty if a key is already stored.",
    api_key_vertex_placeholder: '{\n  "type": "service_account",\n  ...\n}',
    desc_api_key_vertex:
      "Recommended: paste the entire service-account key file (JSON) — it signs a JWT and authenticates via OAuth automatically (project_id is read from the JSON, region from baseUrl above). " +
      "Alternatively, enter an Express API key or a temporary OAuth access token. Saved to Secrets Vault under the 'API Key Name'.",
    field_api_key_ref: "API Key Name (apiKeyRef)",
    desc_api_key_ref_prefix:
      "Identifier for this key. Profiles sharing the same name share the same API key. Defaults to '{default}' if empty.",
    stored_refs_hint: "Stored keys: {refs}",
    no_stored_refs: "No keys stored yet",
    field_model: "Model",
    desc_model: "Type directly or use 'Load Models' to select from a list",
    btn_load_models: "Load Models",
    placeholder_select_list: "-- Select from list --",
    n_models: "{count} models",
    n_models_built_in: "{count} (built-in)",
    failed: "Failed",
    notice_no_model_list: "This provider does not support loading a model list",
    notice_enter_api_key: "Please enter an API key first",
    loading: "Loading...",
    notice_model_load_failed: "Failed to load models: {error}",

    // Model placeholders
    model_ph_image: "nai-diffusion-4-5-full",
    model_ph_text: "kayra-v1 / erato (NovelAI text models)",
    model_ph_voice: "eleven_multilingual_v2",
    model_ph_chat: "claude-opus-4-6 / gpt-4o / gemini-2.5-pro",

    // Chat section
    section_chat: "Chat Parameters",
    setting_default_profile: "Default Generation Profile",
    desc_default_profile_chat:
      "When enabled, this profile is used for chat requests that do not specify a profileId",
    desc_default_profile_text:
      "When enabled, this profile is used for text requests that do not specify a profileId",
    desc_default_profile_image:
      "When enabled, this profile is used for image requests that do not specify a profileId",
    desc_top_p: "Leave empty if unsure whether the model supports this",
    desc_top_k: "Leave empty if unsure whether the model supports this",
    desc_min_p: "Probability cutoff (supported by vLLM/LM Studio family)",
    section_sampling_gate: "Allowed sampling parameters (plugin-exposed)",
    desc_sampling_gate:
      "Only checked keys are accepted from external plugins' paramsOverride. Unchecked keys are dropped even if a request fills them in, and the profile's own value is not sent to the model. temperature and max tokens are always allowed.",
    btn_detect_params: "Auto-detect parameters",
    hint_params_detected: "detected — parameters auto-configured",
    hint_params_unknown: "Service unrecognised — enter BaseURL then re-detect",
    placeholder_thinking_disabled: "0 = disabled",
    placeholder_none: "(none)",
    setting_streaming: "Enable Streaming",
    desc_streaming: "When enabled, chat() calls are processed as token-level streams internally",
    setting_thinking_disabled: "Disable thinking",
    desc_thinking_disabled:
      "Turns off thinking/reasoning for reasoning models. Translated to the correct parameter per service (Anthropic: thinking=disabled · Google: thinkingBudget=0 · OpenAI & compatible: per detected service)",
    desc_reasoning_effort:
      "Only levels supported by the detected service are shown. Re-run 'Auto-detect parameters' after changing BaseURL/model.",
    desc_thinking_disable_unsupported:
      "⚠ This service does not support disabling reasoning. When on, the lowest supported level is used instead, or the parameter is omitted.",

    // Text section
    section_text: "Text Parameters (NovelAI)",
    setting_stop_sequences: "stop sequences (comma-separated)",

    // Image section
    section_image: "Image Parameters (NovelAI v4.5)",
    setting_size_preset: "Size Preset",
    option_custom: "Custom",
    section_size: "Size",
    section_sampling: "Sampling",
    desc_seed: "Leave empty for random seed on each request",
    placeholder_seed: "random",
    section_cfg: "CFG",
    desc_cfg_rescale: "0.0 ~ 1.0",
    desc_skip_cfg: "Leave empty to disable (null)",
    placeholder_cfg_disabled: "(disabled)",
    section_dynamic_thresholding: "Dynamic Thresholding",
    section_main_prompt: "Main Prompt",
    desc_main_prompt:
      "Main prompt (v4_prompt.base_caption). Used as fallback when the request has an empty prompt.",
    btn_import_nai: "Import from NovelAI image",
    desc_import_nai:
      "Load a NovelAI-generated PNG to auto-fill prompt/parameters.",
    notice_nai_imported: "Imported NovelAI parameters.",
    notice_nai_parse_failed:
      "No NovelAI metadata found. Make sure this is an original NAI-generated PNG.",
    section_negative_prompt: "Negative Prompt (UC)",
    desc_negative_prompt:
      "Applied to both v4_negative_prompt.base_caption and root uc. Leave empty for blank.",
    desc_use_order: "Force character prompt order. Default ON",
    section_vibe_transfer: "Vibe Transfer",
    section_advanced_image: "Advanced",
    desc_prefer_brownian: "Default ON",
    desc_uncond_per_vibe: "Default ON",
    desc_wonky_vibe: "Default ON",

    // Image tooltips (hover / long-press)
    tooltip_size_preset:
      "Image resolution preset (width×height). Must be a multiple of 8. NAI recommends portrait (832×1216) by default.",
    tooltip_steps:
      "Number of denoising steps. Higher values yield more detail but take longer. Default: 28.",
    tooltip_scale:
      "Prompt Guidance (CFG Scale). Controls how strictly the image follows the prompt. Low = creative freedom; high = strict adherence but may cause color burn. ~5–7 is recommended for NAI V4.",
    tooltip_seed:
      "Random seed for noise generation. The same seed + parameters always produces the same image. Leave empty for a random seed each request.",
    tooltip_sampler:
      "Denoising sampling algorithm. k_euler_ancestral and k_dpmpp_2m_sde variants are most commonly used.",
    tooltip_cfg_rescale:
      "Softens color oversaturation (burning) that occurs at high CFG Scale. Range: 0.0–1.0. Use together with a high CFG value.",
    tooltip_noise_schedule:
      "Noise reduction scheduler. 'karras' is generally best for preserving fine detail.",
    tooltip_n_samples: "Number of images to generate per request.",
    tooltip_uncond_scale:
      "Multiplier for the influence of the negative prompt (unconditional guidance). Default: 1.0.",
    tooltip_skip_cfg_above:
      "Skips CFG computation when the image is nearly complete (low noise). Labeled 'Variety+' — reduces compute and increases variety. Leave empty to disable.",
    tooltip_skip_cfg_below:
      "Skips CFG computation during the initial structure-building phase (high noise). Leave empty to disable.",
    tooltip_dynamic_thresholding:
      "Prevents image collapse when using very high CFG Scale. Primarily useful above CFG 10.",
    tooltip_dt_mimic_scale:
      "Makes the model behave as if CFG were this value, while keeping actual CFG high. Lowering this prevents oversaturation while maintaining strong prompt adherence.",
    tooltip_dt_percentile:
      "Percentile of pixels used to determine the dynamic threshold. Default: 0.999.",
    tooltip_negative_prompt:
      "Elements to exclude from the image. Applied to both v4_negative_prompt.base_caption and root uc.",
    tooltip_use_coords:
      "Specifies position coordinates for each character in V4 multi-character prompts.",
    tooltip_use_order:
      "Forces character appearance order in multi-character prompts. Default ON.",
    tooltip_legacy_uc:
      "Uses the old (V3-style) negative prompt parsing. Enable if you prefer it over V4's new parser.",
    tooltip_uncond_per_vibe:
      "Performs separate negative (unconditional) computation per Vibe during Vibe Transfer. Reduces interference between multiple Vibes. Default ON.",
    tooltip_wonky_vibe:
      "Controls the Vibe correlation calculation method. Generally recommended to keep ON. Default ON.",
    tooltip_controlnet:
      "ControlNet application strength. Forces pose or lineart structure onto the image. Max: 1.0.",
    tooltip_prefer_brownian:
      "Prefers Brownian motion-based noise generation. Affects fine detail. Default ON.",
    tooltip_cfg_sched:
      "Specifies which samplers are eligible for CFG scheduling.",
    tooltip_euler_bug:
      "Intentionally reproduces a bug from the old Euler Ancestral sampler. Enable if you prefer its characteristic rough texture.",
    tooltip_explike: "Experimental option for extracting extreme fine detail.",
    tooltip_minimize_sigma: "Mathematical setting to minimize infinite sigma values.",

    // Voice section
    section_voice: "Voice Parameters (ElevenLabs TTS)",
    placeholder_voice_id: "e.g. 21m00Tcm4TlvDq8ikWAM (Rachel)",
    btn_load_voices: "Load Voices",
    n_voices: "{count} voices",
    notice_voice_load_failed: "Failed to load voices: {error}",
    desc_output_format:
      "ElevenLabs format code (e.g. mp3_44100_128, pcm_16000, opus_48000_192)",
    desc_language_code: "Only used by some models (e.g. ko, en, ja)",

    // Buttons
    btn_save: "Save",
    btn_add: "Add",
    btn_cancel_modal: "Cancel",

    // Validation notices
    notice_model_required: "Please enter a model name",
    notice_base_url_required: "Base URL is required for OpenAI-compatible providers",
    notice_voice_id_required: "Please enter an ElevenLabs voice_id (use Load Voices to select)",
    notice_profile_saved: "Profile saved",
    notice_profile_added: "Profile added",
    error_notice_hint: "Click to open the log",
    log_modal_title: "Request error log",
    log_modal_empty: "No errors recorded.",
    btn_copy: "Copy",
    copied: "Copied!",
    copy_failed: "Copy failed",
  },
} as const;

export type StringKey = keyof typeof STRINGS.ko;

export function makeT(lang: Lang) {
  const s = STRINGS[lang] as Record<StringKey, string>;
  return (key: StringKey): string => s[key];
}
