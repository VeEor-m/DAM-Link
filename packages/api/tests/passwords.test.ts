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
