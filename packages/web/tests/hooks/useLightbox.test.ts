import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Asset } from '../../src/state/types';
import { useLightbox } from '../../src/hooks/useLightbox';

const opts = {
  open: true,
  asset: { id: 'b' } as Asset,
  visibleIds: ['a', 'b', 'c'],
  onNavigate: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers();
  opts.onNavigate.mockReset();
  opts.onClose.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useLightbox', () => {
  it('computes prevId and nextId', () => {
    const { result } = renderHook(() => useLightbox(opts));
    expect(result.current.prevId).toBe('a');
    expect(result.current.nextId).toBe('c');
  });

  it('prevId is null at the start of the list', () => {
    const { result } = renderHook(() =>
      useLightbox({ ...opts, visibleIds: ['b', 'c'] }),
    );
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBe('c');
  });

  it('nextId is null at the end of the list', () => {
    const { result } = renderHook(() =>
      useLightbox({ ...opts, visibleIds: ['a', 'b'] }),
    );
    expect(result.current.prevId).toBe('a');
    expect(result.current.nextId).toBeNull();
  });

  it('ArrowLeft on the lightbox root calls onNavigate(prevId)', () => {
    const { result } = renderHook(() => useLightbox(opts));
    const onKeyDown = result.current.onKeyDown;
    act(() => {
      onKeyDown({ key: 'ArrowLeft' });
    });
    expect(opts.onNavigate).toHaveBeenCalledWith('a');
  });

  it('ArrowRight calls onNavigate(nextId)', () => {
    const { result } = renderHook(() => useLightbox(opts));
    const onKeyDown = result.current.onKeyDown;
    act(() => {
      onKeyDown({ key: 'ArrowRight' });
    });
    expect(opts.onNavigate).toHaveBeenCalledWith('c');
  });

  it('Escape calls onClose', () => {
    const { result } = renderHook(() => useLightbox(opts));
    act(() => {
      result.current.onKeyDown({ key: 'Escape' });
    });
    expect(opts.onClose).toHaveBeenCalled();
  });

  it('does not respond to keys when open=false', () => {
    const { result } = renderHook(() => useLightbox({ ...opts, open: false }));
    act(() => {
      result.current.onKeyDown({ key: 'ArrowRight' });
    });
    expect(opts.onNavigate).not.toHaveBeenCalled();
  });

  it('isIdle is false initially and true after 2000ms of no activity', () => {
    const { result } = renderHook(() => useLightbox(opts));
    expect(result.current.isIdle).toBe(false);
    act(() => { vi.advanceTimersByTime(2001); });
    expect(result.current.isIdle).toBe(true);
    act(() => { window.dispatchEvent(new MouseEvent('mousemove')); });
    expect(result.current.isIdle).toBe(false);
  });
});
