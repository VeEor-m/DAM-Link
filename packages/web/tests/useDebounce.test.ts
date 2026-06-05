import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../src/hooks/useDebounce';

describe('useDebounce', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 200));
    expect(result.current).toBe('hello');
  });

  it('debounces value changes', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 200),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'b' });
    rerender({ value: 'c' });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('c');
    vi.useRealTimers();
  });
});
