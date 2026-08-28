# ProfileLens API

ProfileLens is a TypeScript REST API that turns an authorized LinkedIn profile URL into structured profile data.

## Status

The local API is implemented and tested with Fastify, Playwright, Cheerio, Zod, Vitest, OpenAPI, Docker, and Render configuration. Live LinkedIn extraction requires an authorized account and remains subject to LinkedIn session expiry, page changes, access settings, and security challenges.

## Local setup

Requirements: Node.js 20 LTS or newer within the supported major range.

```bash
npm install
npm run build
npm test
npm run dev
```

The service listens on `http://127.0.0.1:3000` by default.

Profile extraction requires a Chromium installation and authorized LinkedIn credentials. Install the browser with `npx playwright install chromium`, then put credentials only in `.env` or the deployment provider's secret environment variables. The service does not bypass CAPTCHA, MFA, checkpoints, or other LinkedIn security controls.

The server uses only `LINKEDIN_EMAIL` and `LINKEDIN_PASSWORD`. Authentication state is kept in RAM only: the browser context is reused while valid, and normal expiry triggers one automatic context recreation and login retry. CAPTCHA, MFA, checkpoints, and authwalls are returned as controlled errors and are not bypassed.

## API

`GET /v1/profile?url=https://www.linkedin.com/in/example/` and `POST /v1/profile` with `{ "url": "https://www.linkedin.com/in/example/" }` return normalized profile data. Interactive documentation is available at `/docs`; the OpenAPI document is available at `/openapi.json`.

## Deployment

1. Create a public GitHub repository and push this project.
2. In Render, create a new Web Service from the repository and choose Docker.
3. Set `LINKEDIN_EMAIL` and `LINKEDIN_PASSWORD` as Render secret environment variables. Do not put them in `render.yaml`.
4. Set the health check path to `/health` and deploy.

Render may sleep free services when idle. The first request after sleep can be slow, and LinkedIn may require the account to complete verification again. The service reports that condition as `AUTHENTICATION_CHALLENGE`; it does not bypass it.

The provider supports name, headline, location, about, profile image, experience, education, skills, certifications, and languages when those sections are available in the rendered authorized profile page. LinkedIn can change its page structure or access policy, so live extraction remains an external dependency.

## Environment

Copy `.env.example` to `.env` and adjust values if needed. Never commit credentials, cookies, or session state.
