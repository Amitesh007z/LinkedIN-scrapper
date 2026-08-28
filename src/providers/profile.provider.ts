import type { Profile } from '../types/profile.js';

export interface ProfileProvider {
  fetchProfile(url: string): Promise<Profile>;
}
