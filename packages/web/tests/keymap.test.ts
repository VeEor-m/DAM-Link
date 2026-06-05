import { describe, it, expect, vi } from 'vitest';
import { matchKey, type KeymapEntry } from '../src/state/keymap';

const entries: KeymapEntry[] = [
  { key: '/', scope: 'global', description: 'Focus search', handler: vi.fn() },
  { key: '1', scope: 'global', description: 'Grid view', handler: vi.fn() },
  { key: 'Enter', scope: 'global', description: 'Open', handler: vi.fn() },
];

describe('matchKey', () => {
  it('returns the matching entry', () => {
    const e = new KeyboardEvent('keydown', { key: '/' });
    const m = matchKey(entries, e, 'global');
    expect(m?.description).toBe('Focus search');
  });
  it('returns null on no match', () => {
    const e = new KeyboardEvent('keydown', { key: 'x' });
    expect(matchKey(entries, e, 'global')).toBeNull();
  });
  it('filters by scope', () => {
    const e = new KeyboardEvent('keydown', { key: '/' });
    expect(matchKey(entries, e, 'editing')).toBeNull();
  });
});

describe('matchKey with mod field', () => {
  function entry(overrides: Partial<KeymapEntry> = {}): KeymapEntry {
    return {
      key: 'a',
      scope: 'global',
      description: 'test',
      handler: vi.fn(),
      ...overrides,
    };
  }

  it('matches ctrl+a when mod="ctrl" and ctrlKey is true', () => {
    const e = entry({ key: 'a', mod: 'ctrl' });
    const ev = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true });
    expect(matchKey([e], ev, 'global')).toBe(e);
  });

  it('does NOT match ctrl+a when ctrlKey is false (must explicitly set mod)', () => {
    const e = entry({ key: 'a', mod: 'ctrl' });
    const ev = new KeyboardEvent('keydown', { key: 'a' });
    expect(matchKey([e], ev, 'global')).toBeNull();
  });

  it('matches metaKey=true for Mac Cmd', () => {
    const e = entry({ key: 'a', mod: 'ctrl' });
    const ev = new KeyboardEvent('keydown', { key: 'a', metaKey: true });
    expect(matchKey([e], ev, 'global')).toBe(e);
  });

  it('does not match when mod="ctrl" but a different modifier is held (e.g. shiftKey alone)', () => {
    const e = entry({ key: 'a', mod: 'ctrl' });
    const ev = new KeyboardEvent('keydown', { key: 'a', shiftKey: true });
    expect(matchKey([e], ev, 'global')).toBeNull();
  });

  it('plain "a" with no mod field still matches (backward compat)', () => {
    const e = entry({ key: 'a' });
    const ev = new KeyboardEvent('keydown', { key: 'a' });
    expect(matchKey([e], ev, 'global')).toBe(e);
  });

  it('skips entries whose scope does not match', () => {
    const e = entry({ key: 'a', mod: 'ctrl', scope: 'editing' });
    const ev = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true });
    expect(matchKey([e], ev, 'global')).toBeNull();
  });
});

