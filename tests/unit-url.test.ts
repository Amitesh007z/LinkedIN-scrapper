import { describe, expect, it } from 'vitest';
import { canonicalizeLinkedInUrl, InvalidProfileUrlError } from '../src/utils/linkedin-url.js';
import { dedupeStrings, normalizeDate, normalizeText } from '../src/utils/normalize.js';
import { loadConfig } from '../src/config/env.js';

describe('LinkedIn URL validation', () => {
  it('canonicalizes valid profile URLs', () => {
    expect(canonicalizeLinkedInUrl('https://linkedin.com/in/example?trk=foo')).toBe('https://www.linkedin.com/in/example/');
  });

  it.each(['http://linkedin.com/in/example', 'https://google.com/in/example', 'https://linkedin.com/feed/', 'https://linkedin.com/company/example', 'http://127.0.0.1/in/example'])('rejects %s', (url) => {
    expect(() => canonicalizeLinkedInUrl(url)).toThrow(InvalidProfileUrlError);
  });
});

describe('normalization', () => {
  it('normalizes whitespace and dates', () => {
    expect(normalizeText(['  Software   Engineer', ''].join('\n'))).toBe('Software Engineer');
    expect(normalizeDate('January 2024')).toBe('2024-01');
  });

  it('deduplicates strings case-insensitively', () => {
    expect(dedupeStrings(['JavaScript', 'javascript', 'TypeScript'])).toEqual(['JavaScript', 'TypeScript']);
  });
});

describe('runtime configuration', () => {
  it('protects production from loopback binding', () => {
    expect(loadConfig({ NODE_ENV: 'production', HOST: '127.0.0.1' }).HOST).toBe('0.0.0.0');
    expect(loadConfig({ NODE_ENV: 'development', HOST: '127.0.0.1' }).HOST).toBe('127.0.0.1');
  });
});
