import type { App } from '../types.js';
import cors from '@fastify/cors';
import { loadConfig } from '../config.js';

export async function registerCors(app: App): Promise<void> {
  const config = loadConfig();
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
}
