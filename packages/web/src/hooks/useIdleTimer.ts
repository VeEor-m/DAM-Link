import { useEffect, useRef, useState } from 'react';

export interface UseIdleTimerOpts {
  /** When this function returns true, the idle timer pauses (isIdle stays false). */
  pauseOn?: () => boolean;
}

const EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'wheel'];

/**
 * Returns `true` when no user input has happened on `window` for `timeoutMs`.
 * Used by the lightbox to drive cinema mode (chrome fades out when idle).
 */
export function useIdleTimer(timeoutMs: number, opts: UseIdleTimerOpts = {}): boolean {
  const [isIdle, setIsIdle] = useState(false);
  // We use a ref to read the latest pauseOn() in the interval without restarting the interval.
  const pauseOnRef = useRef(opts.pauseOn);
  useEffect(() => {
    pauseOnRef.current = opts.pauseOn;
  }, [opts.pauseOn]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const arm = () => {
      if (timer) clearTimeout(timer);
      setIsIdle(false);
      timer = setTimeout(() => {
        if (pauseOnRef.current?.()) {
          // re-arm so we re-check after another timeout
          arm();
        } else {
          setIsIdle(true);
        }
      }, timeoutMs);
    };

    arm();
    for (const ev of EVENTS) window.addEventListener(ev, arm, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of EVENTS) window.removeEventListener(ev, arm);
    };
  }, [timeoutMs]);

  return isIdle;
}
