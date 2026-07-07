import type { RequestLogEvent } from "../providers/base.ts";

export interface RequestLogEntry extends RequestLogEvent {
  id: string;
  createdAt: number;
  profileId: string;
  profileName: string;
  provider: string;
  model: string;
}

export class RequestLogStore {
  private entries: RequestLogEntry[];

  constructor(entries: RequestLogEntry[], private onChange: () => void) {
    this.entries = Array.isArray(entries) ? entries : [];
  }

  list(): RequestLogEntry[] {
    return this.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
  }

  add(base: Omit<RequestLogEntry, "id" | "createdAt">): void {
    this.entries.push({
      ...base,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    });
    if (this.entries.length > 100) {
      this.entries = this.entries.slice(this.entries.length - 100);
    }
    void this.onChange();
  }

  clear(): void {
    this.entries = [];
    void this.onChange();
  }

  snapshot(): RequestLogEntry[] {
    return this.entries.slice();
  }
}
