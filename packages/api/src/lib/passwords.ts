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
