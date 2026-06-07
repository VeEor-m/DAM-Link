import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdleTimer } from '../../src/hooks/useIdleTimer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useIdleTimer', () => {
  it('starts as not idle', () => {
    const { result } = renderHook(() => useIdleTimer(2000));
    expect(result.current).toBe(false);
  });

  it('becomes idle after the timeout', () => {
    const { result } = renderHook(() => useIdleTimer(2000));
    act(() => { vi.advanceTimersByTime(1999); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe(true);
  });

  it('resets on mousemove', () => {
    const { result } = renderHook(() => useIdleTimer(2000));
    act(() => { vi.advanceTimersByTime(1500); });
    act(() => { window.dispatchEvent(new MouseEvent('mousemove')); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current).toBe(true);
  });

  it('resets on keydown', () => {
    const { result } = renderHook(() => useIdleTimer(2000));
    act(() => { vi.advanceTimersByTime(1500); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown')); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current).toBe(false);
  });

  it('pauses when pauseOn() returns true', () => {
    let paused = true;
    const { result } = renderHook(() => useIdleTimer(2000, { pauseOn: () => paused }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(false);
    act(() => { paused = false; });
    act(() => { vi.advanceTimersByTime(2001); });
    expect(result.current).toBe(true);
  });
});
