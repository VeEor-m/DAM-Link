import Fastify from 'fastify';
import type { App } from './types.js';
import { loadConfig } from './config.js';
import { logger } from './lib/logger.js';
import { registerRequestId } from './plugins/request-id.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerCors } from './plugins/cors.js';
import { registerHelmet } from './plugins/helmet.js';
import { registerSentry } from './plugins/sentry.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerHealth } from './plugins/health.js';
import { registerPingRoute } from './routes/v1/ping.route.js';

export async function buildApp(): Promise<App> {
  const app: App = Fastify({
    loggerInstance: logger,
    genReqId: () => crypto.randomUUID(),
    disableRequestLogging: false,
    trustProxy: true,
  });

  await registerRequestId(app);
  await registerSentry(app);
  await registerErrorHandler(app);
  await registerHelmet(app);
  await registerCors(app);
  await registerSwagger(app);
  await registerHealth(app);
  await registerPingRoute(app);

  return app;
}

async function main() {
  const config = loadConfig();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.API_HOST, port: config.API_PORT });
  } catch (err) {
    app.log.error(err, 'failed to start');
    process.exit(1);
  }
}

// Run when invoked directly (not when imported by tests).
const isMainModule = import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`;
if (isMainModule) {
  void main();
}
