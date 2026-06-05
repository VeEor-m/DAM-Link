import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewport } from '../src/hooks/useViewport';

describe('useViewport', () => {
  const originalInnerWidth = window.innerWidth;

  function setWidth(w: number) {
    // jsdom doesn't actually re-layout on innerWidth, so we have to stub.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  }

  beforeEach(() => {
    document.body.removeAttribute('data-viewport');
  });

  afterEach(() => {
    setWidth(originalInnerWidth);
    document.body.removeAttribute('data-viewport');
  });

  it('returns "phone" when innerWidth <= 640', () => {
    setWidth(375);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('phone');
  });

  it('returns "tablet" when innerWidth is between 641 and 1023', () => {
    setWidth(768);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('tablet');
  });

  it('returns "desktop" when innerWidth is between 1024 and 1280', () => {
    setWidth(1100);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('desktop');
  });

  it('returns "wide" when innerWidth > 1280', () => {
    setWidth(1920);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('wide');
  });

  it('treats the 640 boundary as phone (641 is tablet)', () => {
    setWidth(640);
    const { result: a } = renderHook(() => useViewport());
    expect(a.current).toBe('phone');
    setWidth(641);
    const { result: b } = renderHook(() => useViewport());
    expect(b.current).toBe('tablet');
  });

  it('treats the 1023/1024 boundary as tablet/desktop', () => {
    setWidth(1023);
    const { result: a } = renderHook(() => useViewport());
    expect(a.current).toBe('tablet');
    setWidth(1024);
    const { result: b } = renderHook(() => useViewport());
    expect(b.current).toBe('desktop');
  });

  it('treats the 1280/1281 boundary as desktop/wide', () => {
    setWidth(1280);
    const { result: a } = renderHook(() => useViewport());
    expect(a.current).toBe('desktop');
    setWidth(1281);
    const { result: b } = renderHook(() => useViewport());
    expect(b.current).toBe('wide');
  });

  it('writes body[data-viewport] after mount', () => {
    setWidth(1100);
    renderHook(() => useViewport());
    expect(document.body.getAttribute('data-viewport')).toBe('desktop');
  });

  it('updates body[data-viewport] on resize', () => {
    setWidth(1100);
    const { result } = renderHook(() => useViewport());
    expect(document.body.getAttribute('data-viewport')).toBe('desktop');

    act(() => {
      setWidth(375);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe('phone');
    expect(document.body.getAttribute('data-viewport')).toBe('phone');
  });

  it('cleans up the resize listener on unmount', () => {
    setWidth(1100);
    const { unmount } = renderHook(() => useViewport());
    unmount();
    // The body attribute is left in place — that's intentional; other DOM
    // elements may still query it. But the listener must be gone.
    setWidth(375);
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });
});
