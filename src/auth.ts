import 'dotenv/config';
import { chromium } from 'playwright';
import { loadConfig } from './config/env.js';

const config = loadConfig({ ...process.env, BROWSER_HEADLESS: 'false' });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ locale: 'en-US' });
const page = await context.newPage();

console.log('A browser window is open. Complete LinkedIn login and any verification yourself.');
await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
await page.waitForURL((url) => !url.pathname.startsWith('/login') && !url.pathname.startsWith('/authwall'), { timeout: 5 * 60_000 });
await context.storageState({ path: config.LINKEDIN_STORAGE_STATE });
await browser.close();
console.log(`Authorized session saved to ${config.LINKEDIN_STORAGE_STATE}.`);
