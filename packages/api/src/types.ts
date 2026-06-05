// Augment FastifyRequest with our custom context. Populated by plugins later.
import 'fastify';
import type { User, Org } from './db/schema.js';
import type { Role } from '@dam-link/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by request-id plugin. */
    requestId: string;
    /** Populated by auth plugin. Null when the request is unauthenticated. */
    user: User | null;
    /** Populated by the org-context plugin for /orgs/:orgId/... routes. */
    orgContext: { org: Org; role: Role } | null;
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
