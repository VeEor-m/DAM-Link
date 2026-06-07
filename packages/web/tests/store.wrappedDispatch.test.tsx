// packages/web/tests/store.wrappedDispatch.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
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

/** Test consumer that captures every `dispatch` reference it sees on
 *  re-render. We use a ref + push so we can assert "did the reference
 *  change after a non-asset action?". */
function DispatchProbe({ bag }: { bag: { refs: Dispatch<Action>[] } }) {
  const { dispatch } = useStore();
  const last = useRef<Dispatch<Action> | null>(null);
  useEffect(() => {
    if (last.current !== dispatch) {
      last.current = dispatch;
      bag.refs.push(dispatch);
    }
  }, [dispatch, bag]);
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

    // Wait for Probe to re-render and push the new dispatch (if any).
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

    act(() => {
      initial({ type: 'SET_VIEW_MODE', viewMode: 'list' });
    });
    await waitFor(() => expect(bag.refs[bag.refs.length - 1]).not.toBe(initial));
    const afterView = bag.refs[bag.refs.length - 1];

    act(() => {
      afterView({ type: 'SET_SELECTION', selection: { kind: 'tag', tag: 'logo' } });
    });
    await waitFor(() => expect(bag.refs[bag.refs.length - 1]).not.toBe(afterView));
    const afterSel = bag.refs[bag.refs.length - 1];

    // BOTH must still be the same reference as `initial`. None of these
    // actions touch state.assets.
    expect(afterView).toBe(initial);
    expect(afterSel).toBe(initial);
  });
});
