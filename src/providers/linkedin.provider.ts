import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { CheerioAPI } from 'cheerio';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { dedupeStrings, normalizeDate, normalizeText } from '../utils/normalize.js';
import type { Certification, Education, Experience, Language, Profile } from '../types/profile.js';
import type { ProfileProvider } from './profile.provider.js';

export type AuthState = 'UNINITIALIZED' | 'AUTHENTICATING' | 'AUTHENTICATED' | 'EXPIRED' | 'CHALLENGED' | 'FAILED';

export class LinkedInPlaywrightProvider implements ProfileProvider {
  private browser?: Browser;
  private context?: BrowserContext;
  private authenticationPromise?: Promise<BrowserContext>;
  private authState: AuthState = 'UNINITIALIZED';

  constructor(private readonly config: AppConfig) {}

  async fetchProfile(url: string): Promise<Profile> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const context = await this.getAuthenticatedContext();
      const page = await context.newPage();
      page.setDefaultTimeout(this.config.PAGE_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(this.config.PAGE_TIMEOUT_MS);
      try {
        await this.withTimeout(this.scrapePage(page, url), this.config.SCRAPE_TIMEOUT_MS);
        const profile = parseProfile(await page.content(), url);
        if (!profile.name || profile.name.toLowerCase() === 'join linkedin') {
          throw new AppError('EXTRACTION_FAILED', 'LinkedIn profile content was not available.', 502);
        }
        return profile;
      } catch (error) {
        if (error instanceof AppError && error.code === 'AUTHENTICATION_FAILED' && attempt === 0) {
          await this.invalidateAuthentication();
          continue;
        }
        if (error instanceof AppError) throw error;
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new AppError('UPSTREAM_TIMEOUT', 'LinkedIn did not respond before the timeout.', 502);
        }
        throw new AppError('UPSTREAM_UNAVAILABLE', 'LinkedIn could not be reached.', 502);
      } finally {
        await page.close();
      }
    }
    throw new AppError('AUTHENTICATION_FAILED', 'LinkedIn authentication could not be established.', 502);
  }

  async close(): Promise<void> {
    await this.invalidateAuthentication();
    await this.browser?.close();
    this.browser = undefined;
  }

  private async getBrowser(): Promise<Browser> {
    this.browser ??= await chromium.launch({ headless: this.config.BROWSER_HEADLESS });
    return this.browser;
  }

  private async getAuthenticatedContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    this.authenticationPromise ??= this.authenticate();
    try {
      this.context = await this.authenticationPromise;
      return this.context;
    } finally {
      this.authenticationPromise = undefined;
    }
  }

  private async authenticate(): Promise<BrowserContext> {
    this.authState = 'AUTHENTICATING';
    const context = await (await this.getBrowser()).newContext({ locale: 'en-US' });
    const page = await context.newPage();
    page.setDefaultTimeout(this.config.PAGE_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(this.config.PAGE_TIMEOUT_MS);
    try {
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
      const loginUrl = page.url();
      if (this.isChallengePage(loginUrl, await page.locator('body').innerText().catch(() => ''))) {
        if (this.config.LINKEDIN_MANUAL_AUTH) {
          await this.waitForManualAuth(page, 'LOGIN_PAGE');
        } else {
          throw new AppError('AUTHENTICATION_CHALLENGE', 'LinkedIn requested an authentication challenge.', 502, { stage: 'LOGIN_PAGE', reason: 'AUTHWALL_REDIRECT', challenge: true });
        }
      }

      await this.login(page);

      let bodyText = (await page.locator('body').innerText()).toLowerCase();
      if (this.isChallengePage(page.url(), bodyText)) {
        if (this.config.LINKEDIN_MANUAL_AUTH) {
          await this.waitForManualAuth(page, 'POST_LOGIN');
          bodyText = (await page.locator('body').innerText()).toLowerCase();
        } else {
          throw new AppError('AUTHENTICATION_CHALLENGE', 'LinkedIn requested an authentication challenge.', 502, { stage: 'POST_LOGIN', reason: 'SECURITY_CHALLENGE', challenge: true });
        }
      }

      if (this.isChallengePage(page.url(), bodyText)) {
        throw new AppError('AUTHENTICATION_CHALLENGE', 'LinkedIn requested an authentication challenge.', 502, { stage: 'POST_LOGIN', reason: 'SECURITY_CHALLENGE', challenge: true });
      }

      if (page.url().includes('/login') || bodyText.includes('sign in to linkedin') || bodyText.includes('join linkedin')) {
        const invalidCredentials = /incorrect|invalid|wrong|try again/.test(bodyText);
        if (this.config.LINKEDIN_MANUAL_AUTH && !invalidCredentials) {
          await this.waitForManualAuth(page, 'POST_LOGIN');
          bodyText = (await page.locator('body').innerText()).toLowerCase();
        }
        if (page.url().includes('/login') || bodyText.includes('sign in to linkedin') || bodyText.includes('join linkedin')) {
          throw new AppError('AUTHENTICATION_FAILED', 'LinkedIn authentication failed.', 502, { stage: 'POST_LOGIN', reason: invalidCredentials ? 'CREDENTIALS_REJECTED' : 'LOGIN_STATE_NOT_CONFIRMED', challenge: false });
        }
      }

      this.authState = 'AUTHENTICATED';
      return context;
    } catch (error) {
      if (this.config.LINKEDIN_MANUAL_AUTH && error instanceof AppError && error.code === 'AUTHENTICATION_CHALLENGE') {
        console.warn('Manual LinkedIn verification is enabled. Complete the challenge in the visible browser window, then retry the request.');
        return context;
      }
      await context.close();
      this.authState = error instanceof AppError && error.code === 'AUTHENTICATION_CHALLENGE' ? 'CHALLENGED' : 'FAILED';
      if (error instanceof AppError) throw error;
      throw new AppError('AUTHENTICATION_FAILED', 'LinkedIn authentication failed.', 502, { stage: 'AUTHENTICATE', reason: 'UNEXPECTED_AUTH_ERROR', challenge: false });
    } finally {
      if (this.authState !== 'AUTHENTICATED') {
        await page.close().catch(() => undefined);
      }
    }
  }

  private async invalidateAuthentication(): Promise<void> {
    const context = this.context;
    this.context = undefined;
    if (this.authState === 'AUTHENTICATED') this.authState = 'EXPIRED';
    if (context) await context.close();
  }

  private async scrapePage(page: Page, url: string): Promise<void> {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    let bodyText = (await page.locator('body').innerText()).toLowerCase();

    if (page.url().includes('/authwall') || bodyText.includes('security verification') || bodyText.includes('verify your identity') || bodyText.includes('checkpoint') || bodyText.includes('two-step verification')) {
      throw new AppError('AUTHENTICATION_CHALLENGE', 'LinkedIn requested an authentication challenge.', 502, { stage: 'PROFILE_LOAD', reason: 'SECURITY_CHALLENGE', challenge: true });
    }
    if (page.url().includes('/login') || bodyText.includes('sign in to linkedin') || bodyText.includes('join linkedin')) {
      throw new AppError('AUTHENTICATION_FAILED', 'LinkedIn authentication expired.', 502, { stage: 'PROFILE_LOAD', reason: 'SESSION_EXPIRED', challenge: false });
    }
    if (bodyText.includes('page not found') || bodyText.includes('profile not available')) {
      throw new AppError('PROFILE_NOT_FOUND', 'The LinkedIn profile was not found or is unavailable.', 404);
    }

    await this.scrollPage(page);
  }

  private async login(page: Page): Promise<void> {
    if (!this.config.LINKEDIN_EMAIL || !this.config.LINKEDIN_PASSWORD) {
      throw new AppError('AUTHENTICATION_FAILED', 'LinkedIn credentials are not configured.', 502, { stage: 'LOGIN', reason: 'CREDENTIALS_NOT_CONFIGURED', challenge: false });
    }
    try {
      const username = page.locator('input[autocomplete^="username"]:visible').first();
      const password = page.locator('input[autocomplete="current-password"]:visible').first();
      const submit = page.getByRole('button', { name: /^sign in$/i }).filter({ visible: true }).first();
      await username.waitFor({ state: 'visible', timeout: 10_000 });
      await password.waitFor({ state: 'visible', timeout: 5_000 });
      await submit.waitFor({ state: 'visible', timeout: 5_000 });
      await username.fill(this.config.LINKEDIN_EMAIL);
      await password.fill(this.config.LINKEDIN_PASSWORD);
      await submit.click({ timeout: 5_000 });
      await Promise.race([
        page.waitForURL((url) => !url.pathname.startsWith('/login') && !url.pathname.startsWith('/authwall'), { timeout: 15_000 }),
        page.waitForTimeout(5_000)
      ]);
    } catch {
      const currentText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
      if (page.url().includes('/authwall') || currentText.includes('security verification') || currentText.includes('checkpoint')) {
        throw new AppError('AUTHENTICATION_CHALLENGE', 'LinkedIn requested an authentication challenge.', 502, { stage: 'LOGIN_SUBMIT', reason: 'SECURITY_CHALLENGE', challenge: true });
      }
      throw new AppError('AUTHENTICATION_FAILED', 'LinkedIn login controls were unavailable or the login did not complete.', 502, { stage: 'LOGIN_SUBMIT', reason: 'CONTROLS_OR_REDIRECT_FAILED', challenge: false });
    }
  }

  private async scrollPage(page: Page): Promise<void> {
    for (let index = 0; index < 4; index += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(350);
    }
  }

  private async waitForManualAuth(page: Page, stage: 'LOGIN_PAGE' | 'POST_LOGIN'): Promise<void> {
    const startedAt = Date.now();
    const timeoutMs = 180_000;
    console.warn(`Manual LinkedIn auth enabled at ${stage}. Complete the verification in the visible browser window.`);

    while (Date.now() - startedAt < timeoutMs) {
      const currentUrl = page.url();
      const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
      const challengeDetected = this.isChallengePage(currentUrl, bodyText);

      if (!challengeDetected) {
        return;
      }

      await page.waitForTimeout(2_000);
    }

    throw new AppError('AUTHENTICATION_CHALLENGE', 'LinkedIn requested an authentication challenge and manual verification did not complete in time.', 502, { stage, reason: 'MANUAL_AUTH_TIMEOUT', challenge: true });
  }

  private isChallengePage(url: string, bodyText: string): boolean {
    const normalized = bodyText.toLowerCase();
    return url.includes('/authwall') || normalized.includes('security verification') || normalized.includes('checkpoint') || normalized.includes('two-step verification') || normalized.includes('verify your identity') || normalized.includes('join linkedin');
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AppError('UPSTREAM_TIMEOUT', 'Profile extraction exceeded the configured timeout.', 502)), timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export function parseProfile(html: string, profileUrl: string): Profile {
  const $ = cheerio.load(html);
  const section = (heading: string): cheerio.Cheerio<AnyNode> => {
    const headingNode = $('h2, h3').filter((_, node) => normalizeText($(node).text())?.toLowerCase() === heading.toLowerCase()).first();
    if (!headingNode.length) return headingNode;
    const semanticSection = headingNode.closest('section');
    if (semanticSection.length) return semanticSection;
    return headingNode.parents().filter((_, node) => {
      const length = $(node).text().length;
      return length > heading.length && length < 2_000;
    }).first();
  };
  const text = (selector: string): string | null => normalizeText($(selector).first().text());
  const aboutSection = section('about');
  const profileName = text('h1') ?? normalizeText($('main h2').filter((_, node) => {
    const value = normalizeText($(node).text());
    return Boolean(value && !/^\d+ notifications$/i.test(value));
  }).first().text());
  const header = $('main h2').filter((_, node) => normalizeText($(node).text()) === profileName).first().parents().filter((_, node) => {
    const length = $(node).text().length;
    return length > (profileName?.length ?? 0) && length < 300;
  }).first();
  const headerValues = header.find('div, span').map((_, node) => normalizeText($(node).text())).get().filter((value): value is string => Boolean(value));
  const headerTextNodes = header.find('*').contents().filter((_, node) => node.type === 'text').map((_, node) => normalizeText($(node).text())).get().filter((value): value is string => Boolean(value));
  const location = headerValues.find((value) => value.toLowerCase().includes('contact info'))?.replace(/\s*·\s*contact info.*$/i, '') ?? text('.text-body-small.inline.t-black--light, .pv-text-details__left-panel .text-body-small');
  const headline = headerTextNodes.find((value) => value !== profileName && !value.toLowerCase().includes('contact info') && value !== location && value.length < 160) ?? text('.text-body-medium, [data-generated-suggestion-target]');
  const headlineCandidate = headline && headline !== location && !headline.toLowerCase().includes('contact info') ? headline : headerValues.find((value) => value !== profileName && value !== location && !value.toLowerCase().includes('contact info') && value.length < 160) ?? null;
  const aboutText = normalizeText(aboutSection.text())?.replace(/^about\s*/i, '').replace(/\s*top skills.*$/i, '') ?? null;
  const parsedSkills = parseSkills(section('skills'), $);
  const embeddedSkills = normalizeText(aboutSection.text())?.match(/top skills\s*(.*)$/i)?.[1]?.split(/\s*•\s*/) ?? [];

  return {
    profile_url: profileUrl,
    name: profileName,
    headline: headlineCandidate,
    location,
    about: normalizeText(aboutSection.find('div.inline-show-more-text, span[aria-hidden="true"]').first().text()) ?? aboutText,
    profile_image_url: $('img[alt*="profile" i], img.pv-top-card-profile-picture__image, main img').first().attr('src') ?? null,
    experience: parseExperience(section('experience'), $),
    education: parseEducation(section('education'), $),
    skills: parsedSkills.length > 0 ? parsedSkills : dedupeStrings(embeddedSkills.map((value) => normalizeText(value)).filter((value): value is string => Boolean(value))),
    certifications: parseCertifications(section('licenses & certifications'), $),
    languages: parseLanguages(section('languages'), $)
  };
}

function valuesFromItem(item: AnyNode, $: CheerioAPI): string[] {
  return $(item).find('span[aria-hidden="true"], .t-14').map((_, child) => normalizeText($(child).text())).get().filter((value): value is string => Boolean(value));
}

function parseDateRange(value: string | undefined): { start: string | null; end: string | null } {
  if (!value) return { start: null, end: null };
  const [start, end] = value.split(/\s+-\s+/);
  return { start: normalizeDate(start), end: normalizeDate(end) };
}

function parseExperience(container: cheerio.Cheerio<AnyNode>, $: CheerioAPI): Experience[] {
  return container.find('li').map((_, node) => {
    const values = valuesFromItem(node, $);
    const range = parseDateRange(values.find((value) => /\b(19|20)\d{2}\b/.test(value)));
    return { title: values[0] ?? null, company: values[1] ?? null, location: values[2] ?? null, start_date: range.start, end_date: range.end, description: normalizeText($(node).find('.t-14.t-normal, .inline-show-more-text').text()) };
  }).get();
}

function parseEducation(container: cheerio.Cheerio<AnyNode>, $: CheerioAPI): Education[] {
  return container.find('li').map((_, node) => {
    const values = valuesFromItem(node, $);
    const range = parseDateRange(values.find((value) => /\b(19|20)\d{2}\b/.test(value)));
    return { school: values[0] ?? null, degree: values[1] ?? null, field_of_study: values[2] ?? null, start_date: range.start, end_date: range.end, description: normalizeText($(node).find('.t-14.t-normal, .inline-show-more-text').text()) };
  }).get();
}

function parseSkills(container: cheerio.Cheerio<AnyNode>, $: CheerioAPI): string[] {
  return dedupeStrings(container.find('li, span[aria-hidden="true"]').map((_, node) => normalizeText($(node).text())).get().filter((value): value is string => Boolean(value)));
}

function parseCertifications(container: cheerio.Cheerio<AnyNode>, $: CheerioAPI): Certification[] {
  return container.find('li').map((_, node) => {
    const values = valuesFromItem(node, $);
    return { name: values[0] ?? null, issuer: values[1] ?? null, issue_date: normalizeDate(values.find((value) => value.toLowerCase().includes('issued'))), expiration_date: normalizeDate(values.find((value) => value.toLowerCase().includes('expires'))), credential_id: normalizeText(values.find((value) => value.toLowerCase().includes('credential'))?.replace(/^credential id:?\s*/i, '')) };
  }).get();
}

function parseLanguages(container: cheerio.Cheerio<AnyNode>, $: CheerioAPI): Language[] {
  return container.find('li').map((_, node) => {
    const values = valuesFromItem(node, $);
    return { name: values[0] ?? null, proficiency: values[1] ?? null };
  }).get();
}
