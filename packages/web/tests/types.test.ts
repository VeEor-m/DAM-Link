import { describe, it, expect } from 'vitest';

describe('tsconfig coverage', () => {
  it('recognises vitest globals', () => {
    expect(1).toBe(1);
  });
});
