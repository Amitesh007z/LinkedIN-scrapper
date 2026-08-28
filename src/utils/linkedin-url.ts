export class InvalidProfileUrlError extends Error {
  readonly code = 'INVALID_PROFILE_URL';

  constructor() {
    super('The supplied URL is not a valid LinkedIn profile URL.');
    this.name = 'InvalidProfileUrlError';
  }
}

export function canonicalizeLinkedInUrl(value: string): string {
  if (value.length > 2048) throw new InvalidProfileUrlError();

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidProfileUrlError();
  }

  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(hostname)) {
    throw new InvalidProfileUrlError();
  }

  const match = parsed.pathname.match(/^\/in\/([a-zA-Z0-9][a-zA-Z0-9-]{1,99})\/?$/);
  if (!match) throw new InvalidProfileUrlError();

  return `https://www.linkedin.com/in/${match[1]}/`;
}
