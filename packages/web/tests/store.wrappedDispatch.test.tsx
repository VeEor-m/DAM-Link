// packages/web/tests/store.wrappedDispatch.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { StoreProvider } from '../src/state/store';
import { useStore } from '../src/hooks/useStore';
import type { Action } from '../src/state/actions';
import type { Dispatch } from 'react';

// Mock loadState to return null so the test doesn't need an API or
// asset fixtures. The provider renders a loading screen and then
// gates on hydration; with loadState resolving to null, hydration
// completes immediately with the empty init state and `hydrated` flips
// to true. This is exactly what we want — the test only needs the
// dispatch callback, not real assets.
vi.mock('../src/state/persistence', () => ({
  loadState: vi.fn().mockResolvedValue(null),
  saveState: vi.fn(),
}));

/** Test consumer that pushes the current `dispatch` reference to `bag.refs`
 *  on every state change. The effect depends on `state` (not `dispatch`)
 *  so it re-runs on every reducer action — and we capture the dispatch
 *  value from the render's closure.
 *
 *  Why `state` in deps and not `dispatch`: with the fix, `dispatch` is
 *  stable across re-renders, so an effect with `[dispatch]` would never
 *  re-run after the first render and we'd never see a second push. The
 *  probe must re-render on every state change to expose the (potentially
 *  new) dispatch reference; depending on `state` is the canonical way
 *  to subscribe to "any reducer action" without depending on dispatch
 *  stability.
 *
 *  Expected push behavior:
 *    - With the bug: each push is a NEW dispatch reference
 *    - With the fix: each push is the SAME dispatch reference */
function DispatchProbe({ bag }: { bag: { refs: Dispatch<Action>[] } }) {
  const { state, dispatch } = useStore();
  useEffect(() => {
    bag.refs.push(dispatch);
  }, [state, dispatch]);
  return null;
}

describe('StoreProvider — wrappedDispatch stability', () => {
  it('returns the same dispatch reference across non-asset state changes', async () => {
    const bag = { refs: [] as Dispatch<Action>[] };
    render(
      <StoreProvider>
        <DispatchProbe bag={bag} />
      </StoreProvider>,
    );

    // Wait for hydration to complete and Probe to push the initial dispatch.
    await waitFor(() => expect(bag.refs.length).toBeGreaterThan(0));
    const initial = bag.refs[bag.refs.length - 1];
    const lengthBefore = bag.refs.length;

    // Dispatch a non-asset action. SET_SEARCH only mutates state.ui,
    // never state.assets. The callback in the provider reads from
    // state.assets for 6 action types, but SET_SEARCH falls through to
    // the raw dispatch. So this should NOT recreate wrappedDispatch.
    act(() => {
      initial({ type: 'SET_SEARCH', query: 'logo' });
    });

    // Wait for Probe to re-render at least once after the dispatch.
    await waitFor(() => expect(bag.refs.length).toBeGreaterThan(lengthBefore));
    const after = bag.refs[bag.refs.length - 1];

    // The reference MUST be stable. If the probe sees a new reference,
    // wrappedDispatch was recreated — that's the bug.
    expect(after).toBe(initial);
  });

  it('also keeps dispatch stable for SET_VIEW_MODE and SET_SELECTION', async () => {
    const bag = { refs: [] as Dispatch<Action>[] };
    render(
      <StoreProvider>
        <DispatchProbe bag={bag} />
      </StoreProvider>,
    );

    await waitFor(() => expect(bag.refs.length).toBeGreaterThan(0));
    const initial = bag.refs[bag.refs.length - 1];
    const lengthBeforeView = bag.refs.length;

    // SET_VIEW_MODE field is `mode` per actions.ts:15, NOT `viewMode`.
    act(() => {
      initial({ type: 'SET_VIEW_MODE', mode: 'list' });
    });
    await waitFor(() =>
      expect(bag.refs.length).toBeGreaterThan(lengthBeforeView),
    );
    expect(bag.refs[bag.refs.length - 1]).toBe(initial);

    const lengthBeforeSel = bag.refs.length;
    act(() => {
      initial({ type: 'SET_SELECTION', selection: { kind: 'tag', tag: 'logo' } });
    });
    await waitFor(() =>
      expect(bag.refs.length).toBeGreaterThan(lengthBeforeSel),
    );
    expect(bag.refs[bag.refs.length - 1]).toBe(initial);
  });
});
