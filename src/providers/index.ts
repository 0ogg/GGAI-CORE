// ─── Provider 레지스트리/팩토리 ───

import type { ProviderKind, GGAIModelProfile } from "../types/profile.ts";
import type { ProviderAdapter } from "./base.ts";
import { AnthropicAdapter } from "./anthropic.ts";
import { OpenAIAdapter } from "./openai.ts";
import { GoogleAdapter } from "./google.ts";
import { NovelAIAdapter } from "./novelai.ts";
import { ElevenLabsAdapter } from "./elevenlabs.ts";

export class ProviderRegistry {
  private adapters: Map<ProviderKind, ProviderAdapter>;

  constructor() {
    this.adapters = new Map();
    this.adapters.set("anthropic", new AnthropicAdapter());
    this.adapters.set("openai", new OpenAIAdapter("openai"));
    this.adapters.set("google", new GoogleAdapter());
    this.adapters.set("openai-compatible", new OpenAIAdapter("openai-compatible"));
    this.adapters.set("novelai", new NovelAIAdapter());
    this.adapters.set("elevenlabs", new ElevenLabsAdapter());
  }

  get(kind: ProviderKind): ProviderAdapter | undefined {
    return this.adapters.get(kind);
  }

  forProfile(profile: GGAIModelProfile): ProviderAdapter {
    const ad = this.get(profile.provider);
    if (!ad) {
      throw new Error(`지원하지 않는 프로바이더: ${profile.provider}`);
    }
    return ad;
  }
}
