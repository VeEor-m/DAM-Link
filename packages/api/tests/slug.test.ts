import { describe, it, expect } from 'vitest';
import { slugify, withCollisionSuffix } from '../src/lib/slug.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('My Org Name')).toBe('my-org-name');
  });

  it('strips diacritics', () => {
    expect(slugify('Café Français')).toBe('cafe-francais');
  });

  it('removes characters that arent lowercase letters, digits, or dashes', () => {
    expect(slugify('Hello, World! 2024')).toBe('hello-world-2024');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('a --- b')).toBe('a-b');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  --hello--  ')).toBe('hello');
  });

  it('falls back to "org" when input is empty after sanitization', () => {
    expect(slugify('!!!')).toBe('org');
  });

  it('clamps to 80 chars', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
});

describe('withCollisionSuffix', () => {
  it('appends -2 to the first collision', () => {
    expect(withCollisionSuffix('foo', 1)).toBe('foo-2');
  });

  it('appends -N+1 for further collisions', () => {
    expect(withCollisionSuffix('foo', 5)).toBe('foo-6');
  });

  it('clamps to 80 chars even after suffix', () => {
    const long = 'a'.repeat(79);
    expect(withCollisionSuffix(long, 1).length).toBeLessThanOrEqual(80);
  });
});
