import type { Profile } from '../types/profile.js';
import { TtlCache, SingleFlight } from './cache.service.js';
import type { ProfileProvider } from '../providers/profile.provider.js';

export class ProfileService {
  private readonly cache: TtlCache<Profile>;
  private readonly singleFlight = new SingleFlight<Profile>();

  private activeScrapes = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly provider: ProfileProvider, cacheTtlSeconds: number, private readonly maxConcurrentScrapes = 1) {
    this.cache = new TtlCache(cacheTtlSeconds * 1000);
  }

  async fetch(url: string): Promise<{ profile: Profile; cached: boolean }> {
    const cached = this.cache.get(url);
    if (cached) return { profile: cached, cached: true };

    const profile = await this.singleFlight.run(url, async () => {
      const secondChance = this.cache.get(url);
      if (secondChance) return secondChance;
      await this.acquireSlot();
      let fetched: Profile;
      try {
        fetched = await this.provider.fetchProfile(url);
      } finally {
        this.releaseSlot();
      }
      this.cache.set(url, fetched);
      return fetched;
    });
    return { profile, cached: false };
  }

  private acquireSlot(): Promise<void> {
    if (this.activeScrapes < this.maxConcurrentScrapes) {
      this.activeScrapes += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(() => {
      this.activeScrapes += 1;
      resolve();
    }));
  }

  private releaseSlot(): void {
    this.activeScrapes -= 1;
    this.waiters.shift()?.();
  }
}
