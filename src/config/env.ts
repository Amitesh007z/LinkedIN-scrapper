import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LINKEDIN_EMAIL: z.string().optional(),
  LINKEDIN_PASSWORD: z.string().optional(),
  BROWSER_HEADLESS: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  PAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SCRAPE_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  MAX_CONCURRENT_SCRAPES: z.coerce.number().int().positive().default(1),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000)
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = envSchema.parse(env);
  const isLoopbackHost = config.HOST === 'localhost' || config.HOST === '127.0.0.1' || config.HOST === '::1';
  const isRender = env.RENDER === 'true' || Boolean(env.RENDER_EXTERNAL_HOSTNAME);
  return {
    ...config,
    HOST: (config.NODE_ENV === 'production' || isRender) && (config.HOST === undefined || isLoopbackHost)
      ? '0.0.0.0'
      : config.HOST ?? '127.0.0.1'
  };
}
