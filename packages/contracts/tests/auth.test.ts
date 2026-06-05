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
