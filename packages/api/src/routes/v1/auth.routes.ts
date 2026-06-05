import type { App } from '../../types.js';
import {
  RegisterInputSchema,
  LoginInputSchema,
} from '@dam-link/contracts';
import {
  registerUser,
  loginUser,
  logoutUser,
} from '../../services/auth.service.js';
import { listOrgsForUser } from '../../services/orgs.service.js';
import {
  readSessionCookie,
  setSessionCookie,
  clearSessionCookie,
  toPublicSession,
} from '../../lib/sessions.js';
import { RATE_TIERS } from '../../plugins/rate-limit.js';
import { AppError } from '../../plugins/error-handler.js';

function toPublicUser(u: { id: string; email: string; displayName: string; createdAt: Date }) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    createdAt: u.createdAt.toISOString(),
  };
}

// JSON-schema response objects (Zod fails on Fastify response schema serialisation).
// Keep schemas flat — fast-json-stringify has limited support for nested `required`.
const AuthSuccessResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: {
        user: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, format: 'uuid' },
            email: { type: 'string' as const, format: 'email' },
            displayName: { type: 'string' as const },
            createdAt: { type: 'string' as const, format: 'date-time' },
          },
        },
        session: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const },
            userId: { type: 'string' as const, format: 'uuid' },
            createdAt: { type: 'string' as const, format: 'date-time' },
            expiresAt: { type: 'string' as const, format: 'date-time' },
            lastSeenAt: { type: 'string' as const, format: 'date-time' },
            userAgent: { type: ['string', 'null'] as const },
            ip: { type: ['string', 'null'] as const },
          },
        },
      },
    },
  },
  required: ['data'],
};

const MeResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: {
        user: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, format: 'uuid' },
            email: { type: 'string' as const, format: 'email' },
            displayName: { type: 'string' as const },
            createdAt: { type: 'string' as const, format: 'date-time' },
          },
        },
        orgs: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const, format: 'uuid' },
              name: { type: 'string' as const },
              slug: { type: 'string' as const },
              role: { type: 'string' as const, enum: ['owner', 'editor', 'viewer'] },
            },
          },
        },
      },
    },
  },
  required: ['data'],
};

export async function registerAuthRoutes(app: App): Promise<void> {
  // POST /api/v1/auth/register
  app.post(
    '/api/v1/auth/register',
    {
      schema: {
        body: RegisterInputSchema,
        response: { 200: AuthSuccessResponseSchema },
        tags: ['auth'],
        summary: 'Register a new user and create a session',
      },
      config: { rateLimit: RATE_TIERS.auth },
    },
    async (req, reply) => {
      const body = RegisterInputSchema.parse(req.body);
      const { user, session } = await registerUser({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
        turnstileToken: body.turnstileToken,
        remoteIp: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      setSessionCookie(reply, session.id);
      return { data: { user: toPublicUser(user), session: toPublicSession(session) } };
    },
  );

  // POST /api/v1/auth/login
  app.post(
    '/api/v1/auth/login',
    {
      schema: {
        body: LoginInputSchema,
        response: { 200: AuthSuccessResponseSchema },
        tags: ['auth'],
        summary: 'Log in with email + password',
      },
      config: { rateLimit: RATE_TIERS.auth },
    },
    async (req, reply) => {
      const body = LoginInputSchema.parse(req.body);
      const { user, session } = await loginUser({
        email: body.email,
        password: body.password,
        turnstileToken: body.turnstileToken,
        remoteIp: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      setSessionCookie(reply, session.id);
      return { data: { user: toPublicUser(user), session: toPublicSession(session) } };
    },
  );

  // POST /api/v1/auth/logout
  app.post(
    '/api/v1/auth/logout',
    {
      schema: {
        response: { 204: { type: 'null' } },
        tags: ['auth'],
        summary: 'Log out the current session',
      },
    },
    async (req, reply) => {
      const sessionId = readSessionCookie(req);
      if (sessionId) {
        await logoutUser(sessionId);
      }
      clearSessionCookie(reply);
      return reply.status(204).send();
    },
  );

  // GET /api/v1/auth/me
  app.get(
    '/api/v1/auth/me',
    {
      schema: {
        response: { 200: MeResponseSchema },
        tags: ['auth'],
        summary: 'Get the current user (and their orgs)',
      },
    },
    async (req) => {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Not logged in');
      }
      const orgs = await listOrgsForUser(req.user.id);
      return {
        data: {
          user: toPublicUser(req.user),
          orgs: orgs.map(({ org, role }) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            role,
          })),
        },
      };
    },
  );
}
