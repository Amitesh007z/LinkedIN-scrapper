import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProfile } from '../src/providers/linkedin.provider.js';

describe('profile parser', () => {
  it('extracts required sections and normalizes duplicate skills', () => {
    const html = readFileSync(new URL('./fixtures/complete-profile.html', import.meta.url), 'utf8');
    const profile = parseProfile(html, 'https://www.linkedin.com/in/alex-developer/');

    expect(profile.name).toBe('Alex Developer');
    expect(profile.about).toContain('Builds reliable services.');
    expect(profile.experience[0]?.company).toBe('Example Corp');
    expect(profile.education[0]?.school).toBe('Example University');
    expect(profile.skills).toEqual(['TypeScript', 'Node.js']);
    expect(profile.certifications[0]?.name).toBe('Cloud Certificate');
    expect(profile.languages[0]).toEqual({ name: 'English', proficiency: 'Professional working proficiency' });
  });

  it('returns empty collections when optional sections are absent', () => {
    const profile = parseProfile('<html><body><h1>Minimal Profile</h1></body></html>', 'https://www.linkedin.com/in/minimal-profile/');

    expect(profile.experience).toEqual([]);
    expect(profile.education).toEqual([]);
    expect(profile.skills).toEqual([]);
    expect(profile.certifications).toEqual([]);
    expect(profile.languages).toEqual([]);
  });
});
