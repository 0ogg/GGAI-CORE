var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  GGAICancelledError: () => GGAICancelledError,
  countTokens: () => countTokens,
  default: () => GGAICorePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian10 = require("obsidian");

// src/storage/profile-store.ts
var ProfileStore = class {
  constructor(initial, persistFn) {
    this.persistFn = persistFn;
    this.handlers = /* @__PURE__ */ new Map();
    this.profiles = [...initial];
    this.ensureDefaults();
  }
  snapshot() {
    return this.profiles.map((p) => ({ ...p }));
  }
  list(kind) {
    return kind ? this.profiles.filter((p) => p.kind === kind) : [...this.profiles];
  }
  get(id) {
    var _a;
    return (_a = this.profiles.find((p) => p.id === id)) != null ? _a : null;
  }
  getDefault(kind) {
    var _a;
    return (_a = this.profiles.find(
      (p) => p.kind === kind && p.isDefault === true
    )) != null ? _a : null;
  }
  /** chat/text 구분 없이 isDefault인 텍스트 생성 프로필을 반환. generate() 라우팅용. */
  getDefaultGeneration() {
    var _a;
    return (_a = this.profiles.find(
      (p) => (p.kind === "chat" || p.kind === "text") && p.isDefault === true
    )) != null ? _a : null;
  }
  async add(profile) {
    if (profile.isDefault) {
      this.clearDefaultForKind(profile.kind, profile.id);
    }
    this.profiles.push(profile);
    this.ensureDefaults();
    await this.persistFn();
    this.emit("profiles-changed");
  }
  async update(id, patch) {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1)
      return;
    if (patch.isDefault) {
      this.clearDefaultForKind(this.profiles[idx].kind, id);
    }
    this.profiles[idx] = { ...this.profiles[idx], ...patch, updatedAt: Date.now() };
    this.ensureDefaults();
    await this.persistFn();
    this.emit("profiles-changed");
  }
  clearDefaultForKind(kind, exceptId) {
    for (const p of this.profiles) {
      if (p.kind === kind && p.id !== exceptId) {
        p.isDefault = false;
      }
    }
  }
  // chat/text/image 각각 프로필이 하나 이상 존재하면 반드시 메인(isDefault) 프로필이
  // 하나는 있도록 보장한다. 없으면 가장 먼저 등록된(createdAt이 가장 이른) 프로필을 지정.
  ensureDefaults() {
    const kinds = ["chat", "text", "image"];
    for (const kind of kinds) {
      const ofKind = this.profiles.filter((p) => p.kind === kind);
      if (!ofKind.length)
        continue;
      if (ofKind.some((p) => p.isDefault === true))
        continue;
      const earliest = ofKind.reduce((a, b) => a.createdAt <= b.createdAt ? a : b);
      earliest.isDefault = true;
    }
  }
  async remove(id) {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    this.ensureDefaults();
    await this.persistFn();
    this.emit("profiles-changed");
  }
  on(event, handler) {
    if (!this.handlers.has(event))
      this.handlers.set(event, /* @__PURE__ */ new Set());
    this.handlers.get(event).add(handler);
    return () => {
      var _a;
      return (_a = this.handlers.get(event)) == null ? void 0 : _a.delete(handler);
    };
  }
  emit(event) {
    var _a;
    (_a = this.handlers.get(event)) == null ? void 0 : _a.forEach((h) => {
      try {
        h();
      } catch (e) {
        console.warn("[GGAI] profile handler error", e);
      }
    });
  }
};

// src/storage/secrets-vault.ts
var SecretsVault = class {
  constructor(initial, persistFn) {
    this.persistFn = persistFn;
    this.secrets = { ...initial };
  }
  snapshot() {
    return { ...this.secrets };
  }
  get(ref) {
    return this.secrets[ref];
  }
  async set(ref, value) {
    this.secrets[ref] = value;
    await this.persistFn();
  }
  async remove(ref) {
    delete this.secrets[ref];
    await this.persistFn();
  }
  listRefs() {
    return Object.keys(this.secrets);
  }
  /** UI 표시용 마스킹 (sk-****1234 형태) */
  mask(ref) {
    const v = this.secrets[ref];
    if (!v)
      return "(\uBBF8\uC124\uC815)";
    if (v.length <= 8)
      return "****";
    return `${v.slice(0, 4)}****${v.slice(-4)}`;
  }
};

// src/providers/anthropic.ts
var import_obsidian2 = require("obsidian");

// src/util/request.ts
var import_obsidian = require("obsidian");
function requestUrlAbortable(params, signal) {
  if (!signal)
    return (0, import_obsidian.requestUrl)(params);
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    (0, import_obsidian.requestUrl)(params).then(
      (res) => {
        signal.removeEventListener("abort", onAbort);
        resolve(res);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

// src/util/translate.ts
function translateForAnthropic(messages) {
  var _a;
  let system;
  const out = [];
  const sysTexts = [];
  const rest = [];
  for (const m of messages) {
    if (m.role === "system") {
      sysTexts.push(typeof m.content === "string" ? m.content : flattenBlocksToText(m.content));
    } else {
      rest.push(m);
    }
  }
  if (sysTexts.length)
    system = sysTexts.join("\n\n");
  for (const m of rest) {
    if (m.role === "tool") {
      const text = typeof m.content === "string" ? m.content : flattenBlocksToText(m.content);
      out.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: (_a = m.toolCallId) != null ? _a : "",
          content: text
        }]
      });
      continue;
    }
    if (m.role === "assistant") {
      const blocks = [];
      if (typeof m.content === "string") {
        if (m.content)
          blocks.push({ type: "text", text: m.content });
      } else {
        for (const b of m.content)
          blocks.push(toAnthropicBlock(b));
      }
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        }
      }
      out.push({ role: "assistant", content: blocks.length ? blocks : "" });
      continue;
    }
    if (typeof m.content === "string") {
      out.push({ role: "user", content: m.content });
    } else {
      out.push({ role: "user", content: m.content.map(toAnthropicBlock) });
    }
  }
  return { system, messages: out };
}
function toAnthropicBlock(b) {
  if (b.type === "text")
    return { type: "text", text: b.text };
  if (b.source.kind === "base64") {
    return { type: "image", source: { type: "base64", media_type: b.source.mediaType, data: b.source.data } };
  }
  return { type: "image", source: { type: "url", url: b.source.url } };
}
function translateToolsForAnthropic(tools) {
  if (!tools)
    return void 0;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema
  }));
}
function translateAnthropicToolChoice(tc) {
  if (!tc)
    return void 0;
  if (tc === "auto")
    return { type: "auto" };
  if (tc === "none")
    return { type: "none" };
  if (tc === "required")
    return { type: "any" };
  return { type: "tool", name: tc.name };
}
function translateForOpenAI(messages) {
  var _a, _b;
  const out = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: (_a = m.toolCallId) != null ? _a : "",
        content: typeof m.content === "string" ? m.content : flattenBlocksToText(m.content)
      });
      continue;
    }
    if (m.role === "assistant") {
      const content = typeof m.content === "string" ? m.content : flattenBlocksToText(m.content);
      const msg = { role: "assistant", content };
      if ((_b = m.toolCalls) == null ? void 0 : _b.length) {
        msg.tool_calls = m.toolCalls.map((tc) => {
          var _a2;
          return {
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify((_a2 = tc.input) != null ? _a2 : {}) }
          };
        });
      }
      out.push(msg);
      continue;
    }
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
    } else {
      out.push({
        role: m.role,
        content: m.content.map(
          (b) => b.type === "text" ? { type: "text", text: b.text } : {
            type: "image_url",
            image_url: {
              url: b.source.kind === "url" ? b.source.url : `data:${b.source.mediaType};base64,${b.source.data}`
            }
          }
        )
      });
    }
  }
  return out;
}
function translateToolsForOpenAI(tools) {
  if (!tools)
    return void 0;
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }
  }));
}
function translateOpenAIToolChoice(tc) {
  if (!tc)
    return void 0;
  if (tc === "auto" || tc === "none" || tc === "required")
    return tc;
  return { type: "function", function: { name: tc.name } };
}
function translateForGemini(messages) {
  var _a;
  let systemText = "";
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemText += (systemText ? "\n\n" : "") + (typeof m.content === "string" ? m.content : flattenBlocksToText(m.content));
      continue;
    }
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: (_a = m.toolCallId) != null ? _a : "",
              response: {
                content: typeof m.content === "string" ? m.content : flattenBlocksToText(m.content)
              }
            }
          }
        ]
      });
      continue;
    }
    if (m.role === "assistant") {
      const parts = [];
      const textContent = typeof m.content === "string" ? m.content : flattenBlocksToText(m.content);
      if (textContent)
        parts.push({ text: textContent });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.input } });
        }
      }
      contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });
      continue;
    }
    if (typeof m.content === "string") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else {
      const parts = [];
      for (const b of m.content) {
        if (b.type === "text")
          parts.push({ text: b.text });
        else if (b.source.kind === "base64") {
          parts.push({
            inlineData: { mimeType: b.source.mediaType, data: b.source.data }
          });
        } else {
          parts.push({ text: `[image: ${b.source.url}]` });
        }
      }
      contents.push({ role: "user", parts });
    }
  }
  const out = { contents };
  if (systemText)
    out.systemInstruction = { parts: [{ text: systemText }] };
  return out;
}
function translateToolsForGemini(tools) {
  if (!(tools == null ? void 0 : tools.length))
    return void 0;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema
      }))
    }
  ];
}
function flattenBlocksToText(blocks) {
  return blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
}

// src/util/sse-parser.ts
async function* parseSSE(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let cur = {};
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done)
        break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (line === "") {
          if (cur.data !== void 0 || cur.event !== void 0)
            yield cur;
          cur = {};
        } else if (line.startsWith(":")) {
        } else {
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const value2 = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "data") {
            cur.data = cur.data === void 0 ? value2 : cur.data + "\n" + value2;
          } else if (field === "event") {
            cur.event = value2;
          } else if (field === "id") {
            cur.id = value2;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// src/providers/anthropic.ts
var AnthropicAdapter = class {
  constructor() {
    this.kind = "anthropic";
    this.supports = { chat: true };
  }
  async chat(call) {
    var _a, _b;
    const body = buildAnthropicBody(
      call,
      /*stream*/
      false
    );
    const url = ((_a = call.profile.baseUrl) != null ? _a : "https://api.anthropic.com") + "/v1/messages";
    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": call.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body),
      throw: false
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Anthropic ${res.status}: ${(_b = res.text) != null ? _b : ""}`);
    }
    const data = res.json;
    return normalizeAnthropicResponse(data);
  }
  async *chatStream(call) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    const body = buildAnthropicBody(
      call,
      /*stream*/
      true
    );
    const url = ((_a = call.profile.baseUrl) != null ? _a : "https://api.anthropic.com") + "/v1/messages";
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": call.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body),
        signal: call.signal
      });
    } catch (e) {
      yield { type: "error", error: { message: e.message } };
      return;
    }
    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : "";
      yield { type: "error", error: { message: `Anthropic ${res.status}: ${text}` } };
      return;
    }
    let fullText = "";
    let fullReasoning = "";
    const toolCallsAccum = {};
    let stopReason = "end";
    const usage = { inputTokens: 0, outputTokens: 0 };
    for await (const evt of parseSSE(res.body)) {
      if (!evt.data)
        continue;
      let data;
      try {
        data = JSON.parse(evt.data);
      } catch (e) {
        continue;
      }
      if (data.type === "content_block_start" && ((_b = data.content_block) == null ? void 0 : _b.type) === "tool_use") {
        const cb = data.content_block;
        toolCallsAccum[String(data.index)] = {
          id: cb.id,
          name: cb.name,
          input: {},
          rawJson: ""
        };
        yield { type: "tool-call-start", toolCallId: cb.id, name: cb.name };
      } else if (data.type === "content_block_delta") {
        if (((_c = data.delta) == null ? void 0 : _c.type) === "text_delta") {
          fullText += (_d = data.delta.text) != null ? _d : "";
          yield { type: "text-delta", delta: (_e = data.delta.text) != null ? _e : "" };
        } else if (((_f = data.delta) == null ? void 0 : _f.type) === "thinking_delta") {
          const d = (_g = data.delta.thinking) != null ? _g : "";
          if (d)
            fullReasoning += d;
        } else if (((_h = data.delta) == null ? void 0 : _h.type) === "input_json_delta") {
          const acc = toolCallsAccum[String(data.index)];
          if (acc) {
            const d = (_i = data.delta.partial_json) != null ? _i : "";
            acc.rawJson += d;
            yield { type: "tool-call-args-delta", toolCallId: acc.id, delta: d };
          }
        }
      } else if (data.type === "content_block_stop") {
        const acc = toolCallsAccum[String(data.index)];
        if (acc) {
          try {
            acc.input = JSON.parse(acc.rawJson || "{}");
          } catch (e) {
            acc.input = {};
          }
          yield {
            type: "tool-call-end",
            toolCallId: acc.id,
            name: acc.name,
            input: acc.input
          };
        }
      } else if (data.type === "message_delta") {
        if ((_j = data.delta) == null ? void 0 : _j.stop_reason)
          stopReason = mapAnthropicStopReason(data.delta.stop_reason);
        if (data.usage) {
          usage.inputTokens += (_k = data.usage.input_tokens) != null ? _k : 0;
          usage.outputTokens += (_l = data.usage.output_tokens) != null ? _l : 0;
        }
      } else if (data.type === "message_start" && ((_m = data.message) == null ? void 0 : _m.usage)) {
        usage.inputTokens += (_n = data.message.usage.input_tokens) != null ? _n : 0;
        usage.outputTokens += (_o = data.message.usage.output_tokens) != null ? _o : 0;
      }
    }
    const response = {
      text: fullText,
      ...fullReasoning ? { reasoning: fullReasoning } : {},
      toolCalls: Object.values(toolCallsAccum).map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input
      })),
      stopReason,
      usage,
      raw: null
    };
    yield { type: "done", response };
  }
  async validate(profile, apiKey) {
    var _a, _b;
    try {
      const res = await (0, import_obsidian2.requestUrl)({
        url: ((_a = profile.baseUrl) != null ? _a : "https://api.anthropic.com") + "/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: profile.model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }]
        }),
        throw: false
      });
      if (res.status >= 200 && res.status < 300)
        return { ok: true };
      return { ok: false, error: `${res.status} ${(_b = res.text) != null ? _b : ""}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};
function buildAnthropicBody(call, stream) {
  var _a, _b, _c, _d;
  const { profile, request } = call;
  const chatProfile = profile;
  const profileParams = (_a = chatProfile.params) != null ? _a : {};
  const params = { ...profileParams, ...(_b = request.paramsOverride) != null ? _b : {} };
  const { system, messages } = translateForAnthropic(request.messages);
  const tools = translateToolsForAnthropic(request.tools);
  const body = {
    model: profile.model,
    max_tokens: (_c = params.maxTokens) != null ? _c : 32e3,
    messages,
    stream
  };
  if (system)
    body.system = system;
  if (params.temperature !== void 0)
    body.temperature = params.temperature;
  if (params.topP !== void 0)
    body.top_p = params.topP;
  if (params.topK !== void 0)
    body.top_k = params.topK;
  if ((_d = params.stopSequences) == null ? void 0 : _d.length)
    body.stop_sequences = params.stopSequences;
  if (tools == null ? void 0 : tools.length)
    body.tools = tools;
  const tc = translateAnthropicToolChoice(request.toolChoice);
  if (tc)
    body.tool_choice = tc;
  if (params.thinkingDisabled) {
    body.thinking = { type: "disabled" };
  } else if (params.thinkingBudget) {
    body.thinking = { type: "enabled", budget_tokens: params.thinkingBudget };
  }
  return body;
}
function normalizeAnthropicResponse(data) {
  var _a, _b, _c, _d, _e, _f;
  const blocks = (_a = data.content) != null ? _a : [];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
  const thinkingBlocks = blocks.filter((b) => b.type === "thinking");
  const reasoning = thinkingBlocks.length ? thinkingBlocks.map((b) => b.thinking).join("") : void 0;
  const toolCalls = blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input }));
  return {
    text,
    ...reasoning ? { reasoning } : {},
    toolCalls,
    stopReason: mapAnthropicStopReason((_b = data.stop_reason) != null ? _b : "end_turn"),
    usage: {
      inputTokens: (_d = (_c = data.usage) == null ? void 0 : _c.input_tokens) != null ? _d : 0,
      outputTokens: (_f = (_e = data.usage) == null ? void 0 : _e.output_tokens) != null ? _f : 0
    },
    raw: data
  };
}
function mapAnthropicStopReason(r) {
  if (r === "tool_use")
    return "tool_use";
  if (r === "max_tokens")
    return "max_tokens";
  if (r === "stop_sequence")
    return "stop_sequence";
  return "end";
}

// src/providers/openai.ts
var import_obsidian3 = require("obsidian");

// src/data/provider-params.ts
var KNOWN = {
  anthropic: { topP: true, topK: true, minP: false },
  openai: { topP: true, topK: false, minP: false },
  google: { topP: true, topK: true, minP: false },
  novelai: { topP: true, topK: true, minP: true },
  elevenlabs: { topP: false, topK: false, minP: false }
};
var COMPAT_SUPPORT = {
  ollama: { topP: true, topK: true, minP: true },
  vllm: { topP: true, topK: true, minP: true },
  lmstudio: { topP: true, topK: true, minP: true },
  deepseek: { topP: true, topK: false, minP: false },
  kimi: { topP: true, topK: false, minP: false },
  zai: { topP: true, topK: false, minP: false },
  openrouter: { topP: true, topK: false, minP: false },
  // 다양한 백엔드로 라우팅되는 프록시 — 어떤 모델이 붙을지 알 수 없어 보수적으로 topP만.
  nanogpt: { topP: true, topK: false, minP: false },
  unknown: { topP: true, topK: false, minP: false }
};
function detectCompatService(baseUrl, model = "") {
  const url = baseUrl.toLowerCase();
  const mdl = model.toLowerCase();
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0") || url.startsWith("http://[::1]");
  if (isLocal) {
    if (url.includes(":11434"))
      return "ollama";
    if (url.includes(":1234"))
      return "lmstudio";
    return "vllm";
  }
  if (url.includes("deepseek") || mdl.includes("deepseek"))
    return "deepseek";
  if (url.includes("moonshot") || url.includes("kimi"))
    return "kimi";
  if (url.includes("z.ai"))
    return "zai";
  if (url.includes("openrouter"))
    return "openrouter";
  if (url.includes("nano-gpt") || url.includes("nanogpt"))
    return "nanogpt";
  return "unknown";
}
function getProviderParamDefaults(provider, baseUrl = "", model = "") {
  var _a;
  if (provider !== "openai-compatible") {
    return (_a = KNOWN[provider]) != null ? _a : { topP: false, topK: false, minP: false };
  }
  const svc = detectCompatService(baseUrl, model);
  return COMPAT_SUPPORT[svc];
}
var EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
var reasoningEffortParam = (effort) => ({ reasoning_effort: effort });
var REASONING_OPENAI = {
  // gpt-5.x는 모델별로 지원 레벨이 갈린다(신형은 minimal 폐기·none/xhigh 추가). 초집합 노출 후 clamp.
  efforts: ["minimal", "low", "medium", "high", "xhigh"],
  canDisable: true,
  disablePayload: { reasoning_effort: "none" },
  // 신형(gpt-5.5+)의 표준 끄기 값
  effortPayload: reasoningEffortParam
};
var REASONING_COMPAT = {
  deepseek: {
    // V4(2026-04): 서버가 low/med→high, xhigh→max로 매핑하므로 실효 레벨은 high/max뿐.
    efforts: ["high", "max"],
    canDisable: true,
    // V4는 thinking:{type:"disabled"}로 끄기 지원 (구 R1 시절엔 불가였음)
    disablePayload: { thinking: { type: "disabled" } },
    effortPayload: reasoningEffortParam
  },
  openrouter: {
    // OpenRouter가 none/minimal/low/med/high/xhigh로 정규화해 각 백엔드에 전달.
    efforts: ["minimal", "low", "medium", "high", "xhigh"],
    canDisable: true,
    disablePayload: { reasoning: { enabled: false } },
    effortPayload: (effort) => ({ reasoning: { effort } })
  },
  zai: {
    // GLM-4.6/4.7 등 레벨 미지원 모델 기본값. GLM-5 계열은 getReasoningSupport에서 REASONING_ZAI_GLM5로 대체.
    efforts: [],
    canDisable: true,
    disablePayload: { thinking: { type: "disabled" } }
  },
  vllm: {
    efforts: [],
    canDisable: true,
    disablePayload: { chat_template_kwargs: { enable_thinking: false } }
  },
  ollama: {
    // OpenAI 호환 /v1 엔드포인트 기준. think:bool은 /v1에서 무효 — reasoning_effort 사용.
    // 지원 모델(gpt-oss 등)은 low/med/high, 미지원 모델은 서버가 자동 무시.
    efforts: ["low", "medium", "high"],
    canDisable: true,
    disablePayload: { reasoning_effort: "none" },
    effortPayload: reasoningEffortParam
  },
  // Kimi: 추론이 네이티브라 reasoning_effort를 보내면 400. 레벨/끄기 모두 전송하지 않음.
  kimi: { efforts: [], canDisable: false },
  lmstudio: { efforts: [], canDisable: false },
  // 미확인 서비스: 널리 통용되는 reasoning_effort 표준 3레벨만 허용.
  // 끄기 요청은 canDisable=false이므로 최저 레벨(low)로 대체된다 —
  // "minimal"/"none" 같은 값을 보내다 enum 검증 400을 받는 것을 방지.
  unknown: {
    efforts: ["low", "medium", "high"],
    canDisable: false,
    effortPayload: reasoningEffortParam
  },
  // NanoGPT: 어떤 백엔드로 라우팅되든 자체 게이트웨이가 reasoning_effort를 정규화해 받아들인다.
  nanogpt: {
    efforts: ["minimal", "low", "medium", "high", "xhigh"],
    canDisable: true,
    disablePayload: { reasoning_effort: "none" },
    effortPayload: reasoningEffortParam
  }
};
var REASONING_ZAI_GLM5 = {
  efforts: ["high", "max"],
  canDisable: true,
  disablePayload: { thinking: { type: "disabled" } },
  effortPayload: reasoningEffortParam
};
function getReasoningSupport(provider, baseUrl = "", model = "") {
  if (provider === "openai")
    return REASONING_OPENAI;
  if (provider === "openai-compatible") {
    const svc = detectCompatService(baseUrl, model);
    if (svc === "zai" && /glm-5/i.test(model))
      return REASONING_ZAI_GLM5;
    return REASONING_COMPAT[svc];
  }
  return { efforts: [], canDisable: false };
}
function clampEffort(effort, support) {
  if (!support.efforts.length)
    return void 0;
  const target = EFFORT_ORDER.indexOf(effort);
  if (target === -1)
    return void 0;
  if (support.efforts.includes(effort)) {
    return effort;
  }
  let best = support.efforts[0];
  let bestDist = Infinity;
  for (const e of support.efforts) {
    const dist = Math.abs(EFFORT_ORDER.indexOf(e) - target);
    if (dist < bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  return best;
}
function buildReasoningParams(support, opts) {
  if (opts.disabled) {
    if (support.canDisable && support.disablePayload)
      return support.disablePayload;
    if (support.efforts.length && support.effortPayload) {
      return support.effortPayload(support.efforts[0]);
    }
    return {};
  }
  if (opts.effort && support.effortPayload) {
    const clamped = clampEffort(opts.effort, support);
    if (clamped)
      return support.effortPayload(clamped);
  }
  return {};
}
function compatServiceLabel(svc) {
  const labels = {
    ollama: "Ollama",
    vllm: "vLLM / LocalAI",
    lmstudio: "LM Studio",
    deepseek: "DeepSeek",
    kimi: "Kimi (Moonshot)",
    zai: "z.ai",
    openrouter: "OpenRouter",
    nanogpt: "NanoGPT",
    unknown: "unknown"
  };
  return labels[svc];
}
var COMPAT_PRESET_BASE_URL = {
  deepseek: "https://api.deepseek.com",
  openrouter: "https://openrouter.ai/api/v1",
  zai: "https://api.z.ai/api/paas/v4",
  nanogpt: "https://nano-gpt.com/api/v1"
};

// src/providers/openai.ts
var OpenAIAdapter = class {
  // image/tts/stt는 NovelAI/ElevenLabs로 이관됨. 기존 OpenAI /images/generations 경로 제거.
  constructor(kind = "openai") {
    this.supports = { chat: true, text: true };
    this.kind = kind;
  }
  async chat(call) {
    var _a, _b, _c, _d, _e;
    const body = buildOpenAIChatBody(
      call,
      /*stream*/
      false
    );
    const url = resolveBaseUrl(call.profile) + "/chat/completions";
    (_a = call.log) == null ? void 0 : _a.call(call, { phase: "request", transport: "chat", url, body: summarizeOpenAIBody(body) });
    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: authHeaders(call.apiKey),
      body: JSON.stringify(body),
      throw: false
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      (_c = call.log) == null ? void 0 : _c.call(call, { phase: "error", transport: "chat", url, status: res.status, error: (_b = res.text) != null ? _b : "" });
      throw new Error(`OpenAI ${res.status}: ${(_d = res.text) != null ? _d : ""}`);
    }
    const normalized = normalizeOpenAIChat(res.json);
    const chatLogResp = {
      text: summarizeText(normalized.text),
      stopReason: normalized.stopReason,
      usage: normalized.usage,
      raw: res.json
    };
    if (normalized.reasoning) {
      chatLogResp.reasoning = summarizeText(normalized.reasoning);
    }
    (_e = call.log) == null ? void 0 : _e.call(call, {
      phase: "response",
      transport: "chat",
      url,
      status: res.status,
      response: chatLogResp
    });
    return normalized;
  }
  async *chatStream(call) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    const body = buildOpenAIChatBody(
      call,
      /*stream*/
      true
    );
    const url = resolveBaseUrl(call.profile) + "/chat/completions";
    (_a = call.log) == null ? void 0 : _a.call(call, { phase: "request", transport: "chatStream", url, body: summarizeOpenAIBody(body) });
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: authHeaders(call.apiKey),
        body: JSON.stringify(body),
        signal: call.signal
      });
    } catch (e) {
      if (call.signal.aborted || e instanceof Error && e.name === "AbortError") {
        throw e;
      }
      (_b = call.log) == null ? void 0 : _b.call(call, {
        phase: "error",
        transport: "chatStream",
        url,
        error: e instanceof Error ? e.message : String(e)
      });
      try {
        const fallback = await this.chat(call);
        if (fallback.text)
          yield { type: "text-delta", delta: fallback.text };
        yield { type: "done", response: fallback };
      } catch (fallbackErr) {
        yield { type: "error", error: { message: fallbackErr.message } };
      }
      return;
    }
    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : "";
      (_c = call.log) == null ? void 0 : _c.call(call, { phase: "error", transport: "chatStream", url, status: res.status, error: text });
      yield { type: "error", error: { message: `OpenAI ${res.status}: ${text}` } };
      return;
    }
    let fullText = "";
    let fullReasoning = "";
    const rawEvents = [];
    const toolAccumByIndex = {};
    let stopReason = "end";
    const usage = { inputTokens: 0, outputTokens: 0 };
    for await (const evt of parseSSE(res.body)) {
      if (!evt.data)
        continue;
      if (evt.data === "[DONE]")
        break;
      let data;
      try {
        data = JSON.parse(evt.data);
      } catch (e) {
        rawEvents.push({ parseError: true, data: evt.data });
        continue;
      }
      rawEvents.push(data);
      const choice = (_d = data.choices) == null ? void 0 : _d[0];
      if (!choice) {
        if (data.usage) {
          usage.inputTokens += (_e = data.usage.prompt_tokens) != null ? _e : 0;
          usage.outputTokens += (_f = data.usage.completion_tokens) != null ? _f : 0;
        }
        continue;
      }
      const delta = (_g = choice.delta) != null ? _g : {};
      const textDelta = extractOpenAIText(delta);
      if (textDelta) {
        fullText += textDelta;
        yield { type: "text-delta", delta: textDelta };
      }
      const reasoningDelta = extractReasoning(delta);
      if (reasoningDelta) {
        fullReasoning += reasoningDelta;
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = (_h = tc.index) != null ? _h : 0;
          let acc = toolAccumByIndex[idx];
          if (!acc) {
            acc = { id: (_i = tc.id) != null ? _i : "", name: (_k = (_j = tc.function) == null ? void 0 : _j.name) != null ? _k : "", rawArgs: "" };
            toolAccumByIndex[idx] = acc;
            if (acc.id && acc.name) {
              yield { type: "tool-call-start", toolCallId: acc.id, name: acc.name };
            }
          }
          if (tc.id && !acc.id)
            acc.id = tc.id;
          if (((_l = tc.function) == null ? void 0 : _l.name) && !acc.name)
            acc.name = tc.function.name;
          if ((_m = tc.function) == null ? void 0 : _m.arguments) {
            acc.rawArgs += tc.function.arguments;
            if (acc.id) {
              yield {
                type: "tool-call-args-delta",
                toolCallId: acc.id,
                delta: tc.function.arguments
              };
            }
          }
        }
      }
      if (choice.finish_reason) {
        stopReason = mapOpenAIFinishReason(choice.finish_reason);
      }
      if (data.usage) {
        usage.inputTokens += (_n = data.usage.prompt_tokens) != null ? _n : 0;
        usage.outputTokens += (_o = data.usage.completion_tokens) != null ? _o : 0;
      }
    }
    const toolCalls = Object.values(toolAccumByIndex).map((t) => {
      let input = {};
      try {
        input = JSON.parse(t.rawArgs || "{}");
      } catch (e) {
        input = {};
      }
      return { id: t.id, name: t.name, input };
    });
    for (const tc of toolCalls) {
      yield { type: "tool-call-end", toolCallId: tc.id, name: tc.name, input: tc.input };
    }
    const raw = {
      status: res.status,
      eventCount: rawEvents.length,
      events: rawEvents
    };
    const logResponse = { text: summarizeText(fullText), textLen: fullText.length, stopReason, usage, raw };
    if (fullReasoning) {
      logResponse.reasoning = summarizeText(fullReasoning);
    }
    (_p = call.log) == null ? void 0 : _p.call(call, {
      phase: "response",
      transport: "chatStream",
      url,
      status: res.status,
      response: logResponse
    });
    yield {
      type: "done",
      response: {
        text: fullText,
        ...fullReasoning ? { reasoning: fullReasoning } : {},
        toolCalls,
        stopReason,
        usage,
        raw
      }
    };
  }
  async text(call) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const { profile, apiKey, request } = call;
    const url = resolveBaseUrl(profile) + "/completions";
    const body = {
      model: profile.model,
      prompt: request.prompt,
      ...(_a = request.paramsOverride) != null ? _a : {}
    };
    (_b = call.log) == null ? void 0 : _b.call(call, { phase: "request", transport: "text", url, body: summarizeOpenAITextBody(body) });
    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
      throw: false
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      (_d = call.log) == null ? void 0 : _d.call(call, { phase: "error", transport: "text", url, status: res.status, error: (_c = res.text) != null ? _c : "" });
      throw new Error(`OpenAI text ${res.status}: ${(_e = res.text) != null ? _e : ""}`);
    }
    const text = extractOpenAIText((_g = (_f = res.json) == null ? void 0 : _f.choices) == null ? void 0 : _g[0]);
    (_h = call.log) == null ? void 0 : _h.call(call, { phase: "response", transport: "text", url, status: res.status, response: { text: summarizeText(text), raw: res.json } });
    return { text, raw: res.json };
  }
  async validate(profile, apiKey) {
    var _a;
    try {
      const url = resolveBaseUrl(profile) + "/models";
      const res = await (0, import_obsidian3.requestUrl)({
        url,
        method: "GET",
        headers: authHeaders(apiKey),
        throw: false
      });
      if (res.status >= 200 && res.status < 300)
        return { ok: true };
      return { ok: false, error: `${res.status} ${(_a = res.text) != null ? _a : ""}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};
function resolveBaseUrl(profile) {
  var _a;
  return ((_a = profile.baseUrl) != null ? _a : "https://api.openai.com/v1").replace(/\/+$/, "");
}
function authHeaders(apiKey) {
  const h = { "content-type": "application/json" };
  if (apiKey)
    h["Authorization"] = `Bearer ${apiKey}`;
  return h;
}
function buildOpenAIChatBody(call, stream) {
  var _a, _b, _c, _d;
  const { profile, request } = call;
  const chatProfile = profile;
  const p = { ...(_a = chatProfile.params) != null ? _a : {}, ...(_b = request.paramsOverride) != null ? _b : {} };
  const body = {
    model: profile.model,
    messages: translateForOpenAI(request.messages),
    stream
  };
  if (p.maxTokens !== void 0)
    body.max_tokens = p.maxTokens;
  if (p.temperature !== void 0)
    body.temperature = p.temperature;
  if (p.topP !== void 0)
    body.top_p = p.topP;
  if (p.topK !== void 0)
    body.top_k = p.topK;
  if (p.minP !== void 0)
    body.min_p = p.minP;
  if ((_c = p.stopSequences) == null ? void 0 : _c.length)
    body.stop = p.stopSequences;
  if (p.thinkingDisabled || p.reasoningEffort) {
    const support = getReasoningSupport(profile.provider, (_d = profile.baseUrl) != null ? _d : "", profile.model);
    Object.assign(
      body,
      buildReasoningParams(support, { disabled: p.thinkingDisabled, effort: p.reasoningEffort })
    );
  }
  const tools = translateToolsForOpenAI(request.tools);
  if (tools == null ? void 0 : tools.length)
    body.tools = tools;
  const tc = translateOpenAIToolChoice(request.toolChoice);
  if (tc)
    body.tool_choice = tc;
  if (stream)
    body.stream_options = { include_usage: true };
  return body;
}
function normalizeOpenAIChat(raw) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const ch = (_a = raw.choices) == null ? void 0 : _a[0];
  const msg = (_b = ch == null ? void 0 : ch.message) != null ? _b : {};
  const text = extractOpenAIText(msg);
  const reasoning = extractReasoning(msg);
  const toolCalls = (_d = (_c = msg.tool_calls) == null ? void 0 : _c.map((tc) => {
    let input = {};
    try {
      input = JSON.parse(tc.function.arguments || "{}");
    } catch (e) {
      input = {};
    }
    return { id: tc.id, name: tc.function.name, input };
  })) != null ? _d : [];
  let finalText = text;
  let finalReasoning = reasoning;
  if (!finalReasoning) {
    const thinkMatch = /<think>([\s\S]*?)<\/think>/.exec(text);
    if (thinkMatch) {
      finalReasoning = thinkMatch[1].trim();
      finalText = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
  } else {
    finalText = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }
  return {
    text: finalText,
    ...finalReasoning ? { reasoning: finalReasoning } : {},
    toolCalls,
    stopReason: mapOpenAIFinishReason((_e = ch == null ? void 0 : ch.finish_reason) != null ? _e : "stop"),
    usage: {
      inputTokens: (_g = (_f = raw.usage) == null ? void 0 : _f.prompt_tokens) != null ? _g : 0,
      outputTokens: (_i = (_h = raw.usage) == null ? void 0 : _h.completion_tokens) != null ? _i : 0
    },
    raw
  };
}
function mapOpenAIFinishReason(r) {
  if (r === "tool_calls" || r === "function_call")
    return "tool_use";
  if (r === "length")
    return "max_tokens";
  if (r === "stop")
    return "end";
  return "end";
}
function extractOpenAIText(obj) {
  if (!obj || typeof obj !== "object")
    return "";
  const rec = obj;
  for (const key of ["content", "text", "output_text"]) {
    const value = rec[key];
    if (typeof value === "string" && value)
      return value;
  }
  return "";
}
function extractReasoning(obj) {
  if (!obj || typeof obj !== "object")
    return "";
  const rec = obj;
  for (const key of ["reasoning_content", "reasoning"]) {
    const value = rec[key];
    if (typeof value === "string" && value)
      return value;
  }
  return "";
}
function summarizeOpenAIBody(body) {
  return {
    ...body,
    messages: Array.isArray(body.messages) ? body.messages.map((m) => summarizeMessage(m)) : body.messages
  };
}
function summarizeOpenAITextBody(body) {
  return {
    ...body,
    prompt: typeof body.prompt === "string" ? summarizeText(body.prompt) : body.prompt
  };
}
function summarizeMessage(message) {
  if (!message || typeof message !== "object")
    return message;
  const rec = message;
  return {
    ...rec,
    content: typeof rec.content === "string" ? summarizeText(rec.content) : rec.content
  };
}
function summarizeText(text) {
  const head = text.slice(0, 1200);
  const tail = text.length > 1200 ? text.slice(-1200) : "";
  return {
    length: text.length,
    head,
    tail,
    full: text
  };
}

// src/providers/google.ts
var import_obsidian4 = require("obsidian");
var GoogleAdapter = class {
  constructor() {
    this.kind = "google";
    this.supports = { chat: true };
  }
  async chat(call) {
    var _a;
    const body = buildGeminiBody(call);
    const url = resolveUrl(call, "generateContent");
    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      throw: false
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Gemini ${res.status}: ${(_a = res.text) != null ? _a : ""}`);
    }
    return normalizeGeminiResponse(res.json);
  }
  async *chatStream(call) {
    var _a, _b, _c, _d, _e, _f, _g;
    const body = buildGeminiBody(call);
    const url = resolveUrl(call, "streamGenerateContent") + "&alt=sse";
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: call.signal
      });
    } catch (e) {
      yield { type: "error", error: { message: e.message } };
      return;
    }
    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : "";
      yield { type: "error", error: { message: `Gemini ${res.status}: ${text}` } };
      return;
    }
    let fullText = "";
    let fullReasoning = "";
    const toolCalls = [];
    let stopReason = "end";
    const usage = { inputTokens: 0, outputTokens: 0 };
    for await (const evt of parseSSE(res.body)) {
      if (!evt.data)
        continue;
      let data;
      try {
        data = JSON.parse(evt.data);
      } catch (e) {
        continue;
      }
      const cand = (_a = data.candidates) == null ? void 0 : _a[0];
      const parts = (_c = (_b = cand == null ? void 0 : cand.content) == null ? void 0 : _b.parts) != null ? _c : [];
      for (const p of parts) {
        if (typeof p.text === "string") {
          if (p.thought) {
            fullReasoning += p.text;
          } else {
            fullText += p.text;
            yield { type: "text-delta", delta: p.text };
          }
        }
        if (p.functionCall) {
          const id = genId();
          yield { type: "tool-call-start", toolCallId: id, name: p.functionCall.name };
          yield {
            type: "tool-call-end",
            toolCallId: id,
            name: p.functionCall.name,
            input: (_d = p.functionCall.args) != null ? _d : {}
          };
          toolCalls.push({ id, name: p.functionCall.name, input: (_e = p.functionCall.args) != null ? _e : {} });
        }
      }
      if (cand == null ? void 0 : cand.finishReason)
        stopReason = mapGeminiFinish(cand.finishReason);
      if (data.usageMetadata) {
        usage.inputTokens = (_f = data.usageMetadata.promptTokenCount) != null ? _f : usage.inputTokens;
        usage.outputTokens = (_g = data.usageMetadata.candidatesTokenCount) != null ? _g : usage.outputTokens;
      }
    }
    if (toolCalls.length && stopReason === "end")
      stopReason = "tool_use";
    yield {
      type: "done",
      response: {
        text: fullText,
        ...fullReasoning ? { reasoning: fullReasoning } : {},
        toolCalls,
        stopReason,
        usage,
        raw: null
      }
    };
  }
  async validate(profile, apiKey) {
    var _a, _b;
    try {
      const url = `${(_a = profile.baseUrl) != null ? _a : "https://generativelanguage.googleapis.com/v1beta"}/models?key=${encodeURIComponent(apiKey)}`;
      const res = await (0, import_obsidian4.requestUrl)({ url, method: "GET", throw: false });
      if (res.status >= 200 && res.status < 300)
        return { ok: true };
      return { ok: false, error: `${res.status} ${(_b = res.text) != null ? _b : ""}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};
function resolveUrl(call, method) {
  var _a;
  const base = ((_a = call.profile.baseUrl) != null ? _a : "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  return `${base}/models/${call.profile.model}:${method}?key=${encodeURIComponent(call.apiKey)}`;
}
function buildGeminiBody(call) {
  var _a, _b, _c;
  const chatProfile = call.profile;
  const p = { ...(_a = chatProfile.params) != null ? _a : {}, ...(_b = call.request.paramsOverride) != null ? _b : {} };
  const translated = translateForGemini(call.request.messages);
  const body = { contents: translated.contents };
  if (translated.systemInstruction)
    body.systemInstruction = translated.systemInstruction;
  const genConfig = {};
  if (p.temperature !== void 0)
    genConfig.temperature = p.temperature;
  if (p.topP !== void 0)
    genConfig.topP = p.topP;
  if (p.topK !== void 0)
    genConfig.topK = p.topK;
  if (p.maxTokens !== void 0)
    genConfig.maxOutputTokens = p.maxTokens;
  if ((_c = p.stopSequences) == null ? void 0 : _c.length)
    genConfig.stopSequences = p.stopSequences;
  if (p.thinkingDisabled)
    genConfig.thinkingConfig = { thinkingBudget: 0 };
  if (Object.keys(genConfig).length)
    body.generationConfig = genConfig;
  const tools = translateToolsForGemini(call.request.tools);
  if (tools)
    body.tools = tools;
  if (call.request.toolChoice) {
    if (call.request.toolChoice === "required") {
      body.toolConfig = { functionCallingConfig: { mode: "ANY" } };
    } else if (call.request.toolChoice === "none") {
      body.toolConfig = { functionCallingConfig: { mode: "NONE" } };
    } else if (call.request.toolChoice === "auto") {
      body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    } else if (typeof call.request.toolChoice === "object") {
      body.toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: [call.request.toolChoice.name]
        }
      };
    }
  }
  return body;
}
function normalizeGeminiResponse(raw) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const cand = (_a = raw.candidates) == null ? void 0 : _a[0];
  const parts = (_c = (_b = cand == null ? void 0 : cand.content) == null ? void 0 : _b.parts) != null ? _c : [];
  let text = "";
  let reasoning = "";
  const toolCalls = [];
  for (const p of parts) {
    if (typeof p.text === "string") {
      if (p.thought)
        reasoning += p.text;
      else
        text += p.text;
    }
    if (p.functionCall) {
      toolCalls.push({ id: genId(), name: p.functionCall.name, input: (_d = p.functionCall.args) != null ? _d : {} });
    }
  }
  let stop = mapGeminiFinish((_e = cand == null ? void 0 : cand.finishReason) != null ? _e : "STOP");
  if (toolCalls.length && stop === "end")
    stop = "tool_use";
  return {
    text,
    ...reasoning ? { reasoning } : {},
    toolCalls,
    stopReason: stop,
    usage: {
      inputTokens: (_g = (_f = raw.usageMetadata) == null ? void 0 : _f.promptTokenCount) != null ? _g : 0,
      outputTokens: (_i = (_h = raw.usageMetadata) == null ? void 0 : _h.candidatesTokenCount) != null ? _i : 0
    },
    raw
  };
}
function mapGeminiFinish(r) {
  if (r === "MAX_TOKENS")
    return "max_tokens";
  if (r === "STOP")
    return "end";
  return "end";
}
function genId() {
  return "tool_" + Math.random().toString(36).slice(2, 11);
}

// src/providers/novelai.ts
var import_obsidian5 = require("obsidian");
var NAI_TEXT_BASE = "https://text.novelai.net/oa/v1";
var NAI_IMAGE_BASE = "https://image.novelai.net";
var NovelAIAdapter = class {
  constructor() {
    this.kind = "novelai";
    this.supports = { text: true, image: true };
  }
  async text(call) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const { profile, apiKey, request } = call;
    const textProfile = profile;
    const p = (_a = textProfile.params) != null ? _a : {};
    const url = (((_b = profile.baseUrl) == null ? void 0 : _b.replace(/\/+$/, "")) || NAI_TEXT_BASE) + "/completions";
    const body = {
      model: profile.model,
      prompt: request.prompt,
      ...p.maxTokens !== void 0 ? { max_tokens: p.maxTokens } : {},
      temperature: (_c = p.temperature) != null ? _c : 1,
      ...p.topP !== void 0 ? { top_p: p.topP } : {},
      ...p.topK !== void 0 ? { top_k: p.topK } : {},
      ...p.minP !== void 0 ? { min_p: p.minP } : {},
      ...((_d = p.stopSequences) == null ? void 0 : _d.length) ? { stop: p.stopSequences } : {},
      ...(_e = request.paramsOverride) != null ? _e : {}
    };
    (_f = call.log) == null ? void 0 : _f.call(call, { phase: "request", transport: "text", url, body: summarizeNovelAITextBody(body) });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: call.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      (_g = call.log) == null ? void 0 : _g.call(call, { phase: "error", transport: "text", url, status: res.status, error: errText });
      throw new Error(`NovelAI text ${res.status}: ${errText}`);
    }
    const json = await res.json();
    const text = (_i = extractTextCompletionDelta((_h = json == null ? void 0 : json.choices) == null ? void 0 : _h[0])) != null ? _i : "";
    (_j = call.log) == null ? void 0 : _j.call(call, {
      phase: "response",
      transport: "text",
      url,
      status: res.status,
      response: { text: summarizeText2(text), textLen: text.length, raw: json }
    });
    return { text, raw: json };
  }
  async image(call) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E;
    const { profile, apiKey, request } = call;
    const imageProfile = profile;
    const p = (_a = imageProfile.params) != null ? _a : {};
    const url = (((_b = imageProfile.baseUrl) == null ? void 0 : _b.replace(/\/+$/, "")) || NAI_IMAGE_BASE) + "/ai/generate-image";
    const prompt2 = request.prompt || p.prompt || "";
    const uc = (_d = (_c = request.negativePrompt) != null ? _c : p.negativePrompt) != null ? _d : "";
    const useOrder = (_e = p.useOrder) != null ? _e : true;
    const useCoords = false;
    const parameters = {
      // 해상도
      width: (_f = p.width) != null ? _f : 832,
      height: (_g = p.height) != null ? _g : 1216,
      // 샘플링
      scale: (_h = p.scale) != null ? _h : 5,
      sampler: (_i = p.sampler) != null ? _i : "k_euler_ancestral",
      steps: (_j = p.steps) != null ? _j : 28,
      n_samples: (_l = (_k = request.n) != null ? _k : p.nSamples) != null ? _l : 1,
      seed: (_m = p.seed) != null ? _m : Math.floor(Math.random() * 2 ** 32),
      noise_schedule: (_n = p.noiseSchedule) != null ? _n : "karras",
      // CFG
      cfg_rescale: (_o = p.cfgRescale) != null ? _o : 0,
      uncond_scale: (_p = p.uncondScale) != null ? _p : 0,
      skip_cfg_above_sigma: (_q = p.skipCfgAboveSigma) != null ? _q : null,
      skip_cfg_below_sigma: (_r = p.skipCfgBelowSigma) != null ? _r : 0,
      // Dynamic Thresholding
      dynamic_thresholding: (_s = p.dynamicThresholding) != null ? _s : false,
      dynamic_thresholding_percentile: (_t = p.dynamicThresholdingPercentile) != null ? _t : 0.999,
      dynamic_thresholding_mimic_scale: (_u = p.dynamicThresholdingMimicScale) != null ? _u : 10,
      // ControlNet / 고급
      controlnet_strength: (_v = p.controlnetStrength) != null ? _v : 1,
      controlnet_model: null,
      prefer_brownian: (_w = p.preferBrownian) != null ? _w : true,
      cfg_sched_eligibility: (_x = p.cfgSchedEligibility) != null ? _x : "enable_for_post_summer_samplers",
      deliberate_euler_ancestral_bug: (_y = p.deliberateEulerAncestralBug) != null ? _y : false,
      explike_fine_detail: (_z = p.explikeFineDetail) != null ? _z : false,
      minimize_sigma_inf: (_A = p.minimizeSigmaInf) != null ? _A : false,
      uncond_per_vibe: (_B = p.uncondPerVibe) != null ? _B : true,
      wonky_vibe_correlation: (_C = p.wonkyVibeCorrelation) != null ? _C : true,
      // 하드코딩 defaults
      legacy_v3_extend: false,
      lora_unet_weights: null,
      lora_clip_weights: null,
      reference_information_extracted_multiple: [],
      reference_strength_multiple: [],
      // Prompts
      negative_prompt: uc,
      v4_prompt: {
        caption: { base_caption: prompt2, char_captions: [] },
        use_coords: useCoords,
        use_order: useOrder,
        legacy_uc: false
      },
      v4_negative_prompt: {
        caption: { base_caption: uc, char_captions: [] },
        use_coords: false,
        use_order: false,
        legacy_uc: false
      }
    };
    Object.assign(parameters, (_D = request.paramsOverride) != null ? _D : {});
    const body = {
      input: prompt2,
      model: profile.model,
      action: "generate",
      parameters
    };
    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      throw: false
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`NovelAI image ${res.status}: ${(_E = res.text) != null ? _E : ""}`);
    }
    const zipBytes = new Uint8Array(res.arrayBuffer);
    const pngs = await extractPngsFromZip(zipBytes);
    const images = pngs.map((bytes) => ({
      kind: "base64",
      mediaType: "image/png",
      data: uint8ToBase64(bytes)
    }));
    return { images, raw: null };
  }
  async validate(profile, apiKey) {
    var _a, _b;
    try {
      const url = (((_a = profile.baseUrl) == null ? void 0 : _a.replace(/\/+$/, "")) || NAI_TEXT_BASE) + "/models";
      const res = await (0, import_obsidian5.requestUrl)({
        url,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        throw: false
      });
      if (res.status >= 200 && res.status < 300)
        return { ok: true };
      return { ok: false, error: `${res.status} ${(_b = res.text) != null ? _b : ""}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};
async function extractPngsFromZip(buf) {
  const out = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0;
  while (off + 30 <= buf.length) {
    const sig = dv.getUint32(off, true);
    if (sig !== 67324752)
      break;
    const bitFlag = dv.getUint16(off + 6, true);
    const method = dv.getUint16(off + 8, true);
    let compSize = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const dataStart = off + 30 + nameLen + extraLen;
    if (compSize === 0 && (bitFlag & 8) !== 0) {
      let scan = dataStart;
      while (scan + 4 <= buf.length) {
        const s = dv.getUint32(scan, true);
        if (s === 134695760 || s === 67324752 || s === 33639248)
          break;
        scan++;
      }
      compSize = scan - dataStart;
    }
    const chunk = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) {
      data = chunk;
    } else if (method === 8) {
      data = await inflateRaw(chunk);
    } else {
      off = dataStart + compSize;
      continue;
    }
    if (isPng(data))
      out.push(data);
    off = dataStart + compSize;
    if ((bitFlag & 8) !== 0) {
      if (dv.getUint32(off, true) === 134695760)
        off += 16;
      else
        off += 12;
    }
  }
  return out;
}
function isPng(b) {
  return b.length >= 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10;
}
function extractTextCompletionDelta(choice) {
  if (!choice || typeof choice !== "object")
    return "";
  const rec = choice;
  for (const key of ["text", "content", "output_text"]) {
    const value = rec[key];
    if (typeof value === "string")
      return value;
  }
  const message = rec.message;
  if (message && typeof message === "object") {
    const content = message.content;
    if (typeof content === "string")
      return content;
  }
  const delta = rec.delta;
  if (delta && typeof delta === "object") {
    const content = delta.content;
    if (typeof content === "string")
      return content;
  }
  return "";
}
function summarizeNovelAITextBody(body) {
  return {
    ...body,
    prompt: typeof body.prompt === "string" ? summarizeText2(body.prompt) : body.prompt
  };
}
function summarizeText2(text) {
  return {
    length: text.length,
    head: text.slice(0, 1200),
    tail: text.length > 1200 ? text.slice(-1200) : "",
    full: text
  };
}
async function inflateRaw(chunk) {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(chunk);
  writer.close();
  const reader = ds.readable.getReader();
  const parts = [];
  let total = 0;
  for (; ; ) {
    const r = await reader.read();
    if (r.done)
      break;
    parts.push(r.value);
    total += r.value.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function uint8ToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++)
    bin += String.fromCharCode(bytes[i]);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}

// src/providers/elevenlabs.ts
var import_obsidian6 = require("obsidian");
var EL_BASE = "https://api.elevenlabs.io/v1";
var ElevenLabsAdapter = class {
  constructor() {
    this.kind = "elevenlabs";
    this.supports = { tts: true };
  }
  async tts(call) {
    var _a, _b, _c, _d, _e;
    const { profile, apiKey, request } = call;
    const voiceProfile = profile;
    const p = (_a = voiceProfile.params) != null ? _a : {};
    const voiceId = (_b = request.voice) != null ? _b : p.voice;
    if (!voiceId)
      throw new Error("ElevenLabs TTS: voice_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4");
    const base = ((_c = profile.baseUrl) == null ? void 0 : _c.replace(/\/+$/, "")) || EL_BASE;
    const outputFormat = (_d = p.format) != null ? _d : mapShortFormat(request.format);
    const url = `${base}/text-to-speech/${encodeURIComponent(voiceId)}` + (outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : "");
    const voiceSettings = {};
    if (p.stability !== void 0)
      voiceSettings.stability = p.stability;
    if (p.similarityBoost !== void 0)
      voiceSettings.similarity_boost = p.similarityBoost;
    if (p.style !== void 0)
      voiceSettings.style = p.style;
    if (p.useSpeakerBoost !== void 0)
      voiceSettings.use_speaker_boost = p.useSpeakerBoost;
    const body = {
      text: request.text,
      model_id: profile.model || "eleven_multilingual_v2"
    };
    if (Object.keys(voiceSettings).length > 0)
      body.voice_settings = voiceSettings;
    if (p.language)
      body.language_code = p.language;
    const res = await requestUrlAbortable({
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": apiKey,
        accept: mediaTypeFromFormat(outputFormat)
      },
      body: JSON.stringify(body),
      throw: false
    }, call.signal);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`ElevenLabs tts ${res.status}: ${(_e = res.text) != null ? _e : ""}`);
    }
    const data = arrayBufferToBase64(res.arrayBuffer);
    return {
      audio: {
        kind: "base64",
        mediaType: mediaTypeFromFormat(outputFormat),
        data
      },
      raw: null
    };
  }
  async stt(_call) {
    throw new Error("ElevenLabs STT\uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4 (TTS \uC804\uC6A9)");
  }
  async validate(profile, apiKey) {
    var _a, _b;
    try {
      const base = ((_a = profile.baseUrl) == null ? void 0 : _a.replace(/\/+$/, "")) || EL_BASE;
      const res = await (0, import_obsidian6.requestUrl)({
        url: `${base}/voices`,
        method: "GET",
        headers: { "xi-api-key": apiKey },
        throw: false
      });
      if (res.status >= 200 && res.status < 300)
        return { ok: true };
      return { ok: false, error: `${res.status} ${(_b = res.text) != null ? _b : ""}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};
function mapShortFormat(f) {
  if (f === "wav")
    return "pcm_22050";
  if (f === "opus")
    return "opus_48000_192";
  return "mp3_44100_128";
}
function mediaTypeFromFormat(f) {
  if (f.startsWith("mp3"))
    return "audio/mpeg";
  if (f.startsWith("pcm"))
    return "audio/wav";
  if (f.startsWith("opus") || f.startsWith("ulaw"))
    return "audio/ogg";
  return "application/octet-stream";
}
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++)
    bin += String.fromCharCode(bytes[i]);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}

// src/providers/index.ts
var ProviderRegistry = class {
  constructor() {
    this.adapters = /* @__PURE__ */ new Map();
    this.adapters.set("anthropic", new AnthropicAdapter());
    this.adapters.set("openai", new OpenAIAdapter("openai"));
    this.adapters.set("google", new GoogleAdapter());
    this.adapters.set("openai-compatible", new OpenAIAdapter("openai-compatible"));
    this.adapters.set("novelai", new NovelAIAdapter());
    this.adapters.set("elevenlabs", new ElevenLabsAdapter());
  }
  get(kind) {
    return this.adapters.get(kind);
  }
  forProfile(profile) {
    const ad = this.get(profile.provider);
    if (!ad) {
      throw new Error(`\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD504\uB85C\uBC14\uC774\uB354: ${profile.provider}`);
    }
    return ad;
  }
};

// src/types/profile.ts
var GATEABLE_PARAM_KEYS = ["topK", "topP", "minP"];
function toPublicProfile(p) {
  const copy = { ...p };
  delete copy.apiKeyRef;
  return copy;
}

// src/util/allowed-params.ts
function shouldDrop(allowed, key) {
  if (!allowed)
    return false;
  if (GATEABLE_PARAM_KEYS.indexOf(key) === -1)
    return false;
  return !allowed[key];
}
function stripDisallowed(obj, allowed) {
  if (!obj)
    return obj;
  let mutated = false;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (shouldDrop(allowed, k)) {
      mutated = true;
      continue;
    }
    out[k] = v;
  }
  return mutated ? out : obj;
}
function gateProfile(profile) {
  if (profile.kind !== "chat" && profile.kind !== "text")
    return profile;
  const allowed = profile.allowedParams;
  if (!allowed)
    return profile;
  const gatedParams = stripDisallowed(profile.params, allowed);
  if (gatedParams === profile.params)
    return profile;
  return { ...profile, params: gatedParams };
}
function gateParamsOverride(override, profile) {
  if (!override)
    return override;
  if (profile.kind !== "chat" && profile.kind !== "text")
    return override;
  const allowed = profile.allowedParams;
  return stripDisallowed(override, allowed);
}

// src/tokens/counter.ts
var CHARS_PER_TOKEN = {
  asciiWord: 4,
  // 영문/숫자 단어 문자. 가장 압축률 높음.
  cjk: 1.5,
  // 한글/한자/일본어. BPE가 문자당 1~2 토큰 사이로 쪼갬.
  whitespace: 8,
  // 공백은 인접 토큰에 흡수되는 경우 많음.
  punct: 2,
  // 구두점은 자주 단독 토큰.
  other: 2.5
  // 기타 유니코드 (악센트, 라틴 확장 등).
};
var TOKENS_PER_EMOJI = 2.5;
var PROVIDER_COEFFICIENT = {
  openai: 1,
  anthropic: 1.05,
  google: 1,
  "openai-compatible": 1.05,
  // 로컬 Llama/Qwen 기본. 모델명 매칭으로 세분화.
  novelai: 1.05,
  // NAI text 토크나이저는 경험적으로 tiktoken과 비슷한 범위.
  elevenlabs: 1
  // TTS 전용이라 실사용은 안 됨.
};
var MODEL_COEFFICIENT_HINTS = [
  { match: /llama-?3/i, coefficient: 1.05 },
  { match: /llama-?2/i, coefficient: 1.1 },
  { match: /qwen/i, coefficient: 1.05 },
  { match: /mistral|mixtral/i, coefficient: 1.05 },
  { match: /phi-?[34]/i, coefficient: 1 },
  { match: /gemma/i, coefficient: 1 }
];
var PER_MESSAGE_OVERHEAD = 4;
var PER_TOOL_OVERHEAD = 10;
var PER_IMAGE_BLOCK_TOKENS = 85;
function categorize(codePoint) {
  if (codePoint < 128) {
    if (codePoint === 32 || codePoint === 9 || codePoint === 10 || codePoint === 13) {
      return "whitespace";
    }
    if (codePoint >= 48 && codePoint <= 57 || codePoint >= 65 && codePoint <= 90 || codePoint >= 97 && codePoint <= 122 || codePoint === 95) {
      return "asciiWord";
    }
    return "punct";
  }
  if (codePoint >= 12288 && codePoint <= 12351 || // CJK Symbols
  codePoint >= 12352 && codePoint <= 12543 || // Hiragana/Katakana
  codePoint >= 13312 && codePoint <= 19903 || // CJK Ext A
  codePoint >= 19968 && codePoint <= 40959 || // CJK Unified
  codePoint >= 44032 && codePoint <= 55215 || // Hangul Syllables
  codePoint >= 4352 && codePoint <= 4607 || // Hangul Jamo
  codePoint >= 65280 && codePoint <= 65519) {
    return "cjk";
  }
  if (codePoint >= 127744 && codePoint <= 129535 || codePoint >= 9728 && codePoint <= 10175 || codePoint >= 129648 && codePoint <= 129791) {
    return "emoji";
  }
  return "other";
}
function countStringBaseline(text) {
  if (!text)
    return 0;
  const counts = { asciiWord: 0, cjk: 0, whitespace: 0, punct: 0, other: 0, emoji: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === void 0)
      continue;
    counts[categorize(cp)]++;
  }
  const t = counts.asciiWord / CHARS_PER_TOKEN.asciiWord + counts.cjk / CHARS_PER_TOKEN.cjk + counts.whitespace / CHARS_PER_TOKEN.whitespace + counts.punct / CHARS_PER_TOKEN.punct + counts.other / CHARS_PER_TOKEN.other + counts.emoji * TOKENS_PER_EMOJI;
  return Math.ceil(t);
}
function resolveCoefficient(provider, model) {
  const base = provider ? PROVIDER_COEFFICIENT[provider] : 1;
  if (provider === "openai-compatible" && model) {
    for (const hint of MODEL_COEFFICIENT_HINTS) {
      if (hint.match.test(model))
        return hint.coefficient;
    }
  }
  return base;
}
function countContentBlock(block) {
  if (block.type === "text")
    return countStringBaseline(block.text);
  if (block.type === "image")
    return PER_IMAGE_BLOCK_TOKENS;
  return 0;
}
function countMessageContent(content) {
  if (typeof content === "string")
    return countStringBaseline(content);
  let total = 0;
  for (const block of content)
    total += countContentBlock(block);
  return total;
}
function countMessage(msg) {
  var _a;
  let total = PER_MESSAGE_OVERHEAD;
  total += countMessageContent(msg.content);
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      total += countStringBaseline(tc.name);
      total += countStringBaseline(JSON.stringify((_a = tc.input) != null ? _a : {}));
      total += 4;
    }
  }
  if (msg.toolCallId)
    total += countStringBaseline(msg.toolCallId);
  return total;
}
function countTool(tool) {
  let total = PER_TOOL_OVERHEAD;
  total += countStringBaseline(tool.name);
  total += countStringBaseline(tool.description);
  total += countStringBaseline(JSON.stringify(tool.inputSchema));
  return total;
}
function countTokens(input, opts) {
  const coef = resolveCoefficient(opts == null ? void 0 : opts.provider, opts == null ? void 0 : opts.model);
  let raw = 0;
  if (typeof input === "string") {
    raw = countStringBaseline(input);
  } else if (Array.isArray(input)) {
    for (const msg of input)
      raw += countMessage(msg);
  } else {
    if (input.system)
      raw += countStringBaseline(input.system) + PER_MESSAGE_OVERHEAD;
    if (input.messages)
      for (const msg of input.messages)
        raw += countMessage(msg);
    if (input.tools)
      for (const tool of input.tools)
        raw += countTool(tool);
  }
  return Math.ceil(raw * coef);
}

// src/services/generation-service.ts
var GGAICancelledError = class extends Error {
  constructor(message = "\uC694\uCCAD\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4") {
    super(message);
    this.code = "cancelled";
    this.name = "GGAICancelledError";
  }
};
function normalizeError(e, signal) {
  return signal.aborted ? new GGAICancelledError() : e;
}
var GenerationService = class {
  constructor(profiles, secrets, providers, settings, requestLogs, errorLogs) {
    this.profiles = profiles;
    this.secrets = secrets;
    this.providers = providers;
    this.settings = settings;
    this.requestLogs = requestLogs;
    this.errorLogs = errorLogs;
    this.active = /* @__PURE__ */ new Map();
    this.nextId = 1;
    this.logRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.handlers = /* @__PURE__ */ new Map();
    // apiKeyRef별 직렬화 큐의 꼬리 Promise. 같은 키의 요청을 FIFO로 한 개씩 실행.
    this.queueTails = /* @__PURE__ */ new Map();
  }
  cancelAll() {
    for (const { ctrl } of this.active.values())
      ctrl.abort();
    this.active.clear();
    this.emit("active-changed");
  }
  /** 단일 활성 요청만 취소. id가 없으면 무시. */
  cancel(id) {
    const entry = this.active.get(id);
    if (!entry)
      return;
    entry.ctrl.abort();
    if (this.active.delete(id))
      this.emit("active-changed");
  }
  getActive() {
    return Array.from(this.active, ([id, v]) => ({ id, model: v.model }));
  }
  on(event, handler) {
    if (!this.handlers.has(event))
      this.handlers.set(event, /* @__PURE__ */ new Set());
    this.handlers.get(event).add(handler);
    return () => {
      var _a;
      return (_a = this.handlers.get(event)) == null ? void 0 : _a.delete(handler);
    };
  }
  emit(event) {
    const set = this.handlers.get(event);
    if (!set)
      return;
    for (const h of set) {
      try {
        h();
      } catch (e) {
        console.error("[GGAI] handler error", e);
      }
    }
  }
  // ── chat ──
  async chat(req) {
    const { profile, apiKey } = this.resolve(req.profileId, "chat");
    const chatProfile = profile;
    if (chatProfile.streamingEnabled) {
      return await collectStream(this.chatStream(req));
    }
    const ad = this.providers.forProfile(profile);
    if (!ad.chat)
      throw new Error(`${profile.provider} \uC5B4\uB311\uD130\uB294 chat\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    const { call, ctrl, finalize } = this.wrap(profile, apiKey, req, req.signal);
    try {
      return await this.runWithGate(profile.apiKeyRef, ctrl, finalize, () => ad.chat(call));
    } catch (e) {
      throw normalizeError(e, call.signal);
    }
  }
  async *chatStream(req) {
    const { profile, apiKey } = this.resolve(req.profileId, "chat");
    const chatProfile = profile;
    if (!chatProfile.streamingEnabled) {
      try {
        const res = await this.chat(req);
        if (res.text)
          yield { type: "text-delta", delta: res.text };
        yield { type: "done", response: res };
      } catch (e) {
        yield {
          type: "error",
          error: {
            message: e instanceof Error ? e.message : String(e),
            code: e instanceof GGAICancelledError ? e.code : void 0
          }
        };
      }
      return;
    }
    const ad = this.providers.forProfile(profile);
    if (!ad.chatStream)
      throw new Error(`${profile.provider} \uC5B4\uB311\uD130\uB294 chatStream\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    const { call, ctrl, finalize } = this.wrap(profile, apiKey, req, req.signal);
    try {
      const release = await this.acquireQueue(profile.apiKeyRef);
      const timer = setTimeout(() => ctrl.abort(), this.settings.requestTimeoutMs);
      try {
        for await (const ev of ad.chatStream(call))
          yield ev;
      } catch (e) {
        throw normalizeError(e, call.signal);
      } finally {
        clearTimeout(timer);
        release();
      }
    } finally {
      finalize();
    }
  }
  // ── text / image / tts / stt ──
  async text(req) {
    const { profile, apiKey } = this.resolve(req.profileId, "text");
    const ad = this.providers.forProfile(profile);
    if (!ad.text)
      throw new Error(`${profile.provider} \uC5B4\uB311\uD130\uB294 text\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    const { call, ctrl, finalize } = this.wrap(profile, apiKey, req, req.signal);
    try {
      return await this.runWithGate(profile.apiKeyRef, ctrl, finalize, () => ad.text(call));
    } catch (e) {
      throw normalizeError(e, call.signal);
    }
  }
  async image(req) {
    const { profile, apiKey } = this.resolve(req.profileId, "image");
    const ad = this.providers.forProfile(profile);
    if (!ad.image)
      throw new Error(`${profile.provider} \uC5B4\uB311\uD130\uB294 image\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    const { call, ctrl, finalize } = this.wrap(profile, apiKey, req, req.signal);
    try {
      return await this.runWithGate(profile.apiKeyRef, ctrl, finalize, () => ad.image(call));
    } catch (e) {
      throw normalizeError(e, call.signal);
    }
  }
  async tts(req) {
    const { profile, apiKey } = this.resolve(req.profileId);
    const ad = this.providers.forProfile(profile);
    if (!ad.tts)
      throw new Error(`${profile.provider} \uC5B4\uB311\uD130\uB294 tts\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    const { call, ctrl, finalize } = this.wrap(profile, apiKey, req, req.signal);
    try {
      return await this.runWithGate(profile.apiKeyRef, ctrl, finalize, () => ad.tts(call));
    } catch (e) {
      throw normalizeError(e, call.signal);
    }
  }
  async stt(req) {
    const { profile, apiKey } = this.resolve(req.profileId);
    const ad = this.providers.forProfile(profile);
    if (!ad.stt)
      throw new Error(`${profile.provider} \uC5B4\uB311\uD130\uB294 stt\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4`);
    const { call, ctrl, finalize } = this.wrap(profile, apiKey, req, req.signal);
    try {
      return await this.runWithGate(profile.apiKeyRef, ctrl, finalize, () => ad.stt(call));
    } catch (e) {
      throw normalizeError(e, call.signal);
    }
  }
  // ── 유틸 ──
  async validate(profileId) {
    const { profile, apiKey } = this.resolve(profileId);
    const ad = this.providers.forProfile(profile);
    const ctrl = new AbortController();
    return this.runWithGate(profile.apiKeyRef, ctrl, () => {
    }, () => ad.validate(profile, apiKey));
  }
  resolve(profileId, defaultKind) {
    var _a;
    const profile = profileId ? this.profiles.get(profileId) : defaultKind ? this.profiles.getDefault(defaultKind) : null;
    if (!profile) {
      throw new Error(
        profileId ? `\uD504\uB85C\uD544\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${profileId}` : `\uAE30\uBCF8 ${defaultKind != null ? defaultKind : ""} \uD504\uB85C\uD544\uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4`
      );
    }
    const vaultKey = this.secrets.get(profile.apiKeyRef);
    const embedded = profile.apiKey;
    const apiKey = (_a = vaultKey != null ? vaultKey : embedded) != null ? _a : "";
    return { profile, apiKey };
  }
  wrap(profile, apiKey, request, externalSignal) {
    const gatedProfile = gateProfile(profile);
    const gatedOverride = gateParamsOverride(request.paramsOverride, profile);
    const gatedRequest = gatedOverride === request.paramsOverride ? request : { ...request, paramsOverride: gatedOverride };
    assertInputWithinContext(profile, request);
    const ctrl = new AbortController();
    const id = this.nextId++;
    this.active.set(id, { ctrl, model: profile.model });
    this.emit("active-changed");
    const signal = mergeSignals(ctrl.signal, externalSignal);
    const finalize = () => {
      if (this.active.delete(id))
        this.emit("active-changed");
    };
    const call = {
      profile: gatedProfile,
      apiKey,
      request: gatedRequest,
      signal,
      log: (event) => {
        var _a;
        this.requestLogs.add({
          ...event,
          callId: `${this.logRunId}:${id}`,
          profileId: profile.id,
          profileName: profile.name,
          provider: profile.provider,
          model: profile.model
        });
        if (event.phase === "error" && this.errorLogs) {
          this.errorLogs.add({
            profileId: profile.id,
            profileName: profile.name,
            provider: profile.provider,
            model: profile.model,
            transport: event.transport,
            status: event.status,
            url: event.url,
            message: (_a = event.error) != null ? _a : "(\uC5D0\uB7EC \uBA54\uC2DC\uC9C0 \uC5C6\uC74C)"
          });
        }
      }
    };
    if (this.settings.logRequests) {
      console.log("[GGAI] request", profile.kind, profile.name, profile.model);
    }
    return { call, ctrl, finalize };
  }
  // ── 직렬화 큐 ──
  /**
   * 해당 apiKeyRef의 큐 활성화 여부.
   * 명시적 설정(serialQueueRefs)이 있으면 그 값을 따르고, 미설정 시
   * 이 키를 NovelAI 프로필이 사용 중이면 기본 활성화로 간주한다.
   * (NovelAI는 키 단위 동시 요청 429가 잦아 기본 직렬화 대상)
   */
  isQueueEnabled(ref) {
    var _a;
    const explicit = (_a = this.settings.serialQueueRefs) == null ? void 0 : _a[ref];
    if (explicit !== void 0)
      return explicit;
    return this.profiles.list().some(
      (p) => p.apiKeyRef === ref && p.provider === "novelai"
    );
  }
  /**
   * ref의 큐 슬롯을 획득한다. ref가 직렬화 대상이 아니면 즉시 no-op release 반환.
   * 대상이면 이전 요청 체인을 기다린 뒤, 내 차례가 왔을 때 release를 반환한다.
   * release()를 호출해야 다음 대기 요청이 진행된다.
   */
  async acquireQueue(ref) {
    var _a;
    if (!this.isQueueEnabled(ref))
      return noop;
    const prev = (_a = this.queueTails.get(ref)) != null ? _a : Promise.resolve();
    let resolveGate;
    const gate = new Promise((resolve) => {
      resolveGate = resolve;
    });
    this.queueTails.set(ref, prev.then(() => gate));
    await prev;
    return resolveGate;
  }
  /**
   * 큐(필요시) + 타임아웃을 적용해 task를 실행하고, 완료 후 finalize를 항상 호출.
   * 비직렬화 ref는 곧바로 실행되므로 타임아웃 시작 시점이 기존과 동일하다.
   */
  runWithGate(ref, ctrl, finalize, task) {
    const run = async () => {
      const release = await this.acquireQueue(ref);
      const timer = setTimeout(() => ctrl.abort(), this.settings.requestTimeoutMs);
      try {
        return await task();
      } finally {
        clearTimeout(timer);
        release();
      }
    };
    return run().finally(finalize);
  }
};
function assertInputWithinContext(profile, request) {
  var _a, _b, _c;
  if (profile.kind !== "chat" && profile.kind !== "text")
    return;
  const limit = (_a = profile.params) == null ? void 0 : _a.maxContextTokens;
  if (typeof limit !== "number")
    return;
  const req = request;
  const inputTokens = profile.kind === "chat" ? countTokens(
    { messages: (_b = req.messages) != null ? _b : [], tools: req.tools },
    { provider: profile.provider, model: profile.model }
  ) : countTokens((_c = req.prompt) != null ? _c : "", { provider: profile.provider, model: profile.model });
  if (inputTokens > limit) {
    throw new Error(
      `\uC785\uB825 \uD1A0\uD070(${inputTokens})\uC774 \uD504\uB85C\uD544 "${profile.name}"\uC758 \uCD5C\uB300 \uC785\uB825 \uD1A0\uD070(${limit})\uC744 \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.`
    );
  }
}
async function collectStream(iter) {
  let response = null;
  for await (const ev of iter) {
    if (ev.type === "done")
      response = ev.response;
    if (ev.type === "error")
      throw new Error(ev.error.message);
  }
  if (!response)
    throw new Error("\uC2A4\uD2B8\uB9AC\uBC0D \uC751\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
  return response;
}
function noop() {
}
function mergeSignals(a, b) {
  if (!b)
    return a;
  const ctrl = new AbortController();
  const onA = () => ctrl.abort(a.reason);
  const onB = () => ctrl.abort(b.reason);
  if (a.aborted)
    ctrl.abort();
  else
    a.addEventListener("abort", onA, { once: true });
  if (b.aborted)
    ctrl.abort();
  else
    b.addEventListener("abort", onB, { once: true });
  return ctrl.signal;
}

// src/services/request-log.ts
var RequestLogStore = class {
  constructor(entries, onChange) {
    this.onChange = onChange;
    this.entries = Array.isArray(entries) ? entries : [];
  }
  list() {
    return this.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
  }
  add(base) {
    this.entries.push({
      ...base,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now()
    });
    if (this.entries.length > 100) {
      this.entries = this.entries.slice(this.entries.length - 100);
    }
    void this.onChange();
  }
  clear() {
    this.entries = [];
    void this.onChange();
  }
  snapshot() {
    return this.entries.slice();
  }
};

// src/services/error-log.ts
var MAX_ENTRIES = 200;
var MAX_MESSAGE_CHARS = 2e3;
var ErrorLogStore = class {
  constructor(entries, onChange) {
    this.onChange = onChange;
    this.entries = Array.isArray(entries) ? entries : [];
  }
  /** 최신순 정렬 목록 */
  list(limit) {
    const sorted = this.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
    return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  }
  add(base) {
    this.entries.push({
      ...base,
      message: base.message.length > MAX_MESSAGE_CHARS ? base.message.slice(0, MAX_MESSAGE_CHARS) + "\u2026(\uC808\uB2E8)" : base.message,
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now()
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
    void this.onChange();
  }
  clear() {
    this.entries = [];
    void this.onChange();
  }
  snapshot() {
    return this.entries.slice();
  }
};

// src/services/agent-runtime.ts
var AgentRuntime = class {
  constructor(gen, app, settings) {
    this.gen = gen;
    this.app = app;
    this.settings = settings;
    this.persistentTools = /* @__PURE__ */ new Map();
    this.active = /* @__PURE__ */ new Set();
  }
  registerPersistentTool(pluginId, tool) {
    if (!this.persistentTools.has(pluginId)) {
      this.persistentTools.set(pluginId, /* @__PURE__ */ new Map());
    }
    this.persistentTools.get(pluginId).set(tool.name, tool);
    return () => {
      var _a;
      (_a = this.persistentTools.get(pluginId)) == null ? void 0 : _a.delete(tool.name);
    };
  }
  cancelAll() {
    for (const c of this.active)
      c.abort();
    this.active.clear();
  }
  run(req) {
    const ctrl = new AbortController();
    this.active.add(ctrl);
    const signal = mergeSignals(ctrl.signal, req.signal);
    const queue = new EventQueue();
    this.loop(req, signal, queue).finally(() => {
      this.active.delete(ctrl);
      queue.end();
    });
    return queue.iterable();
  }
  // ── 실제 에이전트 루프 ──
  async loop(req, signal, out) {
    var _a, _b, _c, _d;
    const toolsByName = /* @__PURE__ */ new Map();
    for (const t of req.tools)
      toolsByName.set(t.name, t);
    const mergeIds = [
      ...req.pluginId ? [req.pluginId] : [],
      ...(_a = req.pluginIds) != null ? _a : []
    ];
    for (const pid of mergeIds) {
      const persistent = this.persistentTools.get(pid);
      if (!persistent)
        continue;
      for (const [name, tool] of persistent) {
        if (!toolsByName.has(name))
          toolsByName.set(name, tool);
      }
    }
    const maxTurns = (_b = req.maxTurns) != null ? _b : this.settings.defaultMaxTurns;
    const maxToolCallsPerTurn = (_c = req.maxToolCallsPerTurn) != null ? _c : 10;
    const history = [
      { role: "system", content: req.systemPrompt },
      ...(_d = req.initialHistory) != null ? _d : [],
      {
        role: "user",
        content: req.userMessage
      }
    ];
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      turns: 0
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
        inputSchema: t.inputSchema
      }));
      const chatReq = {
        profileId: req.profileId,
        messages: history,
        tools: tools.length ? tools : void 0,
        paramsOverride: req.paramsOverride,
        signal
      };
      let turnText = "";
      const toolCalls = [];
      let stopReason = "end";
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
            for (const tc of ev.response.toolCalls) {
              const existing = toolCalls.find((x) => x.id === tc.id);
              if (existing) {
                if (!existing.name)
                  existing.name = tc.name;
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
            message: e.message,
            turn,
            code: e instanceof GGAICancelledError ? e.code : void 0
          }
        });
        return;
      }
      history.push({
        role: "assistant",
        content: turnText,
        toolCalls: toolCalls.length ? toolCalls : void 0
      });
      if (turnText)
        finalText = turnText;
      out.push({ type: "turn-end", turn, stopReason });
      if (stopReason !== "tool_use" || toolCalls.length === 0)
        break;
      const toExecute = toolCalls.slice(0, maxToolCallsPerTurn);
      const results = await Promise.all(
        toExecute.map(async (tc) => {
          var _a2, _b2;
          const def = toolsByName.get(tc.name);
          const started = Date.now();
          if (!def) {
            return {
              tc,
              result: { content: `Unknown tool: ${tc.name}`, isError: true },
              durationMs: 0
            };
          }
          out.push({
            type: "tool-use-start",
            toolCallId: tc.id,
            name: tc.name,
            input: tc.input
          });
          try {
            const result = await def.handler(tc.input, {
              app: this.app,
              pluginId: (_a2 = req.pluginId) != null ? _a2 : "caller",
              signal,
              log: (msg) => out.push({ type: "log", from: tc.name, message: msg })
            });
            return { tc, result, durationMs: Date.now() - started };
          } catch (e) {
            return {
              tc,
              result: {
                content: String((_b2 = e.message) != null ? _b2 : e),
                isError: true
              },
              durationMs: Date.now() - started
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
          durationMs
        });
        history.push({
          role: "tool",
          toolCallId: tc.id,
          content: typeof result.content === "string" ? result.content : result.content
        });
      }
      if (signal.aborted) {
        out.push({ type: "error", error: { message: "aborted", turn, code: "cancelled" } });
        return;
      }
    }
    out.push({ type: "done", finalText, history, usage });
  }
};
var EventQueue = class {
  constructor() {
    this.buffer = [];
    this.waiters = [];
    this.ended = false;
  }
  push(ev) {
    if (this.ended)
      return;
    const w = this.waiters.shift();
    if (w)
      w({ value: ev, done: false });
    else
      this.buffer.push(ev);
  }
  end() {
    this.ended = true;
    for (const w of this.waiters)
      w({ value: void 0, done: true });
    this.waiters = [];
  }
  iterable() {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (self.buffer.length) {
              const v = self.buffer.shift();
              return Promise.resolve({ value: v, done: false });
            }
            if (self.ended) {
              return Promise.resolve({ value: void 0, done: true });
            }
            return new Promise((resolve) => self.waiters.push(resolve));
          },
          return() {
            self.end();
            return Promise.resolve({ value: void 0, done: true });
          }
        };
      }
    };
  }
};

// src/api.ts
function createApi(plugin) {
  return {
    version: plugin.manifest.version,
    listProfiles: (kind) => plugin.profileStore.list(kind).map(toPublicProfile),
    getProfile: (id) => {
      const p = plugin.profileStore.get(id);
      return p ? toPublicProfile(p) : null;
    },
    generate: async (req) => {
      const profile = req.profileId ? plugin.profileStore.get(req.profileId) : plugin.profileStore.getDefaultGeneration();
      if (!profile) {
        throw new Error(
          req.profileId ? `\uD504\uB85C\uD544\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${req.profileId}` : "\uAE30\uBCF8 \uC0DD\uC131 \uD504\uB85C\uD544(chat/text)\uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4"
        );
      }
      if (profile.kind === "text") {
        return plugin.generation.text({
          profileId: profile.id,
          prompt: req.prompt,
          paramsOverride: req.paramsOverride,
          signal: req.signal
        });
      }
      const res = await plugin.generation.chat({
        profileId: profile.id,
        messages: [{ role: "user", content: req.prompt }],
        paramsOverride: req.paramsOverride,
        signal: req.signal
      });
      return { text: res.text, raw: res.raw };
    },
    chat: (req) => plugin.generation.chat(req),
    chatStream: (req) => plugin.generation.chatStream(req),
    text: (req) => plugin.generation.text(req),
    image: (req) => plugin.generation.image(req),
    tts: (req) => plugin.generation.tts(req),
    stt: (req) => plugin.generation.stt(req),
    agent: (req) => plugin.agentRuntime.run(req),
    registerTool: (pluginId, tool) => plugin.agentRuntime.registerPersistentTool(pluginId, tool),
    getRequestLog: (limit) => {
      const rows = plugin.requestLogs.list();
      const sliced = typeof limit === "number" ? rows.slice(0, limit) : rows;
      return sliced.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        profileName: e.profileName,
        provider: e.provider,
        model: e.model,
        transport: e.transport,
        phase: e.phase,
        status: e.status,
        error: e.error,
        bodyChars: e.body ? safeStringify(e.body).length : 0,
        responseChars: e.response ? safeStringify(e.response).length : 0
      }));
    },
    getRequestLogEntry: (id, field, opts) => {
      var _a, _b;
      const entry = plugin.requestLogs.list().find((e) => e.id === id);
      if (!entry)
        return null;
      const raw = field === "error" ? entry.error : field === "body" ? entry.body : entry.response;
      if (raw === void 0 || raw === null)
        return null;
      const text = typeof raw === "string" ? raw : safeStringify(raw);
      const offset = Math.max(0, (_a = opts == null ? void 0 : opts.offset) != null ? _a : 0);
      const maxChars = Math.max(1, (_b = opts == null ? void 0 : opts.maxChars) != null ? _b : 1500);
      return { text: text.slice(offset, offset + maxChars), totalChars: text.length };
    },
    getErrorLog: (limit) => plugin.errorLogs.list(limit),
    countTokens: (input, opts) => {
      let provider;
      let model;
      if (opts && "profileId" in opts && opts.profileId) {
        const p = plugin.profileStore.get(opts.profileId);
        if (p) {
          provider = p.provider;
          model = p.model;
        }
      } else if (opts) {
        provider = opts.provider;
        model = opts.model;
      }
      return countTokens(input, { provider, model });
    },
    on: (event, handler) => plugin.profileStore.on(event, handler)
  };
}
function safeStringify(v) {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch (e) {
    return String(v);
  }
}

// src/ui/settings-tab.ts
var import_obsidian9 = require("obsidian");

// src/ui/profile-modal.ts
var import_obsidian8 = require("obsidian");

// src/api/fetchModels.ts
var import_obsidian7 = require("obsidian");
async function fetchModels(provider, apiKey) {
  if (!provider.modelsEndpoint) {
    return [];
  }
  const url = buildModelsUrl(provider, apiKey);
  const headers = buildHeaders(provider, apiKey);
  const response = await (0, import_obsidian7.requestUrl)({ url, headers });
  if (response.status !== 200) {
    throw new Error(
      `\uBAA8\uB378 \uBAA9\uB85D \uC870\uD68C \uC2E4\uD328 (${response.status}): ${provider.name}`
    );
  }
  return parseModelsResponse(provider, response.json);
}
function buildModelsUrl(provider, apiKey) {
  let url = provider.baseUrl + provider.modelsEndpoint;
  if (provider.authQueryParam) {
    url += `?${provider.authQueryParam}=${apiKey}`;
  }
  return url;
}
function buildHeaders(provider, apiKey) {
  var _a;
  const headers = {};
  if (provider.authHeader && !provider.authQueryParam) {
    const prefix = (_a = provider.authPrefix) != null ? _a : "";
    headers[provider.authHeader] = prefix + apiKey;
  }
  if (provider.extraHeaders) {
    Object.assign(headers, provider.extraHeaders);
  }
  return headers;
}
function parseModelsResponse(provider, json) {
  let models;
  if (provider.modelsResponsePath) {
    models = json[provider.modelsResponsePath];
  } else if (Array.isArray(json)) {
    models = json;
  } else {
    models = [];
  }
  if (!Array.isArray(models)) {
    return [];
  }
  return models.map((m) => {
    var _a, _b, _c, _d, _e;
    const rawId = (_c = (_b = (_a = m.id) != null ? _a : m.model_id) != null ? _b : m.name) != null ? _c : "";
    const id = rawId.replace(/^models\//, "");
    const name = (_e = (_d = m.display_name) != null ? _d : m.displayName) != null ? _e : typeof m.name === "string" && m.id ? m.name : id;
    return { id, name };
  });
}
async function fetchElevenLabsVoices(apiKey, baseUrl = "https://api.elevenlabs.io/v1") {
  var _a, _b, _c;
  const res = await (0, import_obsidian7.requestUrl)({
    url: baseUrl.replace(/\/+$/, "") + "/voices",
    method: "GET",
    headers: { "xi-api-key": apiKey },
    throw: false
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`ElevenLabs voices ${res.status}: ${(_a = res.text) != null ? _a : ""}`);
  }
  const voices = (_c = (_b = res.json) == null ? void 0 : _b.voices) != null ? _c : [];
  return voices.map((v) => ({ id: v.voice_id, name: v.name, category: v.category }));
}

// src/util/nai-metadata.ts
var PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
function isPng2(b) {
  if (b.length < 8)
    return false;
  for (let i = 0; i < 8; i++)
    if (b[i] !== PNG_SIG[i])
      return false;
  return true;
}
async function readPngTextChunks(buf) {
  const out = {};
  if (!isPng2(buf))
    return out;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = dv.getUint32(off, false);
    const type = latin1(buf.subarray(off + 4, off + 8));
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (dataEnd > buf.length)
      break;
    const data = buf.subarray(dataStart, dataEnd);
    if (type === "tEXt") {
      const nul = data.indexOf(0);
      if (nul >= 0) {
        const key = latin1(data.subarray(0, nul));
        out[key] = latin1(data.subarray(nul + 1));
      }
    } else if (type === "zTXt") {
      const nul = data.indexOf(0);
      if (nul >= 0) {
        const key = latin1(data.subarray(0, nul));
        const comp = data.subarray(nul + 2);
        try {
          out[key] = utf8(await inflateZlib(comp));
        } catch (e) {
        }
      }
    } else if (type === "iTXt") {
      const parsed = parseITXt(data);
      if (parsed) {
        try {
          out[parsed.key] = parsed.compressed ? utf8(await inflateZlib(parsed.raw)) : utf8(parsed.raw);
        } catch (e) {
        }
      }
    } else if (type === "IEND") {
      break;
    }
    off = dataEnd + 4;
  }
  return out;
}
function parseITXt(data) {
  const nul1 = data.indexOf(0);
  if (nul1 < 0 || nul1 + 3 > data.length)
    return null;
  const key = latin1(data.subarray(0, nul1));
  const compFlag = data[nul1 + 1];
  let p = nul1 + 3;
  const nul2 = data.indexOf(0, p);
  if (nul2 < 0)
    return null;
  const nul3 = data.indexOf(0, nul2 + 1);
  if (nul3 < 0)
    return null;
  return { key, compressed: compFlag === 1, raw: data.subarray(nul3 + 1) };
}
async function parseNovelAiImage(bytes) {
  const chunks = await readPngTextChunks(bytes);
  const commentRaw = chunks["Comment"];
  if (!commentRaw)
    return null;
  let comment;
  try {
    comment = JSON.parse(commentRaw);
  } catch (e) {
    return null;
  }
  return mapComment(comment);
}
function mapComment(c) {
  var _a;
  const out = {};
  const v4p = asObj(c["v4_prompt"]);
  const basePrompt = asStr(deepGet(v4p, ["caption", "base_caption"]));
  out.prompt = basePrompt != null ? basePrompt : asStr(c["prompt"]);
  const useOrder = deepGet(v4p, ["use_order"]);
  if (typeof useOrder === "boolean")
    out.useOrder = useOrder;
  const v4n = asObj(c["v4_negative_prompt"]);
  const baseNeg = asStr(deepGet(v4n, ["caption", "base_caption"]));
  out.negativePrompt = (_a = baseNeg != null ? baseNeg : asStr(c["uc"])) != null ? _a : asStr(c["negative_prompt"]);
  assignNum(out, "width", c["width"]);
  assignNum(out, "height", c["height"]);
  assignNum(out, "scale", c["scale"]);
  assignStr(out, "sampler", c["sampler"]);
  assignNum(out, "steps", c["steps"]);
  assignNum(out, "nSamples", c["n_samples"]);
  assignNum(out, "seed", c["seed"]);
  assignStr(out, "noiseSchedule", c["noise_schedule"]);
  assignNum(out, "cfgRescale", c["cfg_rescale"]);
  assignNum(out, "uncondScale", c["uncond_scale"]);
  assignNum(out, "dynamicThresholdingPercentile", c["dynamic_thresholding_percentile"]);
  assignNum(out, "dynamicThresholdingMimicScale", c["dynamic_thresholding_mimic_scale"]);
  assignNum(out, "controlnetStrength", c["controlnet_strength"]);
  assignStr(out, "cfgSchedEligibility", c["cfg_sched_eligibility"]);
  const above = c["skip_cfg_above_sigma"];
  if (typeof above === "number")
    out.skipCfgAboveSigma = above;
  else if (above === null)
    out.skipCfgAboveSigma = null;
  assignNum(out, "skipCfgBelowSigma", c["skip_cfg_below_sigma"]);
  assignBool(out, "dynamicThresholding", c["dynamic_thresholding"]);
  assignBool(out, "preferBrownian", c["prefer_brownian"]);
  assignBool(out, "deliberateEulerAncestralBug", c["deliberate_euler_ancestral_bug"]);
  assignBool(out, "explikeFineDetail", c["explike_fine_detail"]);
  assignBool(out, "minimizeSigmaInf", c["minimize_sigma_inf"]);
  assignBool(out, "uncondPerVibe", c["uncond_per_vibe"]);
  assignBool(out, "wonkyVibeCorrelation", c["wonky_vibe_correlation"]);
  return out;
}
function assignNum(o, k, v) {
  if (typeof v === "number" && !Number.isNaN(v))
    o[k] = v;
}
function assignStr(o, k, v) {
  if (typeof v === "string" && v.length > 0)
    o[k] = v;
}
function assignBool(o, k, v) {
  if (typeof v === "boolean")
    o[k] = v;
}
function asObj(v) {
  return v && typeof v === "object" ? v : void 0;
}
function asStr(v) {
  return typeof v === "string" ? v : void 0;
}
function deepGet(obj, path) {
  let cur = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object")
      return void 0;
    cur = cur[k];
  }
  return cur;
}
function latin1(b) {
  let s = "";
  for (let i = 0; i < b.length; i++)
    s += String.fromCharCode(b[i]);
  return s;
}
function utf8(b) {
  return new TextDecoder("utf-8").decode(b);
}
async function inflateZlib(chunk) {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  writer.write(chunk);
  writer.close();
  const reader = ds.readable.getReader();
  const parts = [];
  let total = 0;
  for (; ; ) {
    const r = await reader.read();
    if (r.done)
      break;
    parts.push(r.value);
    total += r.value.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// src/data/providers.ts
var BUILTIN_PROVIDERS = [
  // ─── API Key 방식 (모든 플랫폼) ───
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    authType: "api_key",
    authHeader: "x-api-key",
    extraHeaders: { "anthropic-version": "2023-06-01" },
    modelsEndpoint: "/v1/models",
    modelsResponsePath: "data",
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["chat"]
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat", "completion", "image"]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat"]
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authType: "api_key",
    authQueryParam: "key",
    modelsEndpoint: "/models",
    modelsResponsePath: "models",
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["chat"]
  },
  {
    id: "novelai",
    name: "NovelAI",
    baseUrl: "https://text.novelai.net/oa/v1",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    imageBaseUrl: "https://image.novelai.net",
    imageModelId: "nai-diffusion-4-5-full",
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["completion", "image"],
    // 이미지 모델은 공식 목록 엔드포인트가 없어서 하드코딩 fallback.
    // V4+ 전용 (v4_prompt/v4_negative_prompt 구조 사용). V3 이하는 body 포맷이 달라 제외.
    staticModels: [
      { id: "nai-diffusion-4-5-full", name: "NAI Diffusion 4.5 Full" },
      { id: "nai-diffusion-4-5-curated", name: "NAI Diffusion 4.5 Curated" },
      { id: "nai-diffusion-4-full", name: "NAI Diffusion 4 Full" },
      { id: "nai-diffusion-4-curated-preview", name: "NAI Diffusion 4 Curated" }
    ]
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    baseUrl: "https://api.elevenlabs.io/v1",
    authType: "api_key",
    authHeader: "xi-api-key",
    modelsEndpoint: "/models",
    // ElevenLabs의 /v1/models는 top-level 배열을 반환 (data 래퍼 없음).
    // 보이스 목록은 /v1/voices → { voices: [...] }. fetchVoices에서 별도 처리.
    isOpenAICompatible: false,
    requiresServer: false,
    capabilities: ["tts"]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat"]
  },
  {
    id: "zai",
    name: "z.ai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat", "image"]
  },
  {
    id: "zaicoding",
    name: "z.ai Coding",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    modelsEndpoint: "/models",
    modelsResponsePath: "data",
    isOpenAICompatible: true,
    requiresServer: false,
    capabilities: ["chat"]
  }
];
function getProvider(id) {
  return BUILTIN_PROVIDERS.find((p) => p.id === id);
}

// src/ui/strings.ts
var STRINGS = {
  ko: {
    // Tabs
    tab_profiles: "\uD504\uB85C\uD544",
    tab_secrets: "Secrets",
    tab_advanced: "\uACE0\uAE09",
    tab_about: "\uC815\uBCF4",
    // Profile tab
    heading_profiles: "\uBAA8\uB378 \uD504\uB85C\uD544",
    no_profiles: "\uB4F1\uB85D\uB41C {kind} \uD504\uB85C\uD544\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    btn_edit: "\uD3B8\uC9D1",
    btn_clone: "\uBCF5\uC81C",
    clone_suffix: " (\uBCF5\uC81C)",
    btn_test: "\uD14C\uC2A4\uD2B8",
    testing_connection: "\uC5F0\uACB0 \uD14C\uC2A4\uD2B8 \uC911...",
    test_ok: "\u2705 \uC5F0\uACB0 OK",
    test_failed: "\u274C \uC2E4\uD328: {error}",
    test_error: "\u274C \uC624\uB958: {error}",
    btn_delete: "\uC0AD\uC81C",
    confirm_delete_profile: "'{name}' \uD504\uB85C\uD544\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?",
    unknown: "(\uC54C \uC218 \uC5C6\uC74C)",
    // Secrets tab
    heading_secrets: "API \uD0A4 (Secrets Vault)",
    warn_secrets_plaintext: "\u26A0 API \uD0A4\uB294 data.json\uC5D0 \uD3C9\uBB38\uC73C\uB85C \uC800\uC7A5\uB429\uB2C8\uB2E4. \uC774 Vault \uD3F4\uB354\uB97C \uACF5\uC720/\uB3D9\uAE30\uD654\uD558\uB294 \uACBD\uC6B0 \uD0A4\uAC00 \uB178\uCD9C\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    no_secrets: "\uC800\uC7A5\uB41C \uD0A4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uD504\uB85C\uD544 \uCD94\uAC00 \uC2DC \uC790\uB3D9 \uC0DD\uC131\uB429\uB2C8\uB2E4.",
    in_use: "\uC0AC\uC6A9 \uC911: {names}",
    unused: "\uBBF8\uC0AC\uC6A9",
    btn_reenter: "\uC7AC\uC785\uB825",
    prompt_new_key: "\uC0C8 API \uD0A4 \uC785\uB825 ({ref})",
    confirm_delete_key: "{ref}\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?",
    secrets_queue_note: "\uD1A0\uAE00 ON: \uAC19\uC740 \uD0A4\uB97C \uACF5\uC720\uD558\uB294 \uBAA8\uB4E0 \uD504\uB85C\uD544\uC758 \uC694\uCCAD\uC744 \uD55C \uBC88\uC5D0 \uD558\uB098\uC529 \uC21C\uCC28 \uC2E4\uD589\uD569\uB2C8\uB2E4 (\uB3D9\uC2DC \uC694\uCCAD 429 \uBC29\uC9C0). NovelAI \uD0A4\uB294 \uAE30\uBCF8 ON.",
    secrets_queue_name: "\uB3D9\uC2DC \uC694\uCCAD \uC21C\uCC28 \uC2E4\uD589",
    // Advanced tab
    heading_advanced: "\uACE0\uAE09 \uC124\uC815",
    setting_language_name: "\uC778\uD130\uD398\uC774\uC2A4 \uC5B8\uC5B4",
    setting_language_desc: "UI \uC5B8\uC5B4\uB97C \uC120\uD0DD\uD569\uB2C8\uB2E4",
    lang_ko: "\uD55C\uAD6D\uC5B4",
    lang_en: "English",
    setting_timeout_name: "\uC694\uCCAD \uD0C0\uC784\uC544\uC6C3 (ms)",
    setting_timeout_desc: "\uB2E8\uC77C \uC694\uCCAD\uC774 \uC774 \uC2DC\uAC04\uC744 \uB118\uC73C\uBA74 \uC790\uB3D9 \uCDE8\uC18C",
    setting_max_turns_name: "\uC5D0\uC774\uC804\uD2B8 \uAE30\uBCF8 maxTurns",
    setting_max_turns_desc: "agent() \uC694\uCCAD\uC5D0 maxTurns\uAC00 \uC5C6\uC744 \uB54C \uC0AC\uC6A9",
    setting_log_name: "\uC694\uCCAD \uB85C\uADF8 (\uCF58\uC194)",
    setting_log_desc: "\uCF1C\uBA74 generation/agent \uD638\uCD9C \uC2DC \uCF58\uC194\uC5D0 \uD504\uB85C\uD544 \uC815\uBCF4 \uCD9C\uB825",
    setting_cancel_all_name: "\uBAA8\uB4E0 \uC9C4\uD589 \uC911 \uC694\uCCAD \uCDE8\uC18C",
    btn_cancel: "\uCDE8\uC18C",
    notice_cancelled_all: "\uC9C4\uD589 \uC911\uC778 \uBAA8\uB4E0 \uC694\uCCAD\uC744 \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4",
    // About tab
    about_version_desc: "v{version} \xB7 \uC635\uC2DC\uB514\uC5B8 AI \uC751\uB2F5 \uD5C8\uBE0C.",
    about_features: "\uC81C\uACF5 \uAE30\uB2A5: \uBAA8\uB378 \uD504\uB85C\uD544 \uAD00\uB9AC / chat\xB7text\xB7image\xB7tts\xB7stt \uC0DD\uC131 / \uBA40\uD2F0\uD134 \uC5D0\uC774\uC804\uD2B8 \uB7F0\uD0C0\uC784 / \uC774\uBCA4\uD2B8 \uC2A4\uD2B8\uB9BC.",
    // Profile modal
    modal_title_edit: "\uD504\uB85C\uD544 \uD3B8\uC9D1",
    modal_title_add: "\uD504\uB85C\uD544 \uCD94\uAC00",
    field_display_name: "\uD45C\uC2DC\uBA85",
    placeholder_display_name: "UI \uD45C\uC2DC\uBA85",
    field_kind: "\uC885\uB958",
    kind_chat: "Chat",
    kind_text: "Text Completion (NovelAI)",
    kind_image: "Image (NovelAI)",
    kind_voice: "Voice TTS (ElevenLabs)",
    field_provider: "\uD504\uB85C\uBC14\uC774\uB354",
    provider_openai_compatible: "OpenAI-\uD638\uD658",
    provider_label_openai_compat: "OpenAI-\uD638\uD658",
    provider_lock_text: "Text Completion\uC740 NovelAI\uB85C \uACE0\uC815\uB429\uB2C8\uB2E4",
    provider_lock_image: "Image \uC0DD\uC131\uC740 NovelAI\uB85C \uACE0\uC815\uB429\uB2C8\uB2E4",
    provider_lock_voice: "Voice TTS\uB294 ElevenLabs\uB85C \uACE0\uC815\uB429\uB2C8\uB2E4",
    field_base_url: "Base URL",
    base_url_desc_image: "\uC120\uD0DD. \uBE44\uC6CC\uB450\uBA74 https://image.novelai.net",
    base_url_desc_text: "\uC120\uD0DD. \uBE44\uC6CC\uB450\uBA74 https://text.novelai.net/oa/v1",
    base_url_desc_voice: "\uC120\uD0DD. \uBE44\uC6CC\uB450\uBA74 https://api.elevenlabs.io/v1",
    base_url_desc_openai_compat: "\uD544\uC218. \uC608: http://localhost:11434/v1 (Ollama)",
    base_url_desc_default: "\uC120\uD0DD. \uBE44\uC6CC\uB450\uBA74 \uAE30\uBCF8\uAC12 \uC0AC\uC6A9",
    field_api_key: "API \uD0A4",
    desc_api_key: "\uC800\uC7A5 \uC2DC \uC544\uB798 'API \uD0A4 \uC774\uB984'\uC73C\uB85C Secrets Vault\uC5D0 \uBCF4\uAD00\uB429\uB2C8\uB2E4. \uC774\uBBF8 \uC800\uC7A5\uB41C \uD0A4\uAC00 \uC788\uC73C\uBA74 \uBE44\uC6CC\uB3C4 \uB429\uB2C8\uB2E4.",
    field_api_key_ref: "API \uD0A4 \uC774\uB984 (apiKeyRef)",
    desc_api_key_ref_prefix: "\uD0A4\uB97C \uAD6C\uBD84\uD558\uB294 \uC774\uB984\uC785\uB2C8\uB2E4. \uAC19\uC740 \uC774\uB984\uC744 \uC5EC\uB7EC \uD504\uB85C\uD544\uC5D0 \uC9C0\uC815\uD558\uBA74 API \uD0A4\uB97C \uACF5\uC720\uD569\uB2C8\uB2E4. \uBE44\uC6CC\uB450\uBA74 '{default}' \uC0AC\uC6A9.",
    stored_refs_hint: "\uC800\uC7A5\uB41C \uD0A4 \uC774\uB984: {refs}",
    no_stored_refs: "\uC544\uC9C1 \uC800\uC7A5\uB41C \uD0A4 \uC5C6\uC74C",
    field_model: "\uBAA8\uB378\uBA85",
    desc_model: "\uC9C1\uC811 \uC785\uB825\uD558\uAC70\uB098 '\uBAA8\uB378 \uBD88\uB7EC\uC624\uAE30'\uB85C \uBAA9\uB85D\uC5D0\uC11C \uC120\uD0DD",
    btn_load_models: "\uBAA8\uB378 \uBD88\uB7EC\uC624\uAE30",
    placeholder_select_list: "-- \uBAA9\uB85D\uC5D0\uC11C \uC120\uD0DD --",
    n_models: "{count}\uAC1C \uBAA8\uB378",
    n_models_built_in: "{count}\uAC1C (\uB0B4\uC7A5)",
    failed: "\uC2E4\uD328",
    notice_no_model_list: "\uC774 \uD504\uB85C\uBC14\uC774\uB354\uB294 \uBAA8\uB378 \uBAA9\uB85D \uBD88\uB7EC\uC624\uAE30\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4",
    notice_enter_api_key: "API \uD0A4\uB97C \uBA3C\uC800 \uC785\uB825\uD558\uC138\uC694",
    loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
    notice_model_load_failed: "\uBAA8\uB378 \uB85C\uB4DC \uC2E4\uD328: {error}",
    // Model placeholders
    model_ph_image: "nai-diffusion-4-5-full",
    model_ph_text: "NovelAI text \uBAA8\uB378",
    model_ph_voice: "eleven_multilingual_v2",
    model_ph_chat: "claude-opus-4-8 / gpt-4o / gemini-pro-latest",
    // Chat section
    section_chat: "Chat \uD30C\uB77C\uBBF8\uD130",
    setting_default_profile: "\uAE30\uBCF8 \uC0DD\uC131 \uD504\uB85C\uD544",
    desc_default_profile_chat: "\uD65C\uC131\uD654\uD558\uBA74 profileId\uAC00 \uC9C0\uC815\uB418\uC9C0 \uC54A\uC740 chat \uC694\uCCAD\uC5D0 \uC774 \uD504\uB85C\uD544\uC774 \uC0AC\uC6A9\uB429\uB2C8\uB2E4",
    desc_default_profile_text: "\uD65C\uC131\uD654\uD558\uBA74 profileId\uAC00 \uC9C0\uC815\uB418\uC9C0 \uC54A\uC740 text \uC694\uCCAD\uC5D0 \uC774 \uD504\uB85C\uD544\uC774 \uC0AC\uC6A9\uB429\uB2C8\uB2E4",
    desc_default_profile_image: "\uD65C\uC131\uD654\uD558\uBA74 profileId\uAC00 \uC9C0\uC815\uB418\uC9C0 \uC54A\uC740 image \uC694\uCCAD\uC5D0 \uC774 \uD504\uB85C\uD544\uC774 \uC0AC\uC6A9\uB429\uB2C8\uB2E4",
    desc_top_p: "\uBAA8\uB378\uC774 \uC9C0\uC6D0\uD558\uB294\uC9C0 \uD655\uC2E4\uD558\uC9C0 \uC54A\uC73C\uBA74 \uBE44\uC6CC\uB450\uC138\uC694",
    desc_top_k: "\uBAA8\uB378\uC774 \uC9C0\uC6D0\uD558\uB294\uC9C0 \uD655\uC2E4\uD558\uC9C0 \uC54A\uC73C\uBA74 \uBE44\uC6CC\uB450\uC138\uC694",
    desc_min_p: "\uD655\uB960 \uC784\uACC4 \uCEF7\uC624\uD504 (vLLM/LM Studio \uACC4\uC5F4\uC5D0\uC11C \uC9C0\uC6D0)",
    section_sampling_gate: "\uC0D8\uD50C\uB9C1 \uD30C\uB77C\uBBF8\uD130 \uD5C8\uC6A9 (\uC678\uBD80 \uD50C\uB7EC\uADF8\uC778 \uB178\uCD9C)",
    desc_sampling_gate: "\uCCB4\uD06C\uB41C \uD0A4\uB9CC \uC678\uBD80 \uD50C\uB7EC\uADF8\uC778\uC758 paramsOverride\uB85C \uBC1B\uC544 \uC801\uC6A9\uB429\uB2C8\uB2E4. \uCCB4\uD06C \uD574\uC81C\uB41C \uD0A4\uB294 \uC694\uCCAD\uC5D0 \uB4E4\uC5B4\uC640\uB3C4 \uBB34\uC2DC\uB418\uACE0, \uD504\uB85C\uD544\uC5D0 \uC785\uB825\uD55C \uAC12\uB3C4 \uBAA8\uB378\uB85C \uC804\uC1A1\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. temperature\uC640 max tokens\uB294 \uD56D\uC0C1 \uD5C8\uC6A9\uB429\uB2C8\uB2E4.",
    btn_detect_params: "\uD30C\uB77C\uBBF8\uD130 \uC790\uB3D9 \uAC10\uC9C0",
    hint_params_detected: "\uAC10\uC9C0\uB428 \u2014 \uD30C\uB77C\uBBF8\uD130\uAC00 \uC790\uB3D9 \uC124\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
    hint_params_unknown: "\uC11C\uBE44\uC2A4 \uBBF8\uD655\uC778 \u2014 BaseURL\uC744 \uC785\uB825 \uD6C4 \uB2E4\uC2DC \uAC10\uC9C0\uD558\uC138\uC694",
    placeholder_thinking_disabled: "0 = \uBE44\uD65C\uC131",
    placeholder_none: "(\uC5C6\uC74C)",
    setting_streaming: "\uC2A4\uD2B8\uB9AC\uBC0D \uC0AC\uC6A9",
    desc_streaming: "\uCF1C\uBA74 chat() \uD638\uCD9C\uB3C4 \uB0B4\uBD80\uC5D0\uC11C \uD1A0\uD070 \uB2E8\uC704 \uC2A4\uD2B8\uB9BC \uBC29\uC2DD\uC73C\uB85C \uCC98\uB9AC",
    setting_thinking_disabled: "\uC0AC\uACE0 \uBE44\uD65C\uC131\uD654",
    desc_thinking_disabled: "\uC0AC\uACE0 \uBAA8\uB378\uC758 thinking/reasoning\uC744 \uB055\uB2C8\uB2E4. \uC11C\uBE44\uC2A4\uBCC4\uB85C \uC62C\uBC14\uB978 \uD30C\uB77C\uBBF8\uD130\uB85C \uBCC0\uD658\uB418\uC5B4 \uC804\uC1A1\uB429\uB2C8\uB2E4 (Anthropic: thinking=disabled \xB7 Google: thinkingBudget=0 \xB7 OpenAI\xB7\uD638\uD658: \uAC10\uC9C0\uB41C \uC11C\uBE44\uC2A4\uBCC4 \uBC29\uC2DD)",
    desc_reasoning_effort: "\uAC10\uC9C0\uB41C \uC11C\uBE44\uC2A4\uAC00 \uC9C0\uC6D0\uD558\uB294 \uCD94\uB860 \uB808\uBCA8\uB9CC \uD45C\uC2DC\uB429\uB2C8\uB2E4. BaseURL/\uBAA8\uB378 \uBCC0\uACBD \uD6C4\uC5D0\uB294 '\uD30C\uB77C\uBBF8\uD130 \uC790\uB3D9 \uAC10\uC9C0'\uB97C \uB2E4\uC2DC \uC2E4\uD589\uD558\uC138\uC694.",
    desc_thinking_disable_unsupported: "\u26A0 \uC774 \uC11C\uBE44\uC2A4\uB294 \uCD94\uB860 \uB044\uAE30\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uCF1C\uBA74 \uC9C0\uC6D0\uB418\uB294 \uCD5C\uC800 \uB808\uBCA8\uB85C \uB300\uCCB4\uD558\uAC70\uB098 \uD30C\uB77C\uBBF8\uD130\uB97C \uC0DD\uB7B5\uD569\uB2C8\uB2E4.",
    // Text section
    section_text: "Text \uD30C\uB77C\uBBF8\uD130 (NovelAI)",
    setting_stop_sequences: "stop sequences (\uC27C\uD45C \uAD6C\uBD84)",
    // Image section
    section_image: "Image \uD30C\uB77C\uBBF8\uD130 (NovelAI v4.5)",
    setting_size_preset: "\uC0AC\uC774\uC988 \uD504\uB9AC\uC14B",
    option_custom: "\uCEE4\uC2A4\uD140",
    section_size: "\uC0AC\uC774\uC988",
    section_sampling: "\uC0D8\uD50C\uB9C1",
    desc_seed: "\uBE44\uC6CC\uB450\uBA74 \uB9E4 \uC694\uCCAD\uB9C8\uB2E4 \uB79C\uB364",
    placeholder_seed: "\uB79C\uB364",
    section_cfg: "CFG",
    desc_cfg_rescale: "0.0 ~ 1.0",
    desc_skip_cfg: "\uBE44\uC6CC\uB450\uBA74 \uBE44\uD65C\uC131 (null)",
    placeholder_cfg_disabled: "(\uBE44\uD65C\uC131)",
    section_dynamic_thresholding: "Dynamic Thresholding",
    section_main_prompt: "Main Prompt",
    desc_main_prompt: "\uBA54\uC778 \uD504\uB86C\uD504\uD2B8(v4_prompt.base_caption). \uC694\uCCAD\uC5D0 prompt\uAC00 \uBE44\uC5B4 \uC788\uC744 \uB54C fallback\uC73C\uB85C \uC0AC\uC6A9\uB429\uB2C8\uB2E4.",
    btn_import_nai: "NovelAI \uC774\uBBF8\uC9C0\uC5D0\uC11C \uAC00\uC838\uC624\uAE30",
    desc_import_nai: "NovelAI\uAC00 \uC0DD\uC131\uD55C PNG\uB97C \uBD88\uB7EC\uC640 \uD504\uB86C\uD504\uD2B8/\uD30C\uB77C\uBBF8\uD130\uB97C \uC790\uB3D9\uC73C\uB85C \uCC44\uC6C1\uB2C8\uB2E4.",
    notice_nai_imported: "NovelAI \uD30C\uB77C\uBBF8\uD130\uB97C \uAC00\uC838\uC654\uC2B5\uB2C8\uB2E4.",
    notice_nai_parse_failed: "NovelAI \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. NAI \uC0DD\uC131 \uC6D0\uBCF8 PNG\uC778\uC9C0 \uD655\uC778\uD558\uC138\uC694.",
    section_negative_prompt: "Negative Prompt (UC)",
    desc_negative_prompt: "v4_negative_prompt.base_caption \uBC0F \uB8E8\uD2B8 uc \uB458 \uB2E4\uC5D0 \uC801\uC6A9. \uBE44\uC6CC\uB450\uBA74 \uACF5\uB780.",
    desc_use_order: "\uCE90\uB9AD\uD130 \uD504\uB86C\uD504\uD2B8 \uC21C\uC11C \uAC15\uC81C. \uAE30\uBCF8 ON",
    section_vibe_transfer: "Vibe Transfer",
    section_advanced_image: "\uACE0\uAE09",
    desc_prefer_brownian: "\uAE30\uBCF8 ON",
    desc_uncond_per_vibe: "\uAE30\uBCF8 ON",
    desc_wonky_vibe: "\uAE30\uBCF8 ON",
    // Image tooltips (hover / long-press)
    tooltip_size_preset: "\uC774\uBBF8\uC9C0\uC758 \uAC00\uB85C\xD7\uC138\uB85C \uD574\uC0C1\uB3C4 \uD504\uB9AC\uC14B\uC785\uB2C8\uB2E4. 8\uC758 \uBC30\uC218\uC5EC\uC57C \uD558\uBA70, NAI\uB294 \uC138\uB85C\uD615(832\xD71216)\uC744 \uAE30\uBCF8 \uAD8C\uC7A5\uD569\uB2C8\uB2E4.",
    tooltip_steps: "\uB514\uB178\uC774\uC9D5 \uC2A4\uD15D \uC218\uC785\uB2C8\uB2E4. \uB192\uC744\uC218\uB85D \uB514\uD14C\uC77C\uD574\uC9C0\uC9C0\uB9CC \uC0DD\uC131 \uC2DC\uAC04\uC774 \uAE38\uC5B4\uC9D1\uB2C8\uB2E4. \uAE30\uBCF8\uAC12 28.",
    tooltip_scale: "Prompt Guidance (CFG Scale). \uD504\uB86C\uD504\uD2B8\uB97C \uC5BC\uB9C8\uB098 \uC5C4\uACA9\uD558\uAC8C \uB530\uB97C\uC9C0 \uACB0\uC815\uD569\uB2C8\uB2E4. \uB0AE\uC73C\uBA74 \uC790\uC720\uB86D\uACE0, \uB192\uC73C\uBA74 \uAC15\uD558\uAC8C \uBB36\uC774\uC9C0\uB9CC \uC0C9\uC774 \uD0C0\uBC84\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4. NAI V4\uB294 5~7 \uC804\uD6C4\uAC00 \uC801\uC815\uAC12.",
    tooltip_seed: "\uB178\uC774\uC988 \uC0DD\uC131\uC758 \uB79C\uB364 \uC2DC\uB4DC\uC785\uB2C8\uB2E4. \uAC19\uC740 \uC2DC\uB4DC+\uD30C\uB77C\uBBF8\uD130\uBA74 \uD56D\uC0C1 \uAC19\uC740 \uC774\uBBF8\uC9C0\uAC00 \uC0DD\uC131\uB429\uB2C8\uB2E4. \uBE44\uC6CC\uB450\uBA74 \uB9E4 \uC694\uCCAD\uB9C8\uB2E4 \uB79C\uB364.",
    tooltip_sampler: "\uB178\uC774\uC988\uB97C \uC81C\uAC70(\uB514\uB178\uC774\uC9D5)\uD558\uB294 \uC0D8\uD50C\uB9C1 \uC54C\uACE0\uB9AC\uC998\uC785\uB2C8\uB2E4. k_euler_ancestral\uC774\uB098 k_dpmpp_2m_sde \uACC4\uC5F4\uC774 \uC790\uC8FC \uC0AC\uC6A9\uB429\uB2C8\uB2E4.",
    tooltip_cfg_rescale: "CFG Scale\uC774 \uB192\uC744 \uB54C \uBC1C\uC0DD\uD558\uB294 \uC0C9\uC0C1 \uACFC\uD3EC\uD654(\uD0C0\uB294 \uD604\uC0C1)\uB97C \uC644\uD654\uD569\uB2C8\uB2E4. 0.0~1.0 \uC0AC\uC774 \uAC12. \uB192\uC740 CFG\uC640 \uD568\uAED8 \uC0AC\uC6A9\uD558\uC138\uC694.",
    tooltip_noise_schedule: "\uB178\uC774\uC988 \uAC10\uC18C \uC2A4\uCF00\uC904\uB7EC\uC785\uB2C8\uB2E4. karras\uAC00 \uB514\uD14C\uC77C \uBCF4\uC874\uC5D0 \uAC00\uC7A5 \uC77C\uBC18\uC801\uC73C\uB85C \uC720\uB9AC\uD569\uB2C8\uB2E4.",
    tooltip_n_samples: "\uD55C \uBC88\uC758 \uC694\uCCAD\uC73C\uB85C \uC0DD\uC131\uD560 \uC774\uBBF8\uC9C0 \uC218\uC785\uB2C8\uB2E4.",
    tooltip_uncond_scale: "\uB124\uAC70\uD2F0\uBE0C \uD504\uB86C\uD504\uD2B8(Unconditional)\uC758 \uC601\uD5A5\uB825 \uBC30\uC728\uC785\uB2C8\uB2E4. \uAE30\uBCF8\uAC12 1.0.",
    tooltip_skip_cfg_above: "\uC774\uBBF8\uC9C0\uAC00 \uAC70\uC758 \uC644\uC131\uB41C(\uB178\uC774\uC988\uAC00 \uC801\uC740) \uAD6C\uAC04\uC5D0\uC11C CFG \uACC4\uC0B0\uC744 \uC2A4\uD0B5\uD569\uB2C8\uB2E4. Variety+\uB85C \uD45C\uC2DC\uB418\uBA70, \uC5F0\uC0B0\uB7C9 \uAC10\uC18C\uC640 \uB2E4\uC591\uC131 \uD5A5\uC0C1\uC5D0 \uC0AC\uC6A9\uB429\uB2C8\uB2E4. \uBE44\uC6CC\uB450\uBA74 \uBE44\uD65C\uC131.",
    tooltip_skip_cfg_below: "\uCD08\uAE30 \uBF08\uB300\uB97C \uC7A1\uB294(\uB178\uC774\uC988\uAC00 \uD070) \uAD6C\uAC04\uC5D0\uC11C CFG \uACC4\uC0B0\uC744 \uC2A4\uD0B5\uD569\uB2C8\uB2E4. \uBE44\uC6CC\uB450\uBA74 \uBE44\uD65C\uC131.",
    tooltip_dynamic_thresholding: "CFG Scale\uC744 \uADF9\uB2E8\uC801\uC73C\uB85C \uB192\uC600\uC744 \uB54C \uC774\uBBF8\uC9C0 \uBD95\uAD34\uB97C \uB9C9\uC544\uC8FC\uB294 \uAE30\uB2A5\uC785\uB2C8\uB2E4. \uC8FC\uB85C CFG 10 \uC774\uC0C1\uC5D0\uC11C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
    tooltip_dt_mimic_scale: "\uC2E4\uC81C CFG\uB294 \uB192\uAC8C \uB450\uB418, \uBAA8\uB378\uC774 \uB9C8\uCE58 \uC774 \uAC12\uC758 CFG\uCC98\uB7FC \uD589\uB3D9\uD558\uAC8C \uB9CC\uB4ED\uB2C8\uB2E4. \uB0AE\uCD94\uBA74 \uACFC\uD3EC\uD654\uB97C \uB9C9\uC73C\uBA74\uC11C \uD504\uB86C\uD504\uD2B8 \uAD6C\uC131\uB825\uC740 \uC720\uC9C0\uD569\uB2C8\uB2E4.",
    tooltip_dt_percentile: "\uB3D9\uC801 \uC784\uACC4\uAC12\uC744 \uACB0\uC815\uD560 \uB54C \uCC38\uC870\uD560 \uD53D\uC140\uC758 \uBC31\uBD84\uC704\uC218\uC785\uB2C8\uB2E4. \uAE30\uBCF8\uAC12 0.999.",
    tooltip_negative_prompt: "\uC774\uBBF8\uC9C0\uC5D0\uC11C \uC81C\uC678\uD558\uACE0 \uC2F6\uC740 \uC694\uC18C\uB97C \uC785\uB825\uD569\uB2C8\uB2E4. v4_negative_prompt.base_caption\uACFC \uB8E8\uD2B8 uc \uBAA8\uB450\uC5D0 \uC801\uC6A9\uB429\uB2C8\uB2E4.",
    tooltip_use_coords: "V4 \uBA40\uD2F0 \uCE90\uB9AD\uD130 \uBC30\uCE58 \uC2DC \uAC01 \uCE90\uB9AD\uD130\uC758 \uC704\uCE58(\uC88C\uD45C)\uB97C \uD504\uB86C\uD504\uD2B8\uC5D0 \uBA85\uC2DC\uD569\uB2C8\uB2E4.",
    tooltip_use_order: "\uBA40\uD2F0 \uCE90\uB9AD\uD130 \uD504\uB86C\uD504\uD2B8\uC5D0\uC11C \uCE90\uB9AD\uD130 \uB4F1\uC7A5 \uC21C\uC11C\uB97C \uAC15\uC81C\uD569\uB2C8\uB2E4. \uAE30\uBCF8 ON.",
    tooltip_legacy_uc: "V3 \uC774\uD558 \uBC29\uC2DD\uC758 \uB124\uAC70\uD2F0\uBE0C \uD504\uB86C\uD504\uD2B8 \uD30C\uC2F1\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4. V4\uC758 \uC0C8 \uD30C\uC11C\uAC00 \uB9C8\uC74C\uC5D0 \uB4E4\uC9C0 \uC54A\uC744 \uB54C \uD65C\uC131\uD654\uD558\uC138\uC694.",
    tooltip_uncond_per_vibe: "Vibe Transfer \uC0AC\uC6A9 \uC2DC \uAC01 Vibe\uB9C8\uB2E4 \uAC1C\uBCC4\uC801\uC73C\uB85C \uB124\uAC70\uD2F0\uBE0C(Unconditional) \uC5F0\uC0B0\uC744 \uC218\uD589\uD569\uB2C8\uB2E4. true\uBA74 Vibe \uAC04 \uAC04\uC12D\uC774 \uC904\uC5B4\uB4ED\uB2C8\uB2E4. \uAE30\uBCF8 ON.",
    tooltip_wonky_vibe: "Vibe Transfer \uC0C1\uAD00\uAD00\uACC4 \uACC4\uC0B0 \uBC29\uC2DD \uD1A0\uAE00\uC785\uB2C8\uB2E4. \uC77C\uBC18\uC801\uC73C\uB85C true \uAD8C\uC7A5. \uAE30\uBCF8 ON.",
    tooltip_controlnet: "ControlNet \uC801\uC6A9 \uAC15\uB3C4\uC785\uB2C8\uB2E4. \uC790\uC138(\uD3EC\uC988)\uB098 \uC120\uD654 \uAD6C\uC870\uB97C \uAC15\uC81C\uD558\uB294 \uAE30\uB2A5\uC73C\uB85C 1.0\uC774 \uCD5C\uB300.",
    tooltip_prefer_brownian: "\uBE0C\uB77C\uC6B4 \uC6B4\uB3D9 \uAE30\uBC18 \uB178\uC774\uC988 \uC0DD\uC131 \uBC29\uC2DD\uC744 \uC120\uD638\uD569\uB2C8\uB2E4. \uBBF8\uC138\uD55C \uB514\uD14C\uC77C\uC5D0 \uC601\uD5A5\uC744 \uC90D\uB2C8\uB2E4. \uAE30\uBCF8 ON.",
    tooltip_cfg_sched: "CFG \uC2A4\uCF00\uC904\uB9C1\uC744 \uC801\uC6A9\uD560 \uC0D8\uD50C\uB7EC \uBC94\uC704\uB97C \uC9C0\uC815\uD569\uB2C8\uB2E4.",
    tooltip_euler_bug: "\uACFC\uAC70 Euler Ancestral \uC0D8\uD50C\uB7EC\uC758 \uBC84\uADF8\uB97C \uC758\uB3C4\uC801\uC73C\uB85C \uC7AC\uD604\uD569\uB2C8\uB2E4. \uC774 \uBC84\uADF8 \uD2B9\uC720\uC758 \uAC70\uCE5C \uC9C8\uAC10\uC744 \uC6D0\uD558\uB294 \uACBD\uC6B0 \uD65C\uC131\uD654\uD558\uC138\uC694.",
    tooltip_explike: "\uADF9\uB3C4\uC758 \uBBF8\uC138 \uB514\uD14C\uC77C\uC744 \uB04C\uC5B4\uB0B4\uAE30 \uC704\uD55C \uC2E4\uD5D8\uC801 \uC635\uC158\uC785\uB2C8\uB2E4.",
    tooltip_minimize_sigma: "\uBB34\uD55C\uB300 \uC2DC\uADF8\uB9C8(Sigma) \uAC12\uC744 \uCD5C\uC18C\uD654\uD558\uB294 \uC218\uD559\uC801 \uC124\uC815\uC785\uB2C8\uB2E4.",
    // Voice section
    section_voice: "Voice \uD30C\uB77C\uBBF8\uD130 (ElevenLabs TTS)",
    placeholder_voice_id: "\uC608: 21m00Tcm4TlvDq8ikWAM (Rachel)",
    btn_load_voices: "\uBCF4\uC774\uC2A4 \uBD88\uB7EC\uC624\uAE30",
    n_voices: "{count}\uAC1C \uBCF4\uC774\uC2A4",
    notice_voice_load_failed: "\uBCF4\uC774\uC2A4 \uB85C\uB4DC \uC2E4\uD328: {error}",
    desc_output_format: "ElevenLabs \uD3EC\uB9F7 \uCF54\uB4DC (\uC608: mp3_44100_128, pcm_16000, opus_48000_192)",
    desc_language_code: "\uC77C\uBD80 \uBAA8\uB378\uC5D0\uC11C\uB9CC \uC0AC\uC6A9 (\uC608: ko, en, ja)",
    // Buttons
    btn_save: "\uC800\uC7A5",
    btn_add: "\uCD94\uAC00",
    btn_cancel_modal: "\uCDE8\uC18C",
    // Validation notices
    notice_model_required: "\uBAA8\uB378\uBA85\uC744 \uC785\uB825\uD558\uC138\uC694",
    notice_base_url_required: "OpenAI-\uD638\uD658 \uD504\uB85C\uBC14\uC774\uB354\uB294 Base URL\uC774 \uD544\uC218\uC785\uB2C8\uB2E4",
    notice_voice_id_required: "ElevenLabs voice_id\uB97C \uC785\uB825\uD558\uC138\uC694 (\uBCF4\uC774\uC2A4 \uBD88\uB7EC\uC624\uAE30\uC5D0\uC11C \uC120\uD0DD \uAC00\uB2A5)",
    notice_profile_saved: "\uD504\uB85C\uD544 \uC800\uC7A5 \uC644\uB8CC",
    notice_profile_added: "\uD504\uB85C\uD544 \uCD94\uAC00 \uC644\uB8CC"
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
    test_ok: "\u2705 Connected",
    test_failed: "\u274C Failed: {error}",
    test_error: "\u274C Error: {error}",
    btn_delete: "Delete",
    confirm_delete_profile: "Delete profile '{name}'?",
    unknown: "(unknown)",
    // Secrets tab
    heading_secrets: "API Keys (Secrets Vault)",
    warn_secrets_plaintext: "\u26A0 API keys are stored in plaintext in data.json. If you share or sync this vault folder, keys may be exposed.",
    no_secrets: "No keys stored. They will be created when you add a profile.",
    in_use: "In use: {names}",
    unused: "Unused",
    btn_reenter: "Re-enter",
    prompt_new_key: "Enter new API key ({ref})",
    confirm_delete_key: "Delete {ref}?",
    secrets_queue_note: "Toggle ON: serialize requests from all profiles sharing this key (prevents concurrent 429 errors). NovelAI keys default to ON.",
    secrets_queue_name: "Serialize requests",
    // Advanced tab
    heading_advanced: "Advanced Settings",
    setting_language_name: "Interface Language",
    setting_language_desc: "Select UI language",
    lang_ko: "\uD55C\uAD6D\uC5B4",
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
    about_version_desc: "v{version} \xB7 Obsidian AI response hub.",
    about_features: "Features: Model profile management / chat\xB7text\xB7image\xB7tts\xB7stt generation / Multi-turn agent runtime / Event streaming.",
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
    base_url_desc_default: "Optional. Uses provider default if empty",
    field_api_key: "API Key",
    desc_api_key: "Saved to Secrets Vault under the 'API Key Name' below. Leave empty if a key is already stored.",
    field_api_key_ref: "API Key Name (apiKeyRef)",
    desc_api_key_ref_prefix: "Identifier for this key. Profiles sharing the same name share the same API key. Defaults to '{default}' if empty.",
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
    desc_default_profile_chat: "When enabled, this profile is used for chat requests that do not specify a profileId",
    desc_default_profile_text: "When enabled, this profile is used for text requests that do not specify a profileId",
    desc_default_profile_image: "When enabled, this profile is used for image requests that do not specify a profileId",
    desc_top_p: "Leave empty if unsure whether the model supports this",
    desc_top_k: "Leave empty if unsure whether the model supports this",
    desc_min_p: "Probability cutoff (supported by vLLM/LM Studio family)",
    section_sampling_gate: "Allowed sampling parameters (plugin-exposed)",
    desc_sampling_gate: "Only checked keys are accepted from external plugins' paramsOverride. Unchecked keys are dropped even if a request fills them in, and the profile's own value is not sent to the model. temperature and max tokens are always allowed.",
    btn_detect_params: "Auto-detect parameters",
    hint_params_detected: "detected \u2014 parameters auto-configured",
    hint_params_unknown: "Service unrecognised \u2014 enter BaseURL then re-detect",
    placeholder_thinking_disabled: "0 = disabled",
    placeholder_none: "(none)",
    setting_streaming: "Enable Streaming",
    desc_streaming: "When enabled, chat() calls are processed as token-level streams internally",
    setting_thinking_disabled: "Disable thinking",
    desc_thinking_disabled: "Turns off thinking/reasoning for reasoning models. Translated to the correct parameter per service (Anthropic: thinking=disabled \xB7 Google: thinkingBudget=0 \xB7 OpenAI & compatible: per detected service)",
    desc_reasoning_effort: "Only levels supported by the detected service are shown. Re-run 'Auto-detect parameters' after changing BaseURL/model.",
    desc_thinking_disable_unsupported: "\u26A0 This service does not support disabling reasoning. When on, the lowest supported level is used instead, or the parameter is omitted.",
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
    desc_main_prompt: "Main prompt (v4_prompt.base_caption). Used as fallback when the request has an empty prompt.",
    btn_import_nai: "Import from NovelAI image",
    desc_import_nai: "Load a NovelAI-generated PNG to auto-fill prompt/parameters.",
    notice_nai_imported: "Imported NovelAI parameters.",
    notice_nai_parse_failed: "No NovelAI metadata found. Make sure this is an original NAI-generated PNG.",
    section_negative_prompt: "Negative Prompt (UC)",
    desc_negative_prompt: "Applied to both v4_negative_prompt.base_caption and root uc. Leave empty for blank.",
    desc_use_order: "Force character prompt order. Default ON",
    section_vibe_transfer: "Vibe Transfer",
    section_advanced_image: "Advanced",
    desc_prefer_brownian: "Default ON",
    desc_uncond_per_vibe: "Default ON",
    desc_wonky_vibe: "Default ON",
    // Image tooltips (hover / long-press)
    tooltip_size_preset: "Image resolution preset (width\xD7height). Must be a multiple of 8. NAI recommends portrait (832\xD71216) by default.",
    tooltip_steps: "Number of denoising steps. Higher values yield more detail but take longer. Default: 28.",
    tooltip_scale: "Prompt Guidance (CFG Scale). Controls how strictly the image follows the prompt. Low = creative freedom; high = strict adherence but may cause color burn. ~5\u20137 is recommended for NAI V4.",
    tooltip_seed: "Random seed for noise generation. The same seed + parameters always produces the same image. Leave empty for a random seed each request.",
    tooltip_sampler: "Denoising sampling algorithm. k_euler_ancestral and k_dpmpp_2m_sde variants are most commonly used.",
    tooltip_cfg_rescale: "Softens color oversaturation (burning) that occurs at high CFG Scale. Range: 0.0\u20131.0. Use together with a high CFG value.",
    tooltip_noise_schedule: "Noise reduction scheduler. 'karras' is generally best for preserving fine detail.",
    tooltip_n_samples: "Number of images to generate per request.",
    tooltip_uncond_scale: "Multiplier for the influence of the negative prompt (unconditional guidance). Default: 1.0.",
    tooltip_skip_cfg_above: "Skips CFG computation when the image is nearly complete (low noise). Labeled 'Variety+' \u2014 reduces compute and increases variety. Leave empty to disable.",
    tooltip_skip_cfg_below: "Skips CFG computation during the initial structure-building phase (high noise). Leave empty to disable.",
    tooltip_dynamic_thresholding: "Prevents image collapse when using very high CFG Scale. Primarily useful above CFG 10.",
    tooltip_dt_mimic_scale: "Makes the model behave as if CFG were this value, while keeping actual CFG high. Lowering this prevents oversaturation while maintaining strong prompt adherence.",
    tooltip_dt_percentile: "Percentile of pixels used to determine the dynamic threshold. Default: 0.999.",
    tooltip_negative_prompt: "Elements to exclude from the image. Applied to both v4_negative_prompt.base_caption and root uc.",
    tooltip_use_coords: "Specifies position coordinates for each character in V4 multi-character prompts.",
    tooltip_use_order: "Forces character appearance order in multi-character prompts. Default ON.",
    tooltip_legacy_uc: "Uses the old (V3-style) negative prompt parsing. Enable if you prefer it over V4's new parser.",
    tooltip_uncond_per_vibe: "Performs separate negative (unconditional) computation per Vibe during Vibe Transfer. Reduces interference between multiple Vibes. Default ON.",
    tooltip_wonky_vibe: "Controls the Vibe correlation calculation method. Generally recommended to keep ON. Default ON.",
    tooltip_controlnet: "ControlNet application strength. Forces pose or lineart structure onto the image. Max: 1.0.",
    tooltip_prefer_brownian: "Prefers Brownian motion-based noise generation. Affects fine detail. Default ON.",
    tooltip_cfg_sched: "Specifies which samplers are eligible for CFG scheduling.",
    tooltip_euler_bug: "Intentionally reproduces a bug from the old Euler Ancestral sampler. Enable if you prefer its characteristic rough texture.",
    tooltip_explike: "Experimental option for extracting extreme fine detail.",
    tooltip_minimize_sigma: "Mathematical setting to minimize infinite sigma values.",
    // Voice section
    section_voice: "Voice Parameters (ElevenLabs TTS)",
    placeholder_voice_id: "e.g. 21m00Tcm4TlvDq8ikWAM (Rachel)",
    btn_load_voices: "Load Voices",
    n_voices: "{count} voices",
    notice_voice_load_failed: "Failed to load voices: {error}",
    desc_output_format: "ElevenLabs format code (e.g. mp3_44100_128, pcm_16000, opus_48000_192)",
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
    notice_profile_added: "Profile added"
  }
};
function makeT(lang) {
  const s = STRINGS[lang];
  return (key) => s[key];
}

// src/ui/profile-modal.ts
var NAI_SIZE_PRESETS = [
  { key: "portrait", label: "Portrait 832\xD71216", w: 832, h: 1216 },
  { key: "landscape", label: "Landscape 1216\xD7832", w: 1216, h: 832 },
  { key: "square", label: "Square 1024\xD71024", w: 1024, h: 1024 }
];
var NAI_SAMPLERS = [
  "k_euler",
  "k_euler_ancestral",
  "k_dpmpp_2s_ancestral",
  "k_dpmpp_2m",
  "k_dpmpp_2m_sde",
  "k_dpmpp_sde",
  "ddim_v3"
];
var NAI_NOISE_SCHEDULES = ["karras", "native", "exponential", "polyexponential"];
var ProfileModal = class extends import_obsidian8.Modal {
  constructor(app, plugin, existing, defaultKind = "chat") {
    super(app);
    this.plugin = plugin;
    this.original = existing;
    this.isEdit = !!existing;
    this.state = initState(existing, defaultKind, plugin);
    this.syncProviderToKind();
  }
  get lang() {
    var _a;
    return (_a = this.plugin.data.settings.uiLanguage) != null ? _a : "ko";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const L = makeT(this.lang);
    contentEl.createEl("h2", { text: this.isEdit ? L("modal_title_edit") : L("modal_title_add") });
    new import_obsidian8.Setting(contentEl).setName(L("field_display_name")).addText(
      (t) => t.setPlaceholder(L("placeholder_display_name")).setValue(this.state.name).onChange((v) => this.state.name = v)
    );
    new import_obsidian8.Setting(contentEl).setName(L("field_kind")).addDropdown((d) => {
      d.addOption("chat", L("kind_chat")).addOption("text", L("kind_text")).addOption("image", L("kind_image")).addOption("voice", L("kind_voice")).setValue(this.state.kind).onChange((v) => {
        this.state.kind = v;
        this.syncProviderToKind();
        this.render();
      });
    });
    if (this.state.kind === "chat") {
      new import_obsidian8.Setting(contentEl).setName(L("field_provider")).addDropdown((d) => {
        d.addOption("anthropic", "Anthropic").addOption("openai", "OpenAI").addOption("google", "Google Gemini").addOption("deepseek", "DeepSeek").addOption("openrouter", "OpenRouter").addOption("zai", "z.ai").addOption("nanogpt", "NanoGPT").addOption("openai-compatible", L("provider_openai_compatible")).setValue(providerDropdownValue(this.state)).onChange((v) => {
          const preset = COMPAT_PRESET_BASE_URL[v];
          if (preset) {
            this.state.provider = "openai-compatible";
            this.state.baseUrl = preset;
          } else {
            this.state.provider = v;
          }
          this.applyProviderParamDefaults();
          this.render();
        });
      });
    } else {
      this.tip(
        new import_obsidian8.Setting(contentEl).setName(L("field_provider")).addText((t) => {
          t.setValue(providerLabel(this.state.provider, L)).setDisabled(true);
        }),
        providerLockDesc(this.state.kind, L)
      );
    }
    this.tip(
      new import_obsidian8.Setting(contentEl).setName(L("field_base_url")).addText(
        (t) => t.setPlaceholder("https://...").setValue(this.state.baseUrl).onChange((v) => this.state.baseUrl = v)
      ),
      baseUrlDesc(this.state, L)
    );
    this.tip(
      new import_obsidian8.Setting(contentEl).setName(L("field_api_key")).addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.state.apiKey).onChange((v) => this.state.apiKey = v);
      }),
      L("desc_api_key")
    );
    const storedRefs = this.plugin.secretsVault.listRefs();
    const refsHint = storedRefs.length > 0 ? L("stored_refs_hint").replace(
      "{refs}",
      storedRefs.map((r) => `${r} (${this.plugin.secretsVault.mask(r)})`).join(", ")
    ) : L("no_stored_refs");
    this.tip(
      new import_obsidian8.Setting(contentEl).setName(L("field_api_key_ref")).addText(
        (t) => t.setPlaceholder(this.defaultApiKeyRef()).setValue(this.state.apiKeyRef).onChange((v) => this.state.apiKeyRef = v)
      ),
      `${L("desc_api_key_ref_prefix").replace("{default}", this.defaultApiKeyRef())} ${refsHint}`
    );
    this.renderModelRow(contentEl);
    if (this.state.kind === "chat")
      this.renderChatSection(contentEl);
    if (this.state.kind === "text")
      this.renderTextSection(contentEl);
    if (this.state.kind === "image")
      this.renderImageSection(contentEl);
    if (this.state.kind === "voice")
      this.renderVoiceSection(contentEl);
    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "16px";
    btnRow.style.justifyContent = "flex-end";
    const saveBtn = btnRow.createEl("button", {
      text: this.isEdit ? L("btn_save") : L("btn_add"),
      cls: "mod-cta"
    });
    saveBtn.onclick = async () => {
      await this.save();
    };
    const cancelBtn = btnRow.createEl("button", { text: L("btn_cancel_modal") });
    cancelBtn.onclick = () => this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
  render() {
    this.onOpen();
  }
  tip(s, text) {
    attachHelpIcon(s.nameEl, text);
    return s;
  }
  syncProviderToKind() {
    if (this.state.kind === "text" || this.state.kind === "image") {
      this.state.provider = "novelai";
    } else if (this.state.kind === "voice") {
      this.state.provider = "elevenlabs";
    } else if (this.state.provider === "novelai" || this.state.provider === "elevenlabs") {
      this.state.provider = "anthropic";
    }
  }
  /** 현재 provider/baseUrl/model 기준으로 allowedParams 체크박스를 자동 설정 */
  applyProviderParamDefaults() {
    const d = getProviderParamDefaults(
      this.state.provider,
      this.state.baseUrl,
      this.state.model
    );
    this.state.allowTopP = d.topP;
    this.state.allowTopK = d.topK;
    this.state.allowMinP = d.minP;
  }
  defaultApiKeyRef() {
    if (this.state.provider === "novelai")
      return "novelai-default";
    if (this.state.provider === "elevenlabs")
      return "elevenlabs-default";
    if (this.state.provider === "openai-compatible") {
      const svc = detectCompatService(this.state.baseUrl, this.state.model);
      if (svc !== "unknown")
        return `${svc}-default`;
    }
    return `${this.state.provider}-default`;
  }
  renderModelRow(contentEl) {
    var _a;
    const L = makeT(this.lang);
    const modelSetting = this.tip(
      new import_obsidian8.Setting(contentEl).setName(L("field_model")),
      L("desc_model")
    );
    modelSetting.addText((t) => {
      t.inputEl.style.width = "260px";
      t.setPlaceholder(this.modelPlaceholder()).setValue(this.state.model).onChange((v) => this.state.model = v);
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
      if (existing)
        existing.remove();
      if (this.state.availableModels.length === 0)
        return;
      const sel = row.createEl("select");
      sel.className = "ggai-model-select";
      sel.style.maxWidth = "260px";
      const placeholder = sel.createEl("option", { text: L("placeholder_select_list") });
      placeholder.value = "";
      for (const m of this.state.availableModels) {
        const opt = sel.createEl("option", { text: m.name !== m.id ? `${m.name} (${m.id})` : m.id });
        opt.value = m.id;
      }
      sel.value = this.state.model;
      sel.onchange = () => {
        if (sel.value) {
          this.state.model = sel.value;
          this.render();
        }
      };
    };
    if (this.state.kind === "image") {
      const nai = getProvider("novelai");
      const list = (_a = nai == null ? void 0 : nai.staticModels) != null ? _a : [];
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
        new import_obsidian8.Notice(L("notice_no_model_list"));
        return;
      }
      const apiKey = this.state.apiKey || this.plugin.secretsVault.get(this.state.apiKeyRef || this.defaultApiKeyRef()) || "";
      if (!apiKey && this.state.provider !== "openai-compatible") {
        new import_obsidian8.Notice(L("notice_enter_api_key"));
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
        new import_obsidian8.Notice(L("notice_model_load_failed").replace("{error}", e.message));
      }
    };
  }
  modelPlaceholder() {
    const L = makeT(this.lang);
    if (this.state.kind === "image")
      return L("model_ph_image");
    if (this.state.kind === "text")
      return L("model_ph_text");
    if (this.state.kind === "voice")
      return L("model_ph_voice");
    return L("model_ph_chat");
  }
  resolveProvider() {
    const kind = this.state.provider;
    if (kind === "anthropic") {
      const p = getProvider("anthropic");
      if (!p)
        return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (kind === "openai") {
      const p = getProvider("openai");
      if (!p)
        return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (kind === "google") {
      const p = getProvider("gemini");
      if (!p)
        return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (kind === "novelai") {
      const p = getProvider("novelai");
      if (!p)
        return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (kind === "elevenlabs") {
      const p = getProvider("elevenlabs");
      if (!p)
        return null;
      return this.state.baseUrl ? { ...p, baseUrl: this.state.baseUrl } : p;
    }
    if (!this.state.baseUrl)
      return null;
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
      capabilities: ["chat"]
    };
  }
  // top_p / top_k / min_p — 외부 플러그인 호출에 허용할지 여부를 체크박스로 게이팅.
  // 체크 해제된 키는 paramsOverride로 들어와도 무시되고 프로필 값도 전송되지 않음.
  renderSamplingGateSection(el) {
    const L = makeT(this.lang);
    const samplingGateH = el.createEl("h4", { text: L("section_sampling_gate") });
    attachHelpIcon(samplingGateH, L("desc_sampling_gate"));
    if (this.state.provider === "openai-compatible") {
      const row = el.createDiv();
      row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
      const detectBtn = row.createEl("button", { text: L("btn_detect_params") });
      const detectHint = row.createEl("span");
      detectHint.style.cssText = "font-size:12px;color:var(--text-muted);";
      const svc = detectCompatService(this.state.baseUrl, this.state.model);
      detectHint.textContent = svc !== "unknown" ? `${compatServiceLabel(svc)} ${L("hint_params_detected")}` : L("hint_params_unknown");
      detectBtn.onclick = () => {
        this.applyProviderParamDefaults();
        this.render();
      };
    }
    const renderRow = (key, allowKey, label, desc, placeholder, parse) => {
      const setting = new import_obsidian8.Setting(el).setName(label);
      attachHelpIcon(setting.nameEl, desc);
      let textInput;
      setting.addToggle(
        (t) => t.setValue(this.state[allowKey]).onChange((v) => {
          this.state[allowKey] = v;
          textInput == null ? void 0 : textInput.setDisabled(!v);
          (textInput == null ? void 0 : textInput.inputEl) && (textInput.inputEl.style.opacity = v ? "1" : "0.5");
        })
      );
      setting.addText((t) => {
        var _a;
        textInput = t;
        t.setPlaceholder(placeholder).setValue(String((_a = this.state[key]) != null ? _a : "")).onChange((v) => {
          const n = parse(v);
          this.state[key] = isNaN(n) ? void 0 : n;
        });
        t.setDisabled(!this.state[allowKey]);
        t.inputEl.style.opacity = this.state[allowKey] ? "1" : "0.5";
      });
    };
    renderRow(
      "topK",
      "allowTopK",
      "top_k",
      L("desc_top_k"),
      L("placeholder_none"),
      (v) => parseInt(v, 10)
    );
    renderRow(
      "topP",
      "allowTopP",
      "top_p",
      L("desc_top_p"),
      L("placeholder_none"),
      (v) => parseFloat(v)
    );
    renderRow(
      "minP",
      "allowMinP",
      "min_p",
      L("desc_min_p"),
      L("placeholder_none"),
      (v) => parseFloat(v)
    );
  }
  renderChatSection(el) {
    const L = makeT(this.lang);
    el.createEl("h3", { text: L("section_chat") });
    const defaultSetting = this.tip(
      new import_obsidian8.Setting(el).setName(L("setting_default_profile")).addToggle(
        (t) => t.setValue(this.state.isDefault).onChange((v) => {
          this.state.isDefault = v;
          applyDefaultBorder(defaultSetting.settingEl, v);
        })
      ),
      L("desc_default_profile_chat")
    );
    applyDefaultBorder(defaultSetting.settingEl, this.state.isDefault);
    this.tip(
      new import_obsidian8.Setting(el).setName("max input tokens").addText(
        (t) => {
          var _a;
          return t.setPlaceholder(L("placeholder_none")).setValue(String((_a = this.state.maxContextTokens) != null ? _a : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.maxContextTokens = isNaN(n) ? void 0 : n;
          });
        }
      ),
      "\uC785\uB825 \uD1A0\uD070 \uC0C1\uD55C. \uD558\uC704 \uD50C\uB7EC\uADF8\uC778\uC740 \uC774 \uC124\uC815\uAC12 \uC774\uC0C1\uC758 \uC218\uCE58\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
    );
    new import_obsidian8.Setting(el).setName("max output tokens").addText(
      (t) => {
        var _a;
        return t.setPlaceholder("32000").setValue(String((_a = this.state.maxTokens) != null ? _a : "")).onChange((v) => {
          const n = parseInt(v, 10);
          this.state.maxTokens = isNaN(n) ? void 0 : n;
        });
      }
    );
    new import_obsidian8.Setting(el).setName("temperature").addText(
      (t) => {
        var _a;
        return t.setPlaceholder("0.7").setValue(String((_a = this.state.temperature) != null ? _a : "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.temperature = isNaN(n) ? void 0 : n;
        });
      }
    );
    this.renderSamplingGateSection(el);
    if (this.state.provider === "anthropic") {
      new import_obsidian8.Setting(el).setName("thinking budget (Anthropic)").addText(
        (t) => {
          var _a;
          return t.setPlaceholder(L("placeholder_thinking_disabled")).setValue(String((_a = this.state.thinkingBudget) != null ? _a : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.thinkingBudget = isNaN(n) ? void 0 : n;
          });
        }
      );
    }
    const reasoning = getReasoningSupport(this.state.provider, this.state.baseUrl, this.state.model);
    if (reasoning.efforts.length) {
      const svcName = this.state.provider === "openai-compatible" ? compatServiceLabel(detectCompatService(this.state.baseUrl, this.state.model)) : "OpenAI";
      this.tip(
        new import_obsidian8.Setting(el).setName(`reasoning effort (${svcName})`).addDropdown((d) => {
          var _a;
          d.addOption("", L("placeholder_none"));
          for (const e of reasoning.efforts)
            d.addOption(e, e);
          const cur = (_a = this.state.reasoningEffort) != null ? _a : "";
          d.setValue(reasoning.efforts.includes(cur) ? cur : "").onChange((v) => this.state.reasoningEffort = v || void 0);
        }),
        L("desc_reasoning_effort")
      );
    }
    const thinkingUnsupported = !reasoning.canDisable && (this.state.provider === "openai" || this.state.provider === "openai-compatible");
    const thinkingSetting = this.tip(
      new import_obsidian8.Setting(el).setName(L("setting_thinking_disabled")).addToggle(
        (t) => t.setValue(this.state.thinkingDisabled).onChange((v) => this.state.thinkingDisabled = v)
      ),
      thinkingUnsupported ? L("desc_thinking_disable_unsupported") : L("desc_thinking_disabled")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName(L("setting_streaming")).addToggle(
        (t) => t.setValue(this.state.streamingEnabled).onChange((v) => this.state.streamingEnabled = v)
      ),
      L("desc_streaming")
    );
  }
  renderTextSection(el) {
    const L = makeT(this.lang);
    el.createEl("h3", { text: L("section_text") });
    const defaultSetting = this.tip(
      new import_obsidian8.Setting(el).setName(L("setting_default_profile")).addToggle(
        (t) => t.setValue(this.state.isDefault).onChange((v) => {
          this.state.isDefault = v;
          applyDefaultBorder(defaultSetting.settingEl, v);
        })
      ),
      L("desc_default_profile_text")
    );
    applyDefaultBorder(defaultSetting.settingEl, this.state.isDefault);
    this.tip(
      new import_obsidian8.Setting(el).setName("max input tokens").addText(
        (t) => {
          var _a;
          return t.setPlaceholder(L("placeholder_none")).setValue(String((_a = this.state.maxContextTokens) != null ? _a : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.maxContextTokens = isNaN(n) ? void 0 : n;
          });
        }
      ),
      "\uC785\uB825 \uD1A0\uD070 \uC0C1\uD55C. \uD558\uC704 \uD50C\uB7EC\uADF8\uC778\uC740 \uC774 \uC124\uC815\uAC12 \uC774\uC0C1\uC758 \uC218\uCE58\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("max output tokens").addText(
        (t) => {
          var _a;
          return t.setPlaceholder(L("placeholder_none")).setValue(String((_a = this.state.maxTokens) != null ? _a : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.maxTokens = isNaN(n) ? void 0 : n;
          });
        }
      ),
      "\uCD9C\uB825 \uD1A0\uD070 \uC0C1\uD55C. \uBE44\uC6CC\uB450\uBA74 \uC81C\uD55C \uC5C6\uC74C."
    );
    new import_obsidian8.Setting(el).setName("temperature").addText(
      (t) => {
        var _a;
        return t.setPlaceholder("1.0").setValue(String((_a = this.state.temperature) != null ? _a : "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.temperature = isNaN(n) ? void 0 : n;
        });
      }
    );
    this.renderSamplingGateSection(el);
    new import_obsidian8.Setting(el).setName(L("setting_stop_sequences")).addText(
      (t) => {
        var _a;
        return t.setPlaceholder("\\n\\n, ###").setValue((_a = this.state.stopSequences) != null ? _a : "").onChange((v) => this.state.stopSequences = v || void 0);
      }
    );
  }
  /** NAI 이미지에서 파싱한 파라미터를 editor state에 반영. undefined 필드는 기존값 유지. */
  applyNaiImport(p) {
    var _a;
    const s = this.state;
    if (p.prompt !== void 0)
      s.imagePrompt = p.prompt || void 0;
    if (p.negativePrompt !== void 0)
      s.negativePrompt = p.negativePrompt;
    if (p.width !== void 0)
      s.width = p.width;
    if (p.height !== void 0)
      s.height = p.height;
    if (p.width !== void 0 || p.height !== void 0) {
      s.sizePreset = inferPreset(s.width, s.height);
    }
    if (p.scale !== void 0)
      s.scale = p.scale;
    if (p.sampler !== void 0)
      s.sampler = p.sampler;
    if (p.steps !== void 0)
      s.steps = p.steps;
    if (p.nSamples !== void 0)
      s.nSamples = p.nSamples;
    if (p.seed !== void 0)
      s.seed = p.seed;
    if (p.noiseSchedule !== void 0)
      s.noiseSchedule = p.noiseSchedule;
    if (p.cfgRescale !== void 0)
      s.cfgRescale = p.cfgRescale;
    if (p.uncondScale !== void 0)
      s.uncondScale = p.uncondScale;
    if (p.skipCfgAboveSigma !== void 0) {
      s.skipCfgAboveSigma = (_a = p.skipCfgAboveSigma) != null ? _a : void 0;
    }
    if (p.skipCfgBelowSigma !== void 0)
      s.skipCfgBelowSigma = p.skipCfgBelowSigma;
    if (p.dynamicThresholding !== void 0)
      s.dynamicThresholding = p.dynamicThresholding;
    if (p.dynamicThresholdingPercentile !== void 0) {
      s.dynamicThresholdingPercentile = p.dynamicThresholdingPercentile;
    }
    if (p.dynamicThresholdingMimicScale !== void 0) {
      s.dynamicThresholdingMimicScale = p.dynamicThresholdingMimicScale;
    }
    if (p.useOrder !== void 0)
      s.useOrder = p.useOrder;
    if (p.controlnetStrength !== void 0)
      s.controlnetStrength = p.controlnetStrength;
    if (p.preferBrownian !== void 0)
      s.preferBrownian = p.preferBrownian;
    if (p.cfgSchedEligibility !== void 0)
      s.cfgSchedEligibility = p.cfgSchedEligibility;
    if (p.deliberateEulerAncestralBug !== void 0) {
      s.deliberateEulerAncestralBug = p.deliberateEulerAncestralBug;
    }
    if (p.explikeFineDetail !== void 0)
      s.explikeFineDetail = p.explikeFineDetail;
    if (p.minimizeSigmaInf !== void 0)
      s.minimizeSigmaInf = p.minimizeSigmaInf;
    if (p.uncondPerVibe !== void 0)
      s.uncondPerVibe = p.uncondPerVibe;
    if (p.wonkyVibeCorrelation !== void 0)
      s.wonkyVibeCorrelation = p.wonkyVibeCorrelation;
  }
  renderImageSection(el) {
    var _a;
    const L = makeT(this.lang);
    el.createEl("h3", { text: L("section_image") });
    const defaultSetting = this.tip(
      new import_obsidian8.Setting(el).setName(L("setting_default_profile")).addToggle(
        (t) => t.setValue(this.state.isDefault).onChange((v) => {
          this.state.isDefault = v;
          applyDefaultBorder(defaultSetting.settingEl, v);
        })
      ),
      L("desc_default_profile_image")
    );
    applyDefaultBorder(defaultSetting.settingEl, this.state.isDefault);
    const importInput = el.createEl("input", { type: "file" });
    importInput.accept = "image/png,.png";
    importInput.style.display = "none";
    importInput.onchange = async () => {
      var _a2;
      const file = (_a2 = importInput.files) == null ? void 0 : _a2[0];
      importInput.value = "";
      if (!file)
        return;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const imported = await parseNovelAiImage(bytes);
        if (!imported) {
          new import_obsidian8.Notice(L("notice_nai_parse_failed"));
          return;
        }
        this.applyNaiImport(imported);
        new import_obsidian8.Notice(L("notice_nai_imported"));
        this.render();
      } catch (e) {
        new import_obsidian8.Notice(L("notice_nai_parse_failed"));
        console.error("[ggai] NAI import failed", e);
      }
    };
    this.tip(
      new import_obsidian8.Setting(el).setName(L("btn_import_nai")).addButton(
        (b) => b.setButtonText(L("btn_import_nai")).onClick(() => importInput.click())
      ),
      L("desc_import_nai")
    );
    el.createEl("h4", { text: L("section_main_prompt") });
    this.tip(
      new import_obsidian8.Setting(el).setName(L("section_main_prompt")).addTextArea((t) => {
        var _a2;
        t.inputEl.rows = 3;
        t.inputEl.style.width = "100%";
        t.setValue((_a2 = this.state.imagePrompt) != null ? _a2 : "").onChange(
          (v) => this.state.imagePrompt = v || void 0
        );
      }),
      L("desc_main_prompt")
    );
    el.createEl("h4", { text: L("section_negative_prompt") });
    this.tip(
      new import_obsidian8.Setting(el).setName("negative prompt (uc)").addTextArea((t) => {
        var _a2;
        t.inputEl.rows = 3;
        t.inputEl.style.width = "100%";
        t.setValue((_a2 = this.state.negativePrompt) != null ? _a2 : "").onChange((v) => this.state.negativePrompt = v);
      }),
      L("tooltip_negative_prompt")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("use_order").addToggle(
        (t) => {
          var _a2;
          return t.setValue((_a2 = this.state.useOrder) != null ? _a2 : true).onChange((v) => this.state.useOrder = v);
        }
      ),
      L("tooltip_use_order")
    );
    el.createEl("h4", { text: L("section_size") });
    const currentPreset = (_a = this.state.sizePreset) != null ? _a : inferPreset(this.state.width, this.state.height);
    this.tip(
      new import_obsidian8.Setting(el).setName(L("setting_size_preset")).addDropdown((d) => {
        for (const p of NAI_SIZE_PRESETS)
          d.addOption(p.key, p.label);
        d.addOption("custom", L("option_custom"));
        d.setValue(currentPreset).onChange((v) => {
          this.state.sizePreset = v;
          if (v !== "custom") {
            const p = NAI_SIZE_PRESETS.find((x) => x.key === v);
            this.state.width = p.w;
            this.state.height = p.h;
          }
          this.render();
        });
      }),
      L("tooltip_size_preset")
    );
    if (currentPreset === "custom") {
      new import_obsidian8.Setting(el).setName("width (px)").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("832").setValue(String((_a2 = this.state.width) != null ? _a2 : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.width = isNaN(n) ? void 0 : n;
          });
        }
      );
      new import_obsidian8.Setting(el).setName("height (px)").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("1216").setValue(String((_a2 = this.state.height) != null ? _a2 : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.height = isNaN(n) ? void 0 : n;
          });
        }
      );
    }
    el.createEl("h4", { text: L("section_sampling") });
    this.tip(
      new import_obsidian8.Setting(el).setName("steps").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("28").setValue(String((_a2 = this.state.steps) != null ? _a2 : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.steps = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_steps")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("scale (Prompt Guidance)").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("5.0").setValue(String((_a2 = this.state.scale) != null ? _a2 : "")).onChange((v) => {
            const n = parseFloat(v);
            this.state.scale = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_scale")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("seed").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder(L("placeholder_seed")).setValue(String((_a2 = this.state.seed) != null ? _a2 : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.seed = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_seed")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("sampler").addDropdown((d) => {
        var _a2;
        for (const s of NAI_SAMPLERS)
          d.addOption(s, s);
        d.setValue((_a2 = this.state.sampler) != null ? _a2 : "k_euler_ancestral").onChange((v) => this.state.sampler = v);
      }),
      L("tooltip_sampler")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("cfg_rescale (Prompt Guidance Rescale)").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("0.0").setValue(String((_a2 = this.state.cfgRescale) != null ? _a2 : "")).onChange((v) => {
            const n = parseFloat(v);
            this.state.cfgRescale = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_cfg_rescale")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("noise_schedule").addDropdown((d) => {
        var _a2;
        for (const s of NAI_NOISE_SCHEDULES)
          d.addOption(s, s);
        d.setValue((_a2 = this.state.noiseSchedule) != null ? _a2 : "karras").onChange((v) => this.state.noiseSchedule = v);
      }),
      L("tooltip_noise_schedule")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("n_samples").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("1").setValue(String((_a2 = this.state.nSamples) != null ? _a2 : "")).onChange((v) => {
            const n = parseInt(v, 10);
            this.state.nSamples = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_n_samples")
    );
    el.createEl("h4", { text: L("section_cfg") });
    this.tip(
      new import_obsidian8.Setting(el).setName("Variety+ (skip_cfg_above_sigma)").addToggle(
        (t) => t.setValue(typeof this.state.skipCfgAboveSigma === "number").onChange((v) => {
          this.state.skipCfgAboveSigma = v ? 19 : void 0;
        })
      ),
      L("tooltip_skip_cfg_above")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("uncond_scale").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("1.0").setValue(String((_a2 = this.state.uncondScale) != null ? _a2 : "")).onChange((v) => {
            const n = parseFloat(v);
            this.state.uncondScale = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_uncond_scale")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("skip_cfg_below_sigma").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder(L("placeholder_cfg_disabled")).setValue(String((_a2 = this.state.skipCfgBelowSigma) != null ? _a2 : "")).onChange((v) => {
            const n = parseFloat(v);
            this.state.skipCfgBelowSigma = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_skip_cfg_below")
    );
    el.createEl("h4", { text: L("section_dynamic_thresholding") });
    this.tip(
      new import_obsidian8.Setting(el).setName("dynamic_thresholding").addToggle(
        (t) => t.setValue(!!this.state.dynamicThresholding).onChange((v) => this.state.dynamicThresholding = v)
      ),
      L("tooltip_dynamic_thresholding")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("dynamic_thresholding_mimic_scale").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("10.0").setValue(String((_a2 = this.state.dynamicThresholdingMimicScale) != null ? _a2 : "")).onChange((v) => {
            const n = parseFloat(v);
            this.state.dynamicThresholdingMimicScale = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_dt_mimic_scale")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("dynamic_thresholding_percentile").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("0.999").setValue(String((_a2 = this.state.dynamicThresholdingPercentile) != null ? _a2 : "")).onChange((v) => {
            const n = parseFloat(v);
            this.state.dynamicThresholdingPercentile = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_dt_percentile")
    );
    el.createEl("h4", { text: L("section_vibe_transfer") });
    this.tip(
      new import_obsidian8.Setting(el).setName("uncond_per_vibe").addToggle(
        (t) => {
          var _a2;
          return t.setValue((_a2 = this.state.uncondPerVibe) != null ? _a2 : true).onChange((v) => this.state.uncondPerVibe = v);
        }
      ),
      L("tooltip_uncond_per_vibe")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("wonky_vibe_correlation").addToggle(
        (t) => {
          var _a2;
          return t.setValue((_a2 = this.state.wonkyVibeCorrelation) != null ? _a2 : true).onChange((v) => this.state.wonkyVibeCorrelation = v);
        }
      ),
      L("tooltip_wonky_vibe")
    );
    el.createEl("h4", { text: L("section_advanced_image") });
    this.tip(
      new import_obsidian8.Setting(el).setName("controlnet_strength").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("1.0").setValue(String((_a2 = this.state.controlnetStrength) != null ? _a2 : "")).onChange((v) => {
            const n = parseFloat(v);
            this.state.controlnetStrength = isNaN(n) ? void 0 : n;
          });
        }
      ),
      L("tooltip_controlnet")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("prefer_brownian").addToggle(
        (t) => {
          var _a2;
          return t.setValue((_a2 = this.state.preferBrownian) != null ? _a2 : true).onChange((v) => this.state.preferBrownian = v);
        }
      ),
      L("tooltip_prefer_brownian")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("cfg_sched_eligibility").addText(
        (t) => {
          var _a2;
          return t.setPlaceholder("enable_for_post_summer_samplers").setValue((_a2 = this.state.cfgSchedEligibility) != null ? _a2 : "").onChange((v) => this.state.cfgSchedEligibility = v || void 0);
        }
      ),
      L("tooltip_cfg_sched")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("deliberate_euler_ancestral_bug").addToggle(
        (t) => t.setValue(!!this.state.deliberateEulerAncestralBug).onChange((v) => this.state.deliberateEulerAncestralBug = v)
      ),
      L("tooltip_euler_bug")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("explike_fine_detail").addToggle(
        (t) => t.setValue(!!this.state.explikeFineDetail).onChange((v) => this.state.explikeFineDetail = v)
      ),
      L("tooltip_explike")
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("minimize_sigma_inf").addToggle(
        (t) => t.setValue(!!this.state.minimizeSigmaInf).onChange((v) => this.state.minimizeSigmaInf = v)
      ),
      L("tooltip_minimize_sigma")
    );
  }
  renderVoiceSection(el) {
    const L = makeT(this.lang);
    el.createEl("h3", { text: L("section_voice") });
    new import_obsidian8.Setting(el).setName("voice_id").addText(
      (t) => {
        var _a;
        return t.setPlaceholder(L("placeholder_voice_id")).setValue((_a = this.state.voice) != null ? _a : "").onChange((v) => this.state.voice = v || void 0);
      }
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
      var _a, _b;
      const existing = voiceRow.querySelector("select.ggai-voice-select");
      if (existing)
        existing.remove();
      if (!((_a = this.state.availableVoices) == null ? void 0 : _a.length))
        return;
      const sel = voiceRow.createEl("select");
      sel.className = "ggai-voice-select";
      sel.style.maxWidth = "260px";
      const ph = sel.createEl("option", { text: L("placeholder_select_list") });
      ph.value = "";
      for (const v of this.state.availableVoices) {
        const label = v.category ? `${v.name} [${v.category}]` : v.name;
        const opt = sel.createEl("option", { text: `${label} (${v.id})` });
        opt.value = v.id;
      }
      sel.value = (_b = this.state.voice) != null ? _b : "";
      sel.onchange = () => {
        if (sel.value) {
          this.state.voice = sel.value;
          this.render();
        }
      };
    };
    renderVoiceDropdown();
    loadVoicesBtn.onclick = async () => {
      const apiKey = this.state.apiKey || this.plugin.secretsVault.get(this.state.apiKeyRef || "elevenlabs-default") || "";
      if (!apiKey) {
        new import_obsidian8.Notice(L("notice_enter_api_key"));
        return;
      }
      voiceStatus.textContent = L("loading");
      try {
        const voices = await fetchElevenLabsVoices(apiKey, this.state.baseUrl || void 0);
        this.state.availableVoices = voices;
        voiceStatus.textContent = L("n_voices").replace("{count}", String(voices.length));
        renderVoiceDropdown();
      } catch (e) {
        voiceStatus.textContent = L("failed");
        new import_obsidian8.Notice(L("notice_voice_load_failed").replace("{error}", e.message));
      }
    };
    this.tip(
      new import_obsidian8.Setting(el).setName("output format").addText(
        (t) => {
          var _a;
          return t.setPlaceholder("mp3_44100_128").setValue((_a = this.state.format) != null ? _a : "").onChange((v) => this.state.format = v || void 0);
        }
      ),
      L("desc_output_format")
    );
    new import_obsidian8.Setting(el).setName("stability (0~1)").addText(
      (t) => {
        var _a;
        return t.setPlaceholder("0.5").setValue(String((_a = this.state.stability) != null ? _a : "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.stability = isNaN(n) ? void 0 : n;
        });
      }
    );
    new import_obsidian8.Setting(el).setName("similarity_boost (0~1)").addText(
      (t) => {
        var _a;
        return t.setPlaceholder("0.75").setValue(String((_a = this.state.similarityBoost) != null ? _a : "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.similarityBoost = isNaN(n) ? void 0 : n;
        });
      }
    );
    new import_obsidian8.Setting(el).setName("style (0~1)").addText(
      (t) => {
        var _a;
        return t.setPlaceholder("0").setValue(String((_a = this.state.style) != null ? _a : "")).onChange((v) => {
          const n = parseFloat(v);
          this.state.style = isNaN(n) ? void 0 : n;
        });
      }
    );
    new import_obsidian8.Setting(el).setName("use_speaker_boost").addToggle(
      (t) => t.setValue(!!this.state.useSpeakerBoost).onChange((v) => this.state.useSpeakerBoost = v)
    );
    this.tip(
      new import_obsidian8.Setting(el).setName("language_code").addText(
        (t) => {
          var _a;
          return t.setValue((_a = this.state.language) != null ? _a : "").onChange((v) => this.state.language = v || void 0);
        }
      ),
      L("desc_language_code")
    );
  }
  async save() {
    var _a, _b;
    const L = makeT(this.lang);
    if (!this.state.model.trim()) {
      new import_obsidian8.Notice(L("notice_model_required"));
      return;
    }
    if (!this.state.name.trim()) {
      this.state.name = `${this.state.model.trim()} (${this.state.provider})`;
    }
    if (this.state.provider === "openai-compatible" && !this.state.baseUrl.trim()) {
      new import_obsidian8.Notice(L("notice_base_url_required"));
      return;
    }
    if (this.state.kind === "voice" && !this.state.voice) {
      new import_obsidian8.Notice(L("notice_voice_id_required"));
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
      baseUrl: this.state.baseUrl.trim() || void 0,
      apiKeyRef,
      model: this.state.model.trim(),
      createdAt: (_b = (_a = this.original) == null ? void 0 : _a.createdAt) != null ? _b : Date.now(),
      updatedAt: Date.now()
    };
    const legacyApiKey = this.state.apiKey ? { apiKey: this.state.apiKey } : this.original && this.original.apiKey ? { apiKey: this.original.apiKey } : {};
    const allowedParams = {
      topK: this.state.allowTopK,
      topP: this.state.allowTopP,
      minP: this.state.allowMinP
    };
    let profile;
    if (this.state.kind === "chat") {
      const chat = {
        ...base,
        kind: "chat",
        isDefault: this.state.isDefault,
        params: {
          ...this.state.temperature !== void 0 ? { temperature: this.state.temperature } : {},
          ...this.state.maxTokens !== void 0 ? { maxTokens: this.state.maxTokens } : {},
          ...this.state.maxContextTokens !== void 0 ? { maxContextTokens: this.state.maxContextTokens } : {},
          ...allowedParams.topP && this.state.topP !== void 0 ? { topP: this.state.topP } : {},
          ...allowedParams.topK && this.state.topK !== void 0 ? { topK: this.state.topK } : {},
          ...allowedParams.minP && this.state.minP !== void 0 ? { minP: this.state.minP } : {},
          ...this.state.thinkingBudget !== void 0 ? { thinkingBudget: this.state.thinkingBudget } : {},
          ...this.state.reasoningEffort ? { reasoningEffort: this.state.reasoningEffort } : {},
          ...this.state.thinkingDisabled ? { thinkingDisabled: true } : {}
        },
        allowedParams,
        supports: { tools: true, vision: true, streaming: true, systemPrompt: true },
        streamingEnabled: this.state.streamingEnabled
      };
      profile = { ...chat, ...legacyApiKey };
    } else if (this.state.kind === "text") {
      const text = {
        ...base,
        provider: "novelai",
        kind: "text",
        isDefault: this.state.isDefault,
        params: {
          ...this.state.temperature !== void 0 ? { temperature: this.state.temperature } : {},
          ...this.state.maxTokens !== void 0 ? { maxTokens: this.state.maxTokens } : {},
          ...this.state.maxContextTokens !== void 0 ? { maxContextTokens: this.state.maxContextTokens } : {},
          ...allowedParams.topP && this.state.topP !== void 0 ? { topP: this.state.topP } : {},
          ...allowedParams.topK && this.state.topK !== void 0 ? { topK: this.state.topK } : {},
          ...allowedParams.minP && this.state.minP !== void 0 ? { minP: this.state.minP } : {},
          ...this.state.stopSequences ? {
            stopSequences: this.state.stopSequences.split(",").map((s) => s.trim()).filter(Boolean)
          } : {}
        },
        allowedParams
      };
      profile = { ...text, ...legacyApiKey };
    } else if (this.state.kind === "image") {
      const image = {
        ...base,
        provider: "novelai",
        kind: "image",
        isDefault: this.state.isDefault,
        params: {
          ...this.state.width !== void 0 ? { width: this.state.width } : {},
          ...this.state.height !== void 0 ? { height: this.state.height } : {},
          ...this.state.scale !== void 0 ? { scale: this.state.scale } : {},
          ...this.state.sampler ? { sampler: this.state.sampler } : {},
          ...this.state.steps !== void 0 ? { steps: this.state.steps } : {},
          ...this.state.nSamples !== void 0 ? { nSamples: this.state.nSamples } : {},
          ...this.state.seed !== void 0 ? { seed: this.state.seed } : {},
          ...this.state.noiseSchedule ? { noiseSchedule: this.state.noiseSchedule } : {},
          ...this.state.cfgRescale !== void 0 ? { cfgRescale: this.state.cfgRescale } : {},
          ...this.state.uncondScale !== void 0 ? { uncondScale: this.state.uncondScale } : {},
          ...this.state.skipCfgAboveSigma !== void 0 ? { skipCfgAboveSigma: this.state.skipCfgAboveSigma } : {},
          ...this.state.skipCfgBelowSigma !== void 0 ? { skipCfgBelowSigma: this.state.skipCfgBelowSigma } : {},
          ...this.state.dynamicThresholding !== void 0 ? { dynamicThresholding: this.state.dynamicThresholding } : {},
          ...this.state.dynamicThresholdingPercentile !== void 0 ? { dynamicThresholdingPercentile: this.state.dynamicThresholdingPercentile } : {},
          ...this.state.dynamicThresholdingMimicScale !== void 0 ? { dynamicThresholdingMimicScale: this.state.dynamicThresholdingMimicScale } : {},
          ...this.state.imagePrompt ? { prompt: this.state.imagePrompt } : {},
          ...this.state.negativePrompt !== void 0 ? { negativePrompt: this.state.negativePrompt } : {},
          ...this.state.useOrder !== void 0 ? { useOrder: this.state.useOrder } : {},
          ...this.state.controlnetStrength !== void 0 ? { controlnetStrength: this.state.controlnetStrength } : {},
          ...this.state.preferBrownian !== void 0 ? { preferBrownian: this.state.preferBrownian } : {},
          ...this.state.cfgSchedEligibility ? { cfgSchedEligibility: this.state.cfgSchedEligibility } : {},
          ...this.state.deliberateEulerAncestralBug !== void 0 ? { deliberateEulerAncestralBug: this.state.deliberateEulerAncestralBug } : {},
          ...this.state.explikeFineDetail !== void 0 ? { explikeFineDetail: this.state.explikeFineDetail } : {},
          ...this.state.minimizeSigmaInf !== void 0 ? { minimizeSigmaInf: this.state.minimizeSigmaInf } : {},
          ...this.state.uncondPerVibe !== void 0 ? { uncondPerVibe: this.state.uncondPerVibe } : {},
          ...this.state.wonkyVibeCorrelation !== void 0 ? { wonkyVibeCorrelation: this.state.wonkyVibeCorrelation } : {}
        }
      };
      profile = { ...image, ...legacyApiKey };
    } else {
      const voice = {
        ...base,
        provider: "elevenlabs",
        kind: "voice",
        subKind: "tts",
        params: {
          ...this.state.voice ? { voice: this.state.voice } : {},
          ...this.state.format ? { format: this.state.format } : {},
          ...this.state.stability !== void 0 ? { stability: this.state.stability } : {},
          ...this.state.similarityBoost !== void 0 ? { similarityBoost: this.state.similarityBoost } : {},
          ...this.state.style !== void 0 ? { style: this.state.style } : {},
          ...this.state.useSpeakerBoost !== void 0 ? { useSpeakerBoost: this.state.useSpeakerBoost } : {},
          ...this.state.language ? { language: this.state.language } : {}
        }
      };
      profile = { ...voice, ...legacyApiKey };
    }
    if (this.isEdit) {
      await this.plugin.profileStore.update(profile.id, profile);
    } else {
      await this.plugin.profileStore.add(profile);
    }
    new import_obsidian8.Notice(this.isEdit ? L("notice_profile_saved") : L("notice_profile_added"));
    this.close();
  }
};
function applyDefaultBorder(el, active) {
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
function attachHelpIcon(el, text) {
  if (!text)
    return;
  const icon = el.createSpan({
    attr: { tabindex: "0", role: "button", "aria-label": text }
  });
  icon.style.cssText = "display:inline-flex;align-items:center;margin-left:6px;cursor:pointer;color:var(--text-muted);";
  (0, import_obsidian8.setIcon)(icon, "help-circle");
  const svg = icon.querySelector("svg");
  if (svg) {
    svg.style.width = "1em";
    svg.style.height = "1em";
    svg.style.pointerEvents = "none";
  }
  (0, import_obsidian8.setTooltip)(icon, text, { placement: "top" });
  const show = () => new import_obsidian8.Notice(text, 8e3);
  icon.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    show();
  });
  icon.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ")
      return;
    e.preventDefault();
    show();
  });
}
function providerDropdownValue(state) {
  if (state.provider !== "openai-compatible")
    return state.provider;
  const svc = detectCompatService(state.baseUrl, state.model);
  if (svc in COMPAT_PRESET_BASE_URL)
    return svc;
  return "openai-compatible";
}
function providerLabel(kind, L) {
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
function providerLockDesc(kind, L) {
  if (kind === "text")
    return L("provider_lock_text");
  if (kind === "image")
    return L("provider_lock_image");
  if (kind === "voice")
    return L("provider_lock_voice");
  return "";
}
function baseUrlDesc(state, L) {
  if (state.kind === "image")
    return L("base_url_desc_image");
  if (state.kind === "text")
    return L("base_url_desc_text");
  if (state.kind === "voice")
    return L("base_url_desc_voice");
  if (state.provider === "openai-compatible")
    return L("base_url_desc_openai_compat");
  return L("base_url_desc_default");
}
function inferPreset(w, h) {
  if (w === 832 && h === 1216)
    return "portrait";
  if (w === 1216 && h === 832)
    return "landscape";
  if (w === 1024 && h === 1024)
    return "square";
  if (w || h)
    return "custom";
  return "portrait";
}
function initState(existing, defaultKind, plugin) {
  var _a, _b, _c, _d, _e;
  const rand = Math.random().toString(36).slice(2, 11);
  if (!existing) {
    const initDefaults = getProviderParamDefaults("anthropic", "", "");
    return {
      id: `profile_${rand}`,
      name: "",
      kind: defaultKind,
      provider: "anthropic",
      baseUrl: "",
      apiKeyRef: "",
      apiKey: "",
      model: "",
      isDefault: false,
      streamingEnabled: false,
      thinkingDisabled: false,
      maxTokens: 32e3,
      allowTopK: initDefaults.topK,
      allowTopP: initDefaults.topP,
      allowMinP: initDefaults.minP,
      availableModels: []
    };
  }
  const base = {
    id: existing.id,
    name: existing.name,
    kind: existing.kind,
    provider: existing.provider,
    baseUrl: (_a = existing.baseUrl) != null ? _a : "",
    apiKeyRef: existing.apiKeyRef,
    apiKey: (_c = (_b = plugin.secretsVault.get(existing.apiKeyRef)) != null ? _b : existing.apiKey) != null ? _c : "",
    model: existing.model,
    isDefault: !!existing.isDefault,
    streamingEnabled: false,
    thinkingDisabled: false,
    // legacy 프로필(allowedParams 없음): 기존에 값을 설정해 둔 키는 체크된 상태로 시작.
    // allowedParams가 있으면 그대로 사용.
    allowTopK: false,
    allowTopP: false,
    allowMinP: false,
    availableModels: []
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
    base.allowTopK = ap ? !!ap.topK : existing.params.topK !== void 0;
    base.allowTopP = ap ? !!ap.topP : existing.params.topP !== void 0;
    base.allowMinP = ap ? !!ap.minP : existing.params.minP !== void 0;
  } else if (existing.kind === "text") {
    base.temperature = existing.params.temperature;
    base.maxTokens = existing.params.maxTokens;
    base.maxContextTokens = existing.params.maxContextTokens;
    base.topP = existing.params.topP;
    base.topK = existing.params.topK;
    base.minP = existing.params.minP;
    base.stopSequences = (_d = existing.params.stopSequences) == null ? void 0 : _d.join(", ");
    const ap = existing.allowedParams;
    base.allowTopK = ap ? !!ap.topK : existing.params.topK !== void 0;
    base.allowTopP = ap ? !!ap.topP : existing.params.topP !== void 0;
    base.allowMinP = ap ? !!ap.minP : existing.params.minP !== void 0;
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
    base.skipCfgAboveSigma = (_e = p.skipCfgAboveSigma) != null ? _e : void 0;
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

// src/ui/settings-tab.ts
var GGAISettingsTab = class extends import_obsidian9.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.activeTab = "profiles";
    this.unsubProfiles = null;
  }
  display() {
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
    if (this.activeTab === "profiles")
      this.renderProfiles(body);
    else if (this.activeTab === "secrets")
      this.renderSecrets(body);
    else if (this.activeTab === "logs")
      this.renderLogs(body);
    else if (this.activeTab === "advanced")
      this.renderAdvanced(body);
    else
      this.renderAbout(body);
  }
  hide() {
    var _a;
    (_a = this.unsubProfiles) == null ? void 0 : _a.call(this);
    this.unsubProfiles = null;
    super.hide();
  }
  get lang() {
    var _a;
    return (_a = this.plugin.data.settings.uiLanguage) != null ? _a : "ko";
  }
  renderTabBar(el) {
    const L = makeT(this.lang);
    const bar = el.createDiv();
    bar.style.display = "flex";
    bar.style.gap = "4px";
    bar.style.borderBottom = "1px solid var(--background-modifier-border)";
    bar.style.paddingBottom = "4px";
    const make = (id, label) => {
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
  renderProfiles(el) {
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
    const kinds = ["chat", "text", "image", "voice"];
    for (const kind of kinds) {
      const section = el.createDiv();
      section.createEl("h3", { text: kind.toUpperCase() });
      const list = this.plugin.profileStore.list(kind);
      if (list.length === 0) {
        const p = section.createEl("p", {
          text: L("no_profiles").replace("{kind}", kind)
        });
        p.style.opacity = "0.7";
        continue;
      }
      for (const profile of list) {
        this.renderProfileRow(section, profile);
      }
    }
  }
  renderProfileRow(el, profile) {
    const L = makeT(this.lang);
    const isDefault = (profile.kind === "chat" || profile.kind === "text" || profile.kind === "image") && !!profile.isDefault;
    const setting = new import_obsidian9.Setting(el).setName(isDefault ? `\u2605 ${profile.name}` : profile.name).setDesc(`${profile.provider} \xB7 ${profile.model}`);
    if (isDefault) {
      setting.settingEl.style.border = "2px solid var(--interactive-accent)";
      setting.settingEl.style.borderRadius = "6px";
      setting.settingEl.style.padding = "6px 8px";
    }
    setting.addButton(
      (b) => b.setButtonText(L("btn_edit")).onClick(() => {
        new ProfileModal(this.app, this.plugin, profile).open();
      })
    );
    setting.addButton(
      (b) => b.setButtonText(L("btn_clone")).onClick(async () => {
        const clone = {
          ...profile,
          id: `profile_${Math.random().toString(36).slice(2, 11)}`,
          name: `${profile.name}${L("clone_suffix")}`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await this.plugin.profileStore.add(clone);
        this.display();
      })
    );
    setting.addButton(
      (b) => b.setButtonText(L("btn_test")).onClick(async () => {
        var _a;
        new import_obsidian9.Notice(L("testing_connection"));
        try {
          const r = await this.plugin.generation.validate(profile.id);
          if (r.ok)
            new import_obsidian9.Notice(L("test_ok"));
          else
            new import_obsidian9.Notice(L("test_failed").replace("{error}", (_a = r.error) != null ? _a : L("unknown")));
        } catch (e) {
          new import_obsidian9.Notice(L("test_error").replace("{error}", e.message));
        }
      })
    );
    setting.addButton(
      (b) => b.setButtonText(L("btn_delete")).setWarning().onClick(async () => {
        if (!confirm(L("confirm_delete_profile").replace("{name}", profile.name)))
          return;
        await this.plugin.profileStore.remove(profile.id);
        this.display();
      })
    );
  }
  openAddModal(kind) {
    const modal = new ProfileModal(this.app, this.plugin, null, kind);
    const prevOnClose = modal.onClose.bind(modal);
    modal.onClose = () => {
      prevOnClose();
      this.display();
    };
    modal.open();
  }
  renderSecrets(el) {
    var _a;
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
    const refToProfiles = /* @__PURE__ */ new Map();
    for (const p of this.plugin.profileStore.list()) {
      if (!refToProfiles.has(p.apiKeyRef))
        refToProfiles.set(p.apiKeyRef, []);
      refToProfiles.get(p.apiKeyRef).push(p.name);
    }
    for (const ref of refs) {
      const users = (_a = refToProfiles.get(ref)) != null ? _a : [];
      const usageDesc = users.length ? L("in_use").replace("{names}", users.join(", ")) : L("unused");
      new import_obsidian9.Setting(el).setName(ref).setDesc(`${this.plugin.secretsVault.mask(ref)} \xB7 ${usageDesc}`).addToggle((t) => {
        const queued = this.plugin.generation.isQueueEnabled(ref);
        t.setTooltip(L("secrets_queue_name")).setValue(queued).onChange(async (v) => {
          if (!this.plugin.data.settings.serialQueueRefs) {
            this.plugin.data.settings.serialQueueRefs = {};
          }
          this.plugin.data.settings.serialQueueRefs[ref] = v;
          await this.plugin.persist();
        });
      }).addButton(
        (b) => b.setButtonText(L("btn_reenter")).onClick(async () => {
          const next = prompt(L("prompt_new_key").replace("{ref}", ref));
          if (next) {
            await this.plugin.secretsVault.set(ref, next);
            this.display();
          }
        })
      ).addButton(
        (b) => b.setButtonText(L("btn_delete")).setWarning().onClick(async () => {
          if (!confirm(L("confirm_delete_key").replace("{ref}", ref)))
            return;
          await this.plugin.secretsVault.remove(ref);
          this.display();
        })
      );
    }
  }
  renderAdvanced(el) {
    const L = makeT(this.lang);
    el.createEl("h2", { text: L("heading_advanced") });
    new import_obsidian9.Setting(el).setName(L("setting_language_name")).setDesc(L("setting_language_desc")).addDropdown(
      (d) => d.addOption("ko", L("lang_ko")).addOption("en", L("lang_en")).setValue(this.lang).onChange(async (v) => {
        this.plugin.data.settings.uiLanguage = v;
        await this.plugin.persist();
        this.display();
      })
    );
    new import_obsidian9.Setting(el).setName(L("setting_timeout_name")).setDesc(L("setting_timeout_desc")).addText(
      (t) => t.setValue(String(this.plugin.data.settings.requestTimeoutMs)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0) {
          this.plugin.data.settings.requestTimeoutMs = n;
          await this.plugin.persist();
        }
      })
    );
    new import_obsidian9.Setting(el).setName(L("setting_max_turns_name")).setDesc(L("setting_max_turns_desc")).addText(
      (t) => t.setValue(String(this.plugin.data.settings.defaultMaxTurns)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0) {
          this.plugin.data.settings.defaultMaxTurns = n;
          await this.plugin.persist();
        }
      })
    );
    new import_obsidian9.Setting(el).setName(L("setting_log_name")).setDesc(L("setting_log_desc")).addToggle(
      (t) => t.setValue(this.plugin.data.settings.logRequests).onChange(async (v) => {
        this.plugin.data.settings.logRequests = v;
        await this.plugin.persist();
      })
    );
    new import_obsidian9.Setting(el).setName(L("setting_cancel_all_name")).addButton(
      (b) => b.setButtonText(L("btn_cancel")).onClick(() => {
        this.plugin.generation.cancelAll();
        this.plugin.agentRuntime.cancelAll();
        new import_obsidian9.Notice(L("notice_cancelled_all"));
      })
    );
  }
  renderLogs(el) {
    el.createEl("h2", { text: "Request Logs" });
    const actions = el.createDiv();
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginBottom = "12px";
    actions.createEl("button", { text: "Refresh" }).onclick = () => this.display();
    actions.createEl("button", { text: "Clear logs" }).onclick = () => {
      if (!confirm("Clear all GGAI request logs?"))
        return;
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
        text: `${time} | ${phases} | ${latest.transport} | ${latest.profileName} | ${latest.model}`
      });
      renderLogGroup(details, group);
    }
  }
  renderAbout(el) {
    const L = makeT(this.lang);
    el.createEl("h2", { text: "GGAI Core" });
    const p1 = el.createEl("p");
    p1.setText(L("about_version_desc").replace("{version}", this.plugin.manifest.version));
    const p2 = el.createEl("p");
    p2.style.opacity = "0.7";
    p2.setText(L("about_features"));
  }
};
function groupRequestLogs(logs) {
  const groups = /* @__PURE__ */ new Map();
  for (const log of logs.slice().sort((a, b) => a.createdAt - b.createdAt)) {
    const key = log.callId != null ? `call:${log.callId}` : log.id;
    let buckets = groups.get(key);
    if (!buckets) {
      buckets = [];
      groups.set(key, buckets);
    }
    const current = buckets[buckets.length - 1];
    if (!current || startsNewLogGroup(current, log))
      buckets.push([log]);
    else
      current.push(log);
  }
  return Array.from(groups.values()).flat().map((group) => group.sort((a, b) => a.createdAt - b.createdAt)).sort((a, b) => b[b.length - 1].createdAt - a[a.length - 1].createdAt);
}
function startsNewLogGroup(group, log) {
  if (log.phase !== "request")
    return false;
  const last = group[group.length - 1];
  if (!last)
    return false;
  if (last.phase === "response")
    return true;
  return last.phase === "error" && log.createdAt - last.createdAt > 5e3;
}
function renderLogGroup(container, group) {
  const first = group[0];
  const meta = container.createEl("pre");
  meta.style.whiteSpace = "pre-wrap";
  meta.style.fontSize = "12px";
  meta.style.margin = "8px 0";
  meta.setText(
    [
      `${first.provider} / ${first.model}`,
      `profile: ${first.profileName}`,
      `transport: ${first.transport}`
    ].join("\n")
  );
  for (const log of group) {
    if (log.body !== void 0) {
      renderLogPayload(container, "REQUEST", log, "body", formatPayload(log.body));
    }
    if (log.response !== void 0) {
      renderLogPayload(container, "RESPONSE", log, "response", formatPayload(log.response));
    }
    if (log.error) {
      renderLogPayload(container, "ERROR", log, "error", log.error);
    }
  }
}
function renderLogPayload(container, label, log, kind, text) {
  const details = container.createEl("details");
  details.style.border = "1px solid var(--background-modifier-border)";
  details.style.borderRadius = "6px";
  details.style.marginTop = "8px";
  details.style.backgroundColor = kind === "body" ? "rgba(60, 120, 255, 0.08)" : kind === "response" ? "rgba(80, 170, 120, 0.08)" : "rgba(220, 80, 80, 0.08)";
  const summaryParts = [
    `${label} ${new Date(log.createdAt).toLocaleTimeString()}`,
    log.transport
  ];
  if (log.status != null)
    summaryParts.push(`status ${log.status}`);
  if (log.url)
    summaryParts.push(log.url);
  const summary = details.createEl("summary", {
    text: summaryParts.join(" | ")
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
function formatPayload(value) {
  var _a, _b, _c, _d;
  if (typeof value === "string")
    return indent(value);
  if (!value || typeof value !== "object")
    return indent(String(value));
  const rec = value;
  const lines = [];
  for (const [key, v] of Object.entries(rec)) {
    if (key === "raw" || key === "events")
      continue;
    if (key === "messages" && Array.isArray(v)) {
      lines.push("messages:");
      for (const msg of v)
        lines.push(indent(formatMessage(msg), 2));
    } else if (key === "prompt" || key === "text" || key === "reasoning") {
      lines.push(`${key}:
${indent(formatTextSummary(v), 2)}`);
    } else if (key === "usage" && v && typeof v === "object") {
      const usage = v;
      lines.push(`usage: input ${(_b = (_a = usage.inputTokens) != null ? _a : usage.prompt_tokens) != null ? _b : 0}, output ${(_d = (_c = usage.outputTokens) != null ? _c : usage.completion_tokens) != null ? _d : 0}`);
    } else if (isScalar(v)) {
      lines.push(`${key}: ${String(v)}`);
    } else {
      lines.push(`${key}: ${formatCompact(v)}`);
    }
  }
  return indent(lines.join("\n"));
}
function formatMessage(value) {
  var _a;
  if (!value || typeof value !== "object")
    return String(value);
  const rec = value;
  return `[${String((_a = rec.role) != null ? _a : "?")}]
${formatTextSummary(rec.content)}`;
}
function formatTextSummary(value) {
  if (typeof value === "string")
    return value;
  if (value && typeof value === "object") {
    const rec = value;
    if (typeof rec.full === "string")
      return rec.full;
    const head = typeof rec.head === "string" ? rec.head : "";
    const tail = typeof rec.tail === "string" ? rec.tail : "";
    const length = rec.length != null ? ` (${rec.length} chars)` : "";
    return tail ? `${head}
...
${tail}${length}` : `${head}${length}`;
  }
  return formatCompact(value);
}
function isScalar(value) {
  return value == null || ["string", "number", "boolean"].includes(typeof value);
}
function formatCompact(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}
function indent(text, spaces = 2) {
  const pad = " ".repeat(spaces);
  return text.split("\n").map((line) => `${pad}${line}`).join("\n");
}

// src/main.ts
var DEFAULT_GGAI_SETTINGS = {
  requestTimeoutMs: 12e4,
  defaultMaxTurns: 20,
  logRequests: false,
  uiLanguage: "ko",
  serialQueueRefs: {}
};
var SPINNER_FRAMES = ["\u28FE", "\u28FD", "\u28FB", "\u28BF", "\u287F", "\u28DF", "\u28EF", "\u28F7"];
var SPINNER_INTERVAL_MS = 80;
var GGAICorePlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    // 활성 요청 id → 그 요청을 표시 중인 토스트 + 스피너 span
    this.activeNotices = /* @__PURE__ */ new Map();
    this.spinnerTimer = null;
    this.spinnerFrame = 0;
    this.unsubActive = null;
  }
  async onload() {
    var _a, _b, _c, _d, _e;
    const loaded = await this.loadData();
    this.data = {
      profiles: (_a = loaded == null ? void 0 : loaded.ggai_profiles) != null ? _a : [],
      secrets: (_b = loaded == null ? void 0 : loaded.ggai_secrets) != null ? _b : {},
      settings: {
        ...DEFAULT_GGAI_SETTINGS,
        ...(_c = loaded == null ? void 0 : loaded.ggai_settings) != null ? _c : {}
      },
      requestLogs: (_d = loaded == null ? void 0 : loaded.ggai_request_logs) != null ? _d : [],
      errorLogs: (_e = loaded == null ? void 0 : loaded.ggai_error_logs) != null ? _e : []
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
      defaultMaxTurns: this.data.settings.defaultMaxTurns
    });
    this.api = createApi(this);
    this.addSettingTab(new GGAISettingsTab(this.app, this));
    this.unsubActive = this.generation.on("active-changed", () => this.syncNotices());
    this.addCommand({
      id: "open-settings",
      name: "GGAI: \uC124\uC815 \uC5F4\uAE30",
      callback: () => {
        const setting = this.app.setting;
        setting.open();
        setting.openTabById(this.manifest.id);
      }
    });
    this.addCommand({
      id: "add-profile",
      name: "GGAI: \uBAA8\uB378 \uD504\uB85C\uD544 \uCD94\uAC00",
      callback: () => {
        new ProfileModal(this.app, this, null).open();
      }
    });
    this.addCommand({
      id: "test-profile",
      name: "GGAI: \uD504\uB85C\uD544 \uC5F0\uACB0 \uD14C\uC2A4\uD2B8",
      callback: async () => {
        var _a2;
        const list = this.profileStore.list();
        if (!list.length) {
          new import_obsidian10.Notice("\uB4F1\uB85D\uB41C \uD504\uB85C\uD544\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
          return;
        }
        const profile = list[0];
        new import_obsidian10.Notice(`\uD14C\uC2A4\uD2B8 \uC911: ${profile.name}`);
        try {
          const r = await this.generation.validate(profile.id);
          new import_obsidian10.Notice(r.ok ? "\u2705 \uC5F0\uACB0 OK" : `\u274C ${(_a2 = r.error) != null ? _a2 : "\uC2E4\uD328"}`);
        } catch (e) {
          new import_obsidian10.Notice(`\u274C ${e.message}`);
        }
      }
    });
    this.addCommand({
      id: "cancel-all",
      name: "GGAI: \uC9C4\uD589 \uC911\uC778 \uBAA8\uB4E0 \uC694\uCCAD \uCDE8\uC18C",
      callback: () => {
        this.generation.cancelAll();
        this.agentRuntime.cancelAll();
        new import_obsidian10.Notice("\uBAA8\uB4E0 \uC694\uCCAD \uCDE8\uC18C \uC694\uCCAD\uB428");
      }
    });
    this.addCommand({
      id: "edit-profile",
      name: "GGAI: \uD504\uB85C\uD544 \uD3B8\uC9D1",
      callback: () => this.promptEditProfile()
    });
    window.GGAICorePlugin = this;
    console.log(`[GGAI Core] loaded v${this.manifest.version}`);
  }
  async onunload() {
    var _a, _b, _c;
    try {
      (_a = this.generation) == null ? void 0 : _a.cancelAll();
      (_b = this.agentRuntime) == null ? void 0 : _b.cancelAll();
    } catch (e) {
    }
    (_c = this.unsubActive) == null ? void 0 : _c.call(this);
    this.unsubActive = null;
    this.stopSpinner();
    for (const { notice } of this.activeNotices.values())
      notice.hide();
    this.activeNotices.clear();
    window.GGAICorePlugin = void 0;
    console.log("[GGAI Core] unloaded");
  }
  // 활성 요청 집합과 떠 있는 토스트를 일치시킨다.
  // 새 요청 → 토스트 생성, 끝난 요청 → 토스트 hide.
  syncNotices() {
    const active = this.generation.getActive();
    const activeIds = new Set(active.map((t) => t.id));
    for (const [id, entry] of this.activeNotices) {
      if (!activeIds.has(id)) {
        entry.notice.hide();
        this.activeNotices.delete(id);
      }
    }
    for (const task of active) {
      if (this.activeNotices.has(task.id))
        continue;
      const frag = document.createDocumentFragment();
      const wrap = frag.createDiv();
      wrap.style.cssText = "display:flex;align-items:center;gap:8px;";
      const spinner = wrap.createSpan();
      spinner.setText(SPINNER_FRAMES[this.spinnerFrame]);
      spinner.style.cssText = "flex:0 0 auto;font-family:var(--font-monospace)";
      const label = wrap.createSpan({ text: task.model });
      label.style.cssText = "flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      const cancelBtn = wrap.createEl("span", { text: "\u2715" });
      cancelBtn.setAttr("aria-label", `\uC694\uCCAD \uCDE8\uC18C: ${task.model}`);
      cancelBtn.setAttr("role", "button");
      cancelBtn.style.cssText = "flex:0 0 auto;cursor:pointer;color:var(--text-muted);font-size:12px;line-height:1";
      const cancel = () => this.generation.cancel(task.id);
      cancelBtn.onclick = cancel;
      wrap.onclick = cancel;
      const notice = new import_obsidian10.Notice(frag, 0);
      this.activeNotices.set(task.id, { notice, spinnerEl: spinner });
    }
    if (this.activeNotices.size > 0) {
      if (this.spinnerTimer === null) {
        this.spinnerTimer = window.setInterval(() => {
          this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
          const frame = SPINNER_FRAMES[this.spinnerFrame];
          for (const { spinnerEl } of this.activeNotices.values())
            spinnerEl.setText(frame);
        }, SPINNER_INTERVAL_MS);
      }
    } else {
      this.stopSpinner();
    }
  }
  stopSpinner() {
    if (this.spinnerTimer !== null) {
      window.clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.spinnerFrame = 0;
  }
  async persist() {
    var _a;
    const existing = (_a = await this.loadData()) != null ? _a : {};
    const merged = {
      ...existing,
      ggai_profiles: this.profileStore ? this.profileStore.snapshot() : this.data.profiles,
      ggai_secrets: this.secretsVault ? this.secretsVault.snapshot() : this.data.secrets,
      ggai_settings: this.data.settings,
      ggai_request_logs: this.requestLogs ? this.requestLogs.snapshot() : this.data.requestLogs,
      ggai_error_logs: this.errorLogs ? this.errorLogs.snapshot() : this.data.errorLogs
    };
    await this.saveData(merged);
  }
  /**
   * 특정 프로필 편집 모달을 연다. 외부 플러그인(예: Stella)에서 호출.
   * @returns profileId 가 비어 있거나 프로필을 못 찾으면 false.
   */
  openProfileEditor(profileId) {
    if (!profileId)
      return false;
    const profile = this.profileStore.get(profileId);
    if (!profile)
      return false;
    new ProfileModal(this.app, this, profile).open();
    return true;
  }
  /** 커맨드 팔레트 진입점: 프로필을 선택해 편집 모달을 연다. */
  promptEditProfile() {
    const list = this.profileStore.list();
    if (list.length === 0) {
      new import_obsidian10.Notice("\uB4F1\uB85D\uB41C \uD504\uB85C\uD544\uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
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
};
var ProfileSelectModal = class extends import_obsidian10.SuggestModal {
  constructor(app, profiles, onPick) {
    super(app);
    this.profiles = profiles;
    this.onPick = onPick;
    this.setPlaceholder("\uD3B8\uC9D1\uD560 \uD504\uB85C\uD544 \uC120\uD0DD...");
  }
  getSuggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q)
      return this.profiles;
    return this.profiles.filter(
      (p) => p.name.toLowerCase().includes(q) || `${p.provider} ${p.model}`.toLowerCase().includes(q)
    );
  }
  renderSuggestion(p, el) {
    el.createEl("div", { text: p.name });
    el.createEl("div", {
      text: `${p.provider} \xB7 ${p.model}`,
      cls: "mod-muted"
    });
  }
  onChooseSuggestion(p) {
    this.onPick(p);
  }
};
