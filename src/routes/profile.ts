import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { canonicalizeLinkedInUrl } from '../utils/linkedin-url.js';
import { profileResponseSchema } from '../schemas/profile.schema.js';
import { toAppError } from '../utils/errors.js';
import type { ProfileService } from '../services/profile.service.js';

export function registerProfileRoutes(app: FastifyInstance, service: ProfileService, rateLimit: { max: number; timeWindow: number }): void {
  const commonSchema = { tags: ['profile'] };
  const querySchema = {
      type: 'object',
      properties: { url: { type: 'string', maxLength: 2048, format: 'uri' } },
      required: ['url'],
      additionalProperties: false
  };
  const bodySchema = {
      type: 'object',
      properties: { url: { type: 'string', maxLength: 2048, format: 'uri' } },
      required: ['url'],
      additionalProperties: false
  };

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { url?: string } | undefined;
    const body = request.body as { url?: string } | undefined;
    const input = { url: query?.url ?? body?.url };
    try {
      if (!input?.url) {
        return reply.code(400).send({ error: { code: 'INVALID_PROFILE_URL', message: 'The url value is required.', request_id: request.id } });
      }
      const url = canonicalizeLinkedInUrl(input.url);
      const result = await service.fetch(url);
      return reply.send(profileResponseSchema.parse({ data: result.profile, meta: { source: 'linkedin', schema_version: '1.0', cached: result.cached, fetched_at: new Date().toISOString() } }));
    } catch (error) {
      const appError = toAppError(error);
      if (appError.details) request.log.warn({ event: 'linkedin_auth_diagnostic', ...appError.details }, appError.message);
      return reply.code(appError.statusCode).send({ error: { code: appError.code, message: appError.message, request_id: request.id } });
    }
  };

  app.get('/v1/profile', {
    config: { rateLimit },
    schema: { ...commonSchema, querystring: querySchema }
  }, handler);

  app.post('/v1/profile', {
    config: { rateLimit },
    schema: { ...commonSchema, body: bodySchema }
  }, handler);
}
