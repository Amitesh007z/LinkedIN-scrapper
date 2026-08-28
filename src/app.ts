import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import type { AppConfig } from './config/env.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerProfileRoutes } from './routes/profile.js';
import { LinkedInPlaywrightProvider } from './providers/linkedin.provider.js';
import { ProfileService } from './services/profile.service.js';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export function buildApp(config: AppConfig): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => `req_${crypto.randomUUID()}`
  });

  app.register(sensible);
  app.register(helmet);
  app.register(rateLimit, {
    global: false,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS
  });
  app.register(swagger, {
    openapi: {
      info: { title: 'ProfileLens API', version: '1.0.0', description: 'Authorized LinkedIn profile extraction API.' },
      servers: [{ url: 'http://127.0.0.1:3000' }]
    }
  });
  app.register(swaggerUi, { routePrefix: '/docs' });
  app.setErrorHandler((error, request, reply) => {
    const validationError = typeof error === 'object' && error !== null && 'validation' in error && error.validation;
    if (validationError) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_PROFILE_URL',
          message: 'The supplied profile request is invalid.',
          request_id: request.id
        }
      });
    }
    return reply.send(error);
  });
  app.register(registerSystemRoutes);
  const provider = new LinkedInPlaywrightProvider(config);
  app.register((instance) => registerProfileRoutes(instance, new ProfileService(provider, config.CACHE_TTL_SECONDS, config.MAX_CONCURRENT_SCRAPES), { max: config.RATE_LIMIT_MAX, timeWindow: config.RATE_LIMIT_WINDOW_MS }));
  app.addHook('onClose', async () => provider.close());

  return app;
}
