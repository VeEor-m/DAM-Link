import { useEffect, useState } from 'react';

export type Viewport = 'phone' | 'tablet' | 'desktop' | 'wide';

function computeViewport(w: number): Viewport {
  if (w <= 640) return 'phone';
  if (w <= 1023) return 'tablet';
  if (w <= 1280) return 'desktop';
  return 'wide';
}

/**
 * Reports the current responsive tier and writes it to
 * `body[data-viewport]` so CSS attribute selectors can pick layout
 * templates. The first paint uses the synchronous `window.innerWidth`
 * inside `useState` (Vite SPA — no SSR, no hydration risk) so the layout
 * is correct on the very first render.
 */
export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => computeViewport(window.innerWidth));

  useEffect(() => {
    const onResize = () => setVp(computeViewport(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.body.dataset.viewport = vp;
  }, [vp]);

  return vp;
}
