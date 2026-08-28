import type { FastifyInstance } from 'fastify';

const serviceVersion = '0.1.0';

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { schema: { tags: ['system'] } }, async () => ({
    name: 'ProfileLens API',
    version: serviceVersion,
    status: 'running',
    docs: '/docs',
    health: '/health'
  }));

  app.get('/health', { schema: { tags: ['system'] } }, async () => ({
    status: 'ok',
    version: serviceVersion
  }));

  app.get('/openapi.json', async () => app.swagger());
}
