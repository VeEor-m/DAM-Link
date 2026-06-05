import type { App } from '../types.js';
import helmet from '@fastify/helmet';

export async function registerHelmet(app: App): Promise<void> {
  await app.register(helmet, {
    // Swagger UI needs to load its own assets.
    contentSecurityPolicy: false,
  });
}
