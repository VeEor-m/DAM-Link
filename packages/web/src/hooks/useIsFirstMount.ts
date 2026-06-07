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
 *
 * Implementation note: we use `useRef` + synchronous mutation rather than
 * the React 19 "set state during render" pattern because consumers (and
 * tests) need to observe `true` *synchronously* on the first render. A
 * setState-based approach triggers a same-tick re-render that discards
 * the first-render JSX before `result.current` is read, so the `true`
 * return is never observable. The ref mutation is the documented
 * first-render gate primitive for exactly this case.
 */
export function useIsFirstMount(): boolean {
  const isFirst = useRef(true);
  // eslint-disable-next-line react-hooks/refs -- intentional: first-render gate primitive
  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }
  return false;
}
