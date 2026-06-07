import { useRef } from 'react';

/**
 * Returns `true` on the very first render of the calling component instance,
 * and `false` on every subsequent render. Resets to `true` if the component
 * is unmounted and remounted (e.g. on hot-module reload).
 *
 * Used to gate the AppShell mount timeline (so it only fires once) and the
 * AssetGrid/AssetList per-card stagger replay (so the first dep change,
 * which corresponds to the AppShell mount's initial stagger, doesn't
 * double-animate).
 */
export function useIsFirstMount(): boolean {
  const isFirst = useRef(true);
  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }
  return false;
}
