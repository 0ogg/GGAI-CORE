// ─── ProfileStore: GGAI 모델 프로필 저장소 ───

import type { GGAIModelProfile, ProfileKind } from "../types/profile.ts";

type ProfileEvent = "profiles-changed";

export class ProfileStore {
  private profiles: GGAIModelProfile[];
  private handlers: Map<ProfileEvent, Set<() => void>> = new Map();

  constructor(initial: GGAIModelProfile[], private persistFn: () => Promise<void> | void) {
    this.profiles = [...initial];
    this.ensureDefaults();
  }

  snapshot(): GGAIModelProfile[] {
    // 깊은 복사까지는 생략 – Plugin#saveData가 JSON 직렬화
    return this.profiles.map((p) => ({ ...p }));
  }

  list(kind?: ProfileKind): GGAIModelProfile[] {
    return kind ? this.profiles.filter((p) => p.kind === kind) : [...this.profiles];
  }

  get(id: string): GGAIModelProfile | null {
    return this.profiles.find((p) => p.id === id) ?? null;
  }

  getDefault(kind: "chat" | "text" | "image"): GGAIModelProfile | null {
    return (
      this.profiles.find(
        (p) => p.kind === kind && (p as { isDefault?: boolean }).isDefault === true
      ) ?? null
    );
  }

  /** chat/text 구분 없이 isDefault인 텍스트 생성 프로필을 반환. generate() 라우팅용. */
  getDefaultGeneration(): GGAIModelProfile | null {
    return (
      this.profiles.find(
        (p) =>
          (p.kind === "chat" || p.kind === "text") &&
          (p as { isDefault?: boolean }).isDefault === true
      ) ?? null
    );
  }

  async add(profile: GGAIModelProfile): Promise<void> {
    if ((profile as { isDefault?: boolean }).isDefault) {
      this.clearDefaultForKind(profile.kind, profile.id);
    }
    this.profiles.push(profile);
    this.ensureDefaults();
    await this.persistFn();
    this.emit("profiles-changed");
  }

  async update(id: string, patch: Partial<GGAIModelProfile>): Promise<void> {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return;
    if ((patch as { isDefault?: boolean }).isDefault) {
      this.clearDefaultForKind(this.profiles[idx].kind, id);
    }
    // 동일 kind 유지 전제. kind 변경은 별도 플로우가 필요해 막는다.
    this.profiles[idx] = { ...this.profiles[idx], ...patch, updatedAt: Date.now() } as GGAIModelProfile;
    this.ensureDefaults();
    await this.persistFn();
    this.emit("profiles-changed");
  }

  private clearDefaultForKind(kind: ProfileKind, exceptId: string): void {
    for (const p of this.profiles) {
      if (p.kind === kind && p.id !== exceptId) {
        (p as { isDefault?: boolean }).isDefault = false;
      }
    }
  }

  // chat/text/image 각각 프로필이 하나 이상 존재하면 반드시 메인(isDefault) 프로필이
  // 하나는 있도록 보장한다. 없으면 가장 먼저 등록된(createdAt이 가장 이른) 프로필을 지정.
  private ensureDefaults(): void {
    const kinds: ProfileKind[] = ["chat", "text", "image"];
    for (const kind of kinds) {
      const ofKind = this.profiles.filter((p) => p.kind === kind);
      if (!ofKind.length) continue;
      if (ofKind.some((p) => (p as { isDefault?: boolean }).isDefault === true)) continue;
      const earliest = ofKind.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
      (earliest as { isDefault?: boolean }).isDefault = true;
    }
  }

  async remove(id: string): Promise<void> {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    this.ensureDefaults();
    await this.persistFn();
    this.emit("profiles-changed");
  }

  on(event: ProfileEvent, handler: () => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private emit(event: ProfileEvent): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h();
      } catch (e) {
        console.warn("[GGAI] profile handler error", e);
      }
    });
  }
}
