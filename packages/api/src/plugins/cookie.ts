import type { App } from '../types.js';
import cookie from '@fastify/cookie';
import { loadConfig } from '../config.js';

export async function registerCookie(app: App): Promise<void> {
  const config = loadConfig();
  await app.register(cookie, {
    secret: config.SESSION_COOKIE_SECRET, // for signed cookies if used later
  });
}
