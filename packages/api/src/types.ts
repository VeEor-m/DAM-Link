// Augment FastifyRequest with our custom context. Populated by plugins later.
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by request-id plugin. */
    requestId: string;
  }
}

// Concrete Fastify instance type produced by buildApp(). Plugins accept this
// exact type so that the logger type (pino's Logger) lines up without `any`.
import type {
  FastifyInstance,
  FastifyTypeProviderDefault,
  RawServerDefault,
} from 'fastify';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';

export type App = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  Logger<never, boolean>,
  FastifyTypeProviderDefault
>;
