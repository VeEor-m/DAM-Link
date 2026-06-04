# DAM-Link Backend — Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement email+password authentication with server-side sessions in Postgres, HTTP-only cookies, CSRF protection, and Cloudflare Turnstile on register/login. End state: a user can register, log in, log out, and call `GET /api/v1/auth/me` to retrieve their profile.

**Architecture:** Sessions live in the `sessions` table created in Plan 1. The session ID is a 32-byte base64url token stored in an HttpOnly cookie. Fastify's `authPlugin` resolves the session on every request and decorates `req.user`. Passwords are hashed with Argon2id. CSRF is enforced via an `Origin` header check. Turnstile is verified server-side on register/login.

**Tech Stack:** argon2, @fastify/cookie, @fastify/rate-limit, zod. No new infrastructure.

---

## Plan 2 of 9 — Auth

- Password hashing library (Argon2id with sane cost params)
- Session token + lookup helpers
- Cookie plugin + session cookie
- CSRF protection plugin (Origin check)
- Rate limit plugin (tiered policy)
- Turnstile verification helper
- Auth routes: register, login, logout, /me
- Auth plugin (resolves session → req.user)
- Auth service (creates users, sessions; verifies Turnstile)
- Zod schemas in `packages/contracts` for all auth payloads
- Integration tests for the full flow
- Update OpenAPI spec

**Deferred to later plans:**
- `req.user` having memberships/orgs in its payload (Plan 3 adds that)
- Email verification (deferred to v2)
- Password reset (deferred to v2)
- 2FA (deferred to v2)

---

## File structure (this plan adds/modifies)

```
packages/contracts/src/
  auth.ts                              # NEW: register/login/me schemas
  index.ts                             # MODIFY: re-export auth

packages/api/src/
  lib/
    passwords.ts                       # NEW: Argon2id hash/verify
    sessions.ts                        # NEW: session token, cookie helpers
    turnstile.ts                       # NEW: verify server-side token
  plugins/
    cookie.ts                          # NEW: @fastify/cookie
    csrf.ts                            # NEW: Origin header check
    rate-limit.ts                      # NEW: tiered policy
    auth.ts                            # NEW: session → req.user
  services/
    auth.service.ts                    # NEW: register/login/logout
  repositories/
    users.repo.ts                      # NEW
    sessions.repo.ts                   # NEW
  routes/v1/
    auth.routes.ts                     # NEW
  server.ts                            # MODIFY: register new plugins/routes
  config.ts                            # MODIFY: add TURNSTILE_* fields already there
  types.ts                             # MODIFY: augment req.user

packages/api/tests/
  auth.test.ts                         # NEW
  helpers/
    build-app.ts                       # MODIFY: include cookie clear on logout
```

---

## Task 1: Add auth schemas to contracts

**Files:**
- Create: `packages/contracts/src/auth.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/tests/auth.test.ts`

- [ ] **Step 1.1: Write `packages/contracts/src/auth.ts`**

```ts
import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

/** Password rules: 8-128 chars, at least one letter and one digit. */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((s) => /[A-Za-z]/.test(s), 'Password must contain a letter')
  .refine((s) => /\d/.test(s), 'Password must contain a digit');
export type Password = z.infer<typeof PasswordSchema>;

/** Public user shape (no password hash, no internal fields). */
export const PublicUserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  displayName: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

/** Public session shape. */
export const PublicSessionSchema = z.object({
  id: z.string(), // session token
  userId: IdSchema,
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
});
export type PublicSession = z.infer<typeof PublicSessionSchema>;

/** Register body. */
export const RegisterInputSchema = z.object({
  email: z.string().email().max(254),
  password: PasswordSchema,
  displayName: z.string().min(1).max(80),
  turnstileToken: z.string().min(1).optional(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

/** Login body. */
export const LoginInputSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  turnstileToken: z.string().min(1).optional(),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** Register/Login response: returns the session token (caller sets cookie) and user. */
export const AuthSuccessSchema = z.object({
  user: PublicUserSchema,
  session: PublicSessionSchema,
});
export type AuthSuccess = z.infer<typeof AuthSuccessSchema>;

/** /me response: user plus the list of orgs the user belongs to (Plan 3 fills this in). */
export const MeResponseSchema = z.object({
  user: PublicUserSchema,
  orgs: z.array(
    z.object({
      id: IdSchema,
      name: z.string(),
      slug: z.string(),
      role: z.enum(['owner', 'editor', 'viewer']),
    }),
  ),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
```

- [ ] **Step 1.2: Modify `packages/contracts/src/index.ts`**

Add `export * from './auth.js';` to the existing exports.

- [ ] **Step 1.3: Write `packages/contracts/tests/auth.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  PasswordSchema,
  RegisterInputSchema,
  LoginInputSchema,
} from '../src/auth.js';

describe('PasswordSchema', () => {
  it('accepts a valid password', () => {
    expect(PasswordSchema.parse('hunter2pass')).toBe('hunter2pass');
  });

  it('rejects too-short', () => {
    expect(() => PasswordSchema.parse('Abc1')).toThrow();
  });

  it('rejects no digit', () => {
    expect(() => PasswordSchema.parse('onlyletters')).toThrow();
  });

  it('rejects no letter', () => {
    expect(() => PasswordSchema.parse('12345678')).toThrow();
  });
});

describe('RegisterInputSchema', () => {
  it('accepts a valid registration', () => {
    const parsed = RegisterInputSchema.parse({
      email: 'alice@example.com',
      password: 'hunter2pass',
      displayName: 'Alice',
    });
    expect(parsed.email).toBe('alice@example.com');
  });

  it('rejects bad email', () => {
    expect(() =>
      RegisterInputSchema.parse({
        email: 'not-an-email',
        password: 'hunter2pass',
        displayName: 'Alice',
      }),
    ).toThrow();
  });

  it('accepts an optional turnstile token', () => {
    const parsed = RegisterInputSchema.parse({
      email: 'alice@example.com',
      password: 'hunter2pass',
      displayName: 'Alice',
      turnstileToken: 'turnstile-blob',
    });
    expect(parsed.turnstileToken).toBe('turnstile-blob');
  });
});

describe('LoginInputSchema', () => {
  it('accepts a valid login', () => {
    const parsed = LoginInputSchema.parse({
      email: 'alice@example.com',
      password: 'hunter2pass',
    });
    expect(parsed.password).toBe('hunter2pass');
  });

  it('accepts a wrong-but-non-empty password (no policy on login)', () => {
    // The login schema only checks "non-empty" so a wrong password
    // is a credential check, not a validation error.
    expect(() =>
      LoginInputSchema.parse({ email: 'alice@example.com', password: 'x' }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 1.4: Run tests**

Run: `pnpm --filter @dam-link/contracts test`
Expected: 3 new test groups pass; total now ~11.

- [ ] **Step 1.5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add auth schemas (password, register, login, me)"
```

---

## Task 2: Add `argon2` and `@fastify/cookie` to api package

**Files:**
- Modify: `packages/api/package.json`

- [ ] **Step 2.1: Add runtime dependencies**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm --filter @dam-link/api add argon2@0.41.1 @fastify/cookie@11.0.1 @fastify/rate-limit@10.1.1
```

- [ ] **Step 2.2: Verify the lockfile updated**

Run: `git diff packages/api/package.json | head -30`
Expected: shows argon2, @fastify/cookie, @fastify/rate-limit added to dependencies.

- [ ] **Step 2.3: Re-install to make sure the deps actually resolved**

Run: `pnpm install`
Expected: no errors, no peer warnings about argon2 (it has none).

- [ ] **Step 2.4: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add argon2, @fastify/cookie, @fastify/rate-limit"
```

---

## Task 3: Password hashing library (Argon2id)

**Files:**
- Create: `packages/api/src/lib/passwords.ts`
- Create: `packages/api/tests/passwords.test.ts`

- [ ] **Step 3.1: Write the failing test**

Write `packages/api/tests/passwords.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/passwords.js';

describe('hashPassword', () => {
  it('produces an argon2id hash that starts with $argon2id$', async () => {
    const hash = await hashPassword('hunter2pass');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('produces a unique hash for the same input (salted)', async () => {
    const a = await hashPassword('hunter2pass');
    const b = await hashPassword('hunter2pass');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('hunter2pass');
    expect(await verifyPassword(hash, 'hunter2pass')).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('hunter2pass');
    expect(await verifyPassword(hash, 'wrongpass')).toBe(false);
  });

  it('returns false for malformed hash without throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails (red)**

Run: `pnpm --filter @dam-link/api test tests/passwords.test.ts`
Expected: FAIL — `passwords.ts` doesn't exist.

- [ ] **Step 3.3: Implement `passwords.ts`**

Write `packages/api/src/lib/passwords.ts`:
```ts
import argon2 from 'argon2';

/**
 * Argon2id cost parameters. Tuned for ~250ms on a modern server.
 * memoryCost 64MB, timeCost 3, parallelism 4 (OWASP 2024 recommendation).
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 3.4: Run the test to verify it passes (green)**

Run: `pnpm --filter @dam-link/api test tests/passwords.test.ts`
Expected: 5 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add packages/api/src/lib/passwords.ts packages/api/tests/passwords.test.ts
git commit -m "feat(api): argon2id password hashing (lib/passwords)"
```

---

## Task 4: Session token + cookie helpers

**Files:**
- Create: `packages/api/src/lib/sessions.ts`
- Create: `packages/api/src/repositories/sessions.repo.ts`
- Create: `packages/api/src/repositories/users.repo.ts`
- Create: `packages/api/tests/sessions.repo.test.ts`

- [ ] **Step 4.1: Write the user repository**

Write `packages/api/src/repositories/users.repo.ts`:
```ts
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, type User, type NewUser } from '../db/schema.js';

export async function findUserById(id: string): Promise<User | null> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUser(input: NewUser): Promise<User> {
  const db = getDb();
  const [row] = await db.insert(users).values(input).returning();
  if (!row) throw new Error('createUser: insert returned no rows');
  return row;
}
```

- [ ] **Step 4.2: Write the session repository**

Write `packages/api/src/repositories/sessions.repo.ts`:
```ts
import { and, eq, gte, lt } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { sessions, type Session, type NewSession } from '../db/schema.js';

export async function findSessionById(id: string): Promise<Session | null> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), gte(sessions.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSession(input: NewSession): Promise<Session> {
  const db = getDb();
  const [row] = await db.insert(sessions).values(input).returning();
  if (!row) throw new Error('createSession: insert returned no rows');
  return row;
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function touchSession(id: string): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
}

export async function purgeExpiredSessions(): Promise<number> {
  const db = getDb();
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return result.rowCount ?? 0;
}
```

- [ ] **Step 4.3: Write the session helpers**

Write `packages/api/src/lib/sessions.ts`:
```ts
import { loadConfig } from '../config.js';
import { newToken } from './ids.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Session } from '../db/schema.js';

const config = loadConfig();

/** Generate a new session ID (32 random bytes, base64url). */
export const newSessionId = (): string => newToken(32);

/** Compute the expiry timestamp for a new session. */
export function newSessionExpiry(): Date {
  const days = config.SESSION_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Cookie options used when setting/clearing the session cookie. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.NODE_ENV === 'production',
    path: '/',
    maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(config.SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.SESSION_COOKIE_NAME, sessionCookieOptions());
}

export function readSessionCookie(req: FastifyRequest): string | null {
  const raw = req.cookies[config.SESSION_COOKIE_NAME];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** Map a DB session row to the public-facing shape (no internal fields). */
export function toPublicSession(s: Session) {
  return {
    id: s.id,
    userId: s.userId,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    userAgent: s.userAgent ?? null,
    ip: s.ip ?? null,
  };
}
```

- [ ] **Step 4.4: Write the session repo integration test**

Write `packages/api/tests/sessions.repo.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { createUser } from '../src/repositories/users.repo.js';
import {
  createSession,
  findSessionById,
  deleteSession,
  touchSession,
  purgeExpiredSessions,
} from '../src/repositories/sessions.repo.js';
import { newSessionId, newSessionExpiry } from '../src/lib/sessions.js';

describe('sessions repo', () => {
  beforeAll(async () => {
    // globalSetup already ran; this just ensures connections are warm.
  });

  afterAll(async () => {
    await closeDb();
    await closeS3();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  it('creates and finds a session', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    const id = newSessionId();
    const session = await createSession({
      id,
      userId: user.id,
      expiresAt: newSessionExpiry(),
      userAgent: 'jest',
      ip: '127.0.0.1',
    });
    expect(session.id).toBe(id);

    const found = await findSessionById(id);
    expect(found).not.toBeNull();
    expect(found?.userId).toBe(user.id);
  });

  it('does not return expired sessions', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    const id = newSessionId();
    await createSession({
      id,
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    expect(await findSessionById(id)).toBeNull();
  });

  it('touches lastSeenAt', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    const id = newSessionId();
    await createSession({
      id,
      userId: user.id,
      expiresAt: newSessionExpiry(),
    });
    const before = (await findSessionById(id))!.lastSeenAt;
    await new Promise((r) => setTimeout(r, 10));
    await touchSession(id);
    const after = (await findSessionById(id))!.lastSeenAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('deletes a session', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    const id = newSessionId();
    await createSession({ id, userId: user.id, expiresAt: newSessionExpiry() });
    await deleteSession(id);
    expect(await findSessionById(id)).toBeNull();
  });

  it('purges expired sessions', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    await createSession({
      id: newSessionId(),
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    await createSession({
      id: newSessionId(),
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const purged = await purgeExpiredSessions();
    expect(purged).toBe(2);
  });
});
```

- [ ] **Step 4.5: Run the test (red → green in one shot since we wrote it before the impl)**

Run: `pnpm --filter @dam-link/api test tests/sessions.repo.test.ts`
Expected: 5 tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add packages/api/src/repositories packages/api/src/lib/sessions.ts packages/api/tests/sessions.repo.test.ts
git commit -m "feat(api): user + session repos and session cookie helpers"
```

---

## Task 5: Turnstile verification helper

**Files:**
- Create: `packages/api/src/lib/turnstile.ts`
- Create: `packages/api/tests/turnstile.test.ts`

- [ ] **Step 5.1: Write the failing test**

Write `packages/api/tests/turnstile.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstile } from '../src/lib/turnstile.js';

describe('verifyTurnstile', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it('returns true when Turnstile responds success=true', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await verifyTurnstile('token', '127.0.0.1')).toBe(true);
  });

  it('returns false when Turnstile responds success=false', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input'] }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    expect(await verifyTurnstile('token', '127.0.0.1')).toBe(false);
  });

  it('returns false and logs when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile('token', '127.0.0.1')).toBe(false);
  });

  it('skips verification when TURNSTILE_SECRET_KEY is unset (dev mode)', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    expect(await verifyTurnstile('token', '127.0.0.1')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Run the test to verify it fails**

Run: `pnpm --filter @dam-link/api test tests/turnstile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement `turnstile.ts`**

Write `packages/api/src/lib/turnstile.ts`:
```ts
import { loadConfig } from '../config.js';
import { logger } from './logger.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verifies a Turnstile token with Cloudflare's siteverify endpoint.
 * Returns false on any error (network, parse, missing key) — never throws.
 *
 * If TURNSTILE_SECRET_KEY is not configured (dev / test), verification is
 * skipped and the function returns true. This lets developers run locally
 * without setting up a Turnstile widget.
 */
export async function verifyTurnstile(
  token: string,
  remoteIp: string | null,
): Promise<boolean> {
  const config = loadConfig();
  if (!config.TURNSTILE_SECRET_KEY) {
    return true;
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', config.TURNSTILE_SECRET_KEY);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'turnstile: non-200 response');
      return false;
    }

    const json = (await res.json()) as TurnstileResponse;
    if (!json.success) {
      logger.warn({ errors: json['error-codes'] }, 'turnstile: rejected');
    }
    return json.success;
  } catch (err) {
    logger.error({ err }, 'turnstile: verification threw');
    return false;
  }
}
```

- [ ] **Step 5.4: Run the test to verify it passes**

Run: `pnpm --filter @dam-link/api test tests/turnstile.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add packages/api/src/lib/turnstile.ts packages/api/tests/turnstile.test.ts
git commit -m "feat(api): turnstile verification helper with dev-mode skip"
```

---

## Task 6: Cookie plugin, CSRF plugin, Rate-limit plugin

**Files:**
- Create: `packages/api/src/plugins/cookie.ts`
- Create: `packages/api/src/plugins/csrf.ts`
- Create: `packages/api/src/plugins/rate-limit.ts`

- [ ] **Step 6.1: Write `cookie.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { loadConfig } from '../config.js';

export async function registerCookie(app: FastifyInstance): Promise<void> {
  const config = loadConfig();
  await app.register(cookie, {
    secret: config.SESSION_COOKIE_SECRET, // for signed cookies if used later
  });
}
```

- [ ] **Step 6.2: Write `csrf.ts` (Origin header check)**

```ts
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config.js';
import { AppError } from './error-handler.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Simple CSRF defence: reject non-safe cross-origin requests.
 * The browser sends Origin on POST/PATCH/DELETE; we compare it against
 * WEB_ORIGIN. Requests with no Origin header (e.g. server-to-server)
 * are allowed but should be combined with token-based auth (Plan 9).
 */
export async function registerCsrf(app: FastifyInstance): Promise<void> {
  const config = loadConfig();
  const expected = new URL(config.WEB_ORIGIN).origin;

  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return; // no Origin header (e.g. native clients) — allow
    if (origin !== expected) {
      throw new AppError(403, 'CSRF_FORBIDDEN', 'Cross-origin request rejected');
    }
  });
}
```

- [ ] **Step 6.3: Write `rate-limit.ts` (tiered policy)**

```ts
import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

const TIER_AUTH = { max: 5, timeWindow: '1 minute' };
const TIER_UPLOAD = { max: 60, timeWindow: '1 minute' };
const TIER_GENERAL = { max: 300, timeWindow: '1 minute' };

/**
 * Default global rate limit + tier overrides.
 * Apply tier overrides per-route via `config.rateLimit`.
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    ...TIER_GENERAL,
    keyGenerator: (req) => req.ip,
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'retry-after': true },
  });
}

export const RATE_TIERS = {
  auth: TIER_AUTH,
  upload: TIER_UPLOAD,
  general: TIER_GENERAL,
};
```

- [ ] **Step 6.4: Commit**

```bash
git add packages/api/src/plugins/cookie.ts packages/api/src/plugins/csrf.ts packages/api/src/plugins/rate-limit.ts
git commit -m "feat(api): cookie, csrf (origin check), tiered rate-limit plugins"
```

---

## Task 7: Auth plugin (session → req.user)

**Files:**
- Create: `packages/api/src/plugins/auth.ts`
- Modify: `packages/api/src/types.ts`

- [ ] **Step 7.1: Augment `types.ts`**

Replace `packages/api/src/types.ts` with:
```ts
import 'fastify';
import type { User } from './db/schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by request-id plugin. */
    requestId: string;
    /** Populated by auth plugin. Null when the request is unauthenticated. */
    user: User | null;
  }
}
```

- [ ] **Step 7.2: Write `auth.ts`**

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readSessionCookie } from '../lib/sessions.js';
import { findSessionById } from '../repositories/sessions.repo.js';
import { findUserById } from '../repositories/users.repo.js';
import { touchSession } from '../repositories/sessions.repo.js';

/**
 * Resolves the session cookie to a user. Mutates req.user.
 * Does NOT enforce authentication — routes that require auth should
 * use the `requireUser` preHandler. The auth flow tests will add that
 * preHandler in Plan 3.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  // Default req.user to null so routes can check it.
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    req.user = null;
    const sessionId = readSessionCookie(req);
    if (!sessionId) return;

    const session = await findSessionById(sessionId);
    if (!session) return;

    const user = await findUserById(session.userId);
    if (!user) return;

    req.user = user;
    // Touch last-seen asynchronously; don't block the request.
    void touchSession(sessionId);
  });
}

/** Throws AppError(401) if req.user is null. Use as a preHandler. */
export function requireUser(this: void, req: FastifyRequest): void {
  if (!req.user) {
    throw new (require('./error-handler.js') as typeof import('./error-handler.js') ).AppError(
      401,
      'UNAUTHENTICATED',
      'Authentication required',
    );
  }
}
```

- [ ] **Step 7.3: Typecheck (expect AppError import issue — fix by importing at the top)**

Edit `packages/api/src/plugins/auth.ts` to use a top-level import for AppError:
```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readSessionCookie } from '../lib/sessions.js';
import {
  findSessionById,
  touchSession,
} from '../repositories/sessions.repo.js';
import { findUserById } from '../repositories/users.repo.js';
import { AppError } from './error-handler.js';

/**
 * Resolves the session cookie to a user. Mutates req.user.
 * Does NOT enforce authentication — routes that require auth should
 * use the `requireUser` preHandler.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    req.user = null;
    const sessionId = readSessionCookie(req);
    if (!sessionId) return;

    const session = await findSessionById(sessionId);
    if (!session) return;

    const user = await findUserById(session.userId);
    if (!user) return;

    req.user = user;
    void touchSession(sessionId);
  });
}

export function requireUser(this: void, req: FastifyRequest): void {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
}
```

- [ ] **Step 6.4: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add packages/api/src/plugins/auth.ts packages/api/src/types.ts
git commit -m "feat(api): auth plugin resolves session cookie to req.user"
```

---

## Task 8: Auth service + register/login/logout/me routes

**Files:**
- Create: `packages/api/src/services/auth.service.ts`
- Create: `packages/api/src/routes/v1/auth.routes.ts`
- Modify: `packages/api/src/server.ts`

- [ ] **Step 8.1: Write `auth.service.ts`**

```ts
import { z } from 'zod';
import { AppError } from '../plugins/error-handler.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import {
  createSession,
  deleteSession,
  findSessionById,
} from '../repositories/sessions.repo.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
} from '../repositories/users.repo.js';
import {
  newSessionId,
  newSessionExpiry,
  toPublicSession,
} from '../lib/sessions.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { logger } from '../lib/logger.js';
import type { User, Session } from '../db/schema.js';

const EMAIL_IN_USE_MESSAGE = 'Email already registered';

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  turnstileToken?: string;
  remoteIp: string | null;
  userAgent: string | null;
}): Promise<{ user: User; session: Session }> {
  const email = input.email.toLowerCase();

  if (input.turnstileToken) {
    const ok = await verifyTurnstile(input.turnstileToken, input.remoteIp);
    if (!ok) throw new AppError(400, 'TURNSTILE_FAILED', 'Bot check failed');
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    // Constant message to prevent user enumeration.
    throw new AppError(409, 'EMAIL_IN_USE', EMAIL_IN_USE_MESSAGE);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    email,
    passwordHash,
    displayName: input.displayName,
  });

  const session = await createSession({
    id: newSessionId(),
    userId: user.id,
    expiresAt: newSessionExpiry(),
    userAgent: input.userAgent,
    ip: input.remoteIp,
  });

  logger.info({ userId: user.id }, 'user registered');
  return { user, session };
}

export async function loginUser(input: {
  email: string;
  password: string;
  turnstileToken?: string;
  remoteIp: string | null;
  userAgent: string | null;
}): Promise<{ user: User; session: Session }> {
  const email = input.email.toLowerCase();

  if (input.turnstileToken) {
    const ok = await verifyTurnstile(input.turnstileToken, input.remoteIp);
    if (!ok) throw new AppError(400, 'TURNSTILE_FAILED', 'Bot check failed');
  }

  const user = await findUserByEmail(email);
  if (!user) {
    // Run a dummy hash to make timing roughly equal.
    await verifyPassword(
      '$argon2id$v=19$m=65536,t=3,p=4$YWFhYWFhYWFhYWFhYWFhYQ$8c1G4xV7r5e8W8o7I0wTl2u5xZ4K8yC8Q4m3Z4q7R8M',
      input.password,
    );
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const session = await createSession({
    id: newSessionId(),
    userId: user.id,
    expiresAt: newSessionExpiry(),
    userAgent: input.userAgent,
    ip: input.remoteIp,
  });

  logger.info({ userId: user.id }, 'user logged in');
  return { user, session };
}

export async function logoutUser(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
  logger.info({ sessionIdPrefix: sessionId.slice(0, 8) }, 'user logged out');
}

/** Read the current user from a session ID. Returns null if invalid/expired. */
export async function getUserFromSessionId(
  sessionId: string,
): Promise<{ user: User; session: Session } | null> {
  const session = await findSessionById(sessionId);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  return { user, session };
}
```

- [ ] **Step 8.2: Write `auth.routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  RegisterInputSchema,
  LoginInputSchema,
  PublicUserSchema,
  MeResponseSchema,
} from '@dam-link/contracts';
import {
  registerUser,
  loginUser,
  logoutUser,
  getUserFromSessionId,
} from '../../services/auth.service.js';
import { readSessionCookie, setSessionCookie, clearSessionCookie, toPublicSession } from '../../lib/sessions.js';
import { requireUser } from '../../plugins/auth.js';
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

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/register
  app.post(
    '/api/v1/auth/register',
    {
      schema: {
        body: RegisterInputSchema,
        response: { 200: z.object({ data: z.object({ user: PublicUserSchema, session: z.object({ id: z.string() }) }) }) },
        tags: ['auth'],
        summary: 'Register a new user and create a session',
      },
      config: { rateLimit: RATE_TIERS.auth },
    },
    async (req, reply) => {
      const { user, session } = await registerUser({
        email: req.body.email,
        password: req.body.password,
        displayName: req.body.displayName,
        turnstileToken: req.body.turnstileToken,
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
        response: { 200: z.object({ data: z.object({ user: PublicUserSchema, session: z.object({ id: z.string() }) }) }) },
        tags: ['auth'],
        summary: 'Log in with email + password',
      },
      config: { rateLimit: RATE_TIERS.auth },
    },
    async (req, reply) => {
      const { user, session } = await loginUser({
        email: req.body.email,
        password: req.body.password,
        turnstileToken: req.body.turnstileToken,
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
        response: { 204: z.null() },
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
        response: { 200: z.object({ data: MeResponseSchema }) },
        tags: ['auth'],
        summary: 'Get the current user (and their orgs)',
      },
    },
    async (req) => {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Not logged in');
      }
      // orgs filled in by Plan 3
      return {
        data: {
          user: toPublicUser(req.user),
          orgs: [],
        },
      };
    },
  );
}
```

- [ ] **Step 8.3: Register everything in `server.ts`**

Edit `packages/api/src/server.ts` to add these imports and registrations inside `buildApp`:
```ts
import { registerCookie } from './plugins/cookie.js';
import { registerCsrf } from './plugins/csrf.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerAuth } from './plugins/auth.js';
import { registerAuthRoutes } from './routes/v1/auth.routes.js';
// ... inside buildApp, after registerHealth(app):
await registerRateLimit(app);
await registerCookie(app);
await registerCsrf(app);
await registerAuth(app);
await registerAuthRoutes(app);
```

- [ ] **Step 8.4: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add packages/api/src/services/auth.service.ts packages/api/src/routes/v1/auth.routes.ts packages/api/src/server.ts
git commit -m "feat(api): auth routes (register, login, logout, me)"
```

---

## Task 9: Auth integration tests

**Files:**
- Create: `packages/api/tests/auth.test.ts`
- Modify: `packages/api/tests/helpers/build-app.ts` (no-op for now, but note that the buildApp must be rebuilt per test)

- [ ] **Step 9.1: Write the integration test**

Write `packages/api/tests/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';

const COOKIE = 'dam_session_test';

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string | null {
  if (!setCookieHeader) return null;
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join(',') : setCookieHeader;
  const match = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

describe('auth flow', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
    await closeS3();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  it('registers a new user, sets a session cookie, and /me returns them', async () => {
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'alice@example.com',
        password: 'hunter2pass',
        displayName: 'Alice',
      },
    });
    expect(registerRes.statusCode).toBe(200);
    const registerBody = registerRes.json();
    expect(registerBody.data.user.email).toBe('alice@example.com');

    const sessionId = extractSessionCookie(registerRes.headers['set-cookie']);
    expect(sessionId).toBeTruthy();

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${COOKIE}=${sessionId}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.user.email).toBe('alice@example.com');
  });

  it('rejects registration with an invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: 'hunter2pass', displayName: 'Alice' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects registration with a weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'a@b.com', password: 'short', displayName: 'A' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('rejects duplicate email with 409', async () => {
    const payload = { email: 'dup@example.com', password: 'hunter2pass', displayName: 'A' };
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('EMAIL_IN_USE');
  });

  it('logs in with correct credentials', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bob@example.com', password: 'hunter2pass', displayName: 'Bob' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bob@example.com', password: 'hunter2pass' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().data.user.email).toBe('bob@example.com');
  });

  it('rejects login with wrong password', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bob@example.com', password: 'hunter2pass', displayName: 'Bob' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bob@example.com', password: 'wrong-password' },
    });
    expect(login.statusCode).toBe(401);
    expect(login.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logout invalidates the session', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'c@example.com', password: 'hunter2pass', displayName: 'C' },
    });
    const sessionId = extractSessionCookie(reg.headers['set-cookie'])!;

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: `${COOKIE}=${sessionId}` },
    });
    expect(logout.statusCode).toBe(204);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${COOKIE}=${sessionId}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('rejects /me without a session cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects /me with an invalid session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${COOKIE}=garbage` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects cross-origin POSTs to auth (CSRF)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: 'http://evil.example.com' },
      payload: { email: 'a@b.com', password: 'hunter2pass', displayName: 'A' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FORBIDDEN');
  });
});
```

- [ ] **Step 9.2: Run the tests**

Run: `pnpm --filter @dam-link/api test tests/auth.test.ts`
Expected: 10 tests pass.

- [ ] **Step 9.3: Run the full test suite to make sure nothing else broke**

Run: `pnpm --filter @dam-link/api test`
Expected: all tests pass (health, ping, passwords, sessions, turnstile, auth).

- [ ] **Step 9.4: Commit**

```bash
git add packages/api/tests/auth.test.ts
git commit -m "test(api): full auth flow integration tests (register, login, logout, me, CSRF)"
```

---

## Task 10: Final verification + tag

- [ ] **Step 10.1: Run the full check suite**

Run:
```bash
cd /d/DAM-Link-Backend/.worktrees/foundation
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

Expected: all green.

- [ ] **Step 10.2: Boot the API and exercise the auth flow by hand**

Run: `pnpm --filter @dam-link/api dev` (in one shell)
In another shell:
```bash
# Register
curl -i -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"manual@example.com","password":"hunter2pass","displayName":"Manual"}'
# Copy the Set-Cookie value, then:
curl -i http://localhost:3000/api/v1/auth/me -H "cookie: dam_session=<COOKIE_VALUE>"
```

Expected: register returns 200 with a Set-Cookie header; /me with that cookie returns 200 with the user.

- [ ] **Step 10.3: Tag the plan**

```bash
git tag -a auth-v0.2.0 -m "Auth complete: register, login, logout, me, sessions, CSRF, Turnstile"
git log --oneline | head -20
```

- [ ] **Step 10.4: Report completion**

Reply with:
- The list of commits added
- The output of `pnpm --filter @dam-link/api test` (counts)
- Confirmation of curl exercise
- A pointer to Plan 3

---

## Self-review

**Spec coverage:**
- Email+password with Argon2id → Task 3
- Server-side sessions in Postgres → Tasks 4, 8
- HTTP-only cookies → Task 4 (session helpers) + Task 6 (cookie plugin)
- CSRF protection → Task 6
- Rate limit tiered → Task 6
- Turnstile verification → Task 5
- Auth routes (register/login/logout/me) → Task 8
- req.user augmentation → Task 7
- Integration tests for full flow → Task 9

**Placeholder scan:** none.

**Type consistency:** `MeResponseSchema.orgs` is `[]` for now; Plan 3 fills it. `PublicUserSchema` shape matches what `/me` and `/register` return.

**Edge cases I added on purpose:**
- `loginUser` runs a dummy Argon2 verify when the user doesn't exist, to keep timing roughly constant (prevents user enumeration via response time).
- `registerUser` and `loginUser` lower-case the email before lookup.
- `clearSessionCookie` reuses the same `path`/`sameSite`/`secure` settings as `setSessionCookie` so the browser actually deletes the cookie.
- The auth plugin does NOT enforce authentication — routes that need it check `req.user` themselves. This keeps the plugin simple and lets public routes (health, /me) opt in.

---

## Execution handoff

Plan complete and saved to `D:\DAM-Link-Backend\docs\superpowers\plans\2026-06-04-dam-link-backend-auth.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review.
2. **Inline Execution** — batched with checkpoints.

Which approach? (We will defer the choice until all plans are written, per the user's instruction.)
