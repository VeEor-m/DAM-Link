import { buildApp as buildAppImpl } from '../../src/server.js';
import type { App } from '../../src/types.js';
import { applyTestEnv } from './env.js';

export async function buildApp(): Promise<App> {
  applyTestEnv();
  const app = await buildAppImpl();
  await app.ready();
  return app;
}
