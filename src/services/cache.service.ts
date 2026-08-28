export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

export class SingleFlight<T> {
  private readonly running = new Map<string, Promise<T>>();

  run(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.running.get(key);
    if (existing) return existing;

    const promise = operation().finally(() => this.running.delete(key));
    this.running.set(key, promise);
    return promise;
  }
}
