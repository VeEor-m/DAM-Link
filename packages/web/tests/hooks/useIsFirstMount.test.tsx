import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsFirstMount } from '../../src/hooks/useIsFirstMount';

describe('useIsFirstMount', () => {
  it('returns true on the first render and false on every subsequent render', () => {
    const { result, rerender } = renderHook(() => useIsFirstMount());
    expect(result.current).toBe(true);
    rerender();
    expect(result.current).toBe(false);
    rerender();
    expect(result.current).toBe(false);
    rerender();
    expect(result.current).toBe(false);
  });

  it('returns true again for a fresh instance (a separate renderHook call)', () => {
    const first = renderHook(() => useIsFirstMount());
    expect(first.result.current).toBe(true);

    const second = renderHook(() => useIsFirstMount());
    expect(second.result.current).toBe(true);
  });
});
