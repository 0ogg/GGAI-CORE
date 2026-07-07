// ─── SecretsVault: apiKeyRef → 실제 키 매핑 ───
//
// 사용자의 결정에 따라 프로필은 apiKey를 내장(레거시 호환)하지만,
// 설계상 apiKeyRef 메커니즘도 함께 지원한다.
// 프로필이 apiKeyRef를 가지면 vault에서 조회, 없으면 profile.apiKey(있으면) 사용.

export class SecretsVault {
  private secrets: Record<string, string>;

  constructor(initial: Record<string, string>, private persistFn: () => Promise<void> | void) {
    this.secrets = { ...initial };
  }

  snapshot(): Record<string, string> {
    return { ...this.secrets };
  }

  get(ref: string): string | undefined {
    return this.secrets[ref];
  }

  async set(ref: string, value: string): Promise<void> {
    this.secrets[ref] = value;
    await this.persistFn();
  }

  async remove(ref: string): Promise<void> {
    delete this.secrets[ref];
    await this.persistFn();
  }

  listRefs(): string[] {
    return Object.keys(this.secrets);
  }

  /** UI 표시용 마스킹 (sk-****1234 형태) */
  mask(ref: string): string {
    const v = this.secrets[ref];
    if (!v) return "(미설정)";
    if (v.length <= 8) return "****";
    return `${v.slice(0, 4)}****${v.slice(-4)}`;
  }
}
