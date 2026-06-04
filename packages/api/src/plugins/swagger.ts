import type { App } from '../types.js';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadConfig } from '../config.js';

export async function registerSwagger(app: App): Promise<void> {
  const config = loadConfig();

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'DAM-Link API',
        version: '0.0.0',
        description: 'Multi-tenant Digital Asset Management API',
      },
      servers: [{ url: config.API_PUBLIC_URL }],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: config.SESSION_COOKIE_NAME,
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  app.get('/openapi.json', async () => app.swagger());
}
