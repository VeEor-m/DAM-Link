# Sidebar Counts Refetch Storm Fix Implementation Plan (Plan 18)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `GET /api/v1/orgs/:orgId/assets/sidebar-counts` from being called 2×/sec in steady state. The endpoint should only be called when the in-memory `state.assets` reference actually changes — not on every `SET_SEARCH`, `SET_VIEW_MODE`, `SET_SELECTION`, etc.

**Architecture:** Two coupled bugs in the React state-management layer. Fix at the source (`StoreProvider`'s `wrappedDispatch` is unstable because its `useCallback` deps include `state`) and lock the behavior down with two regression tests: one unit test for dispatch stability, one integration test for the network call pattern.

**Tech Stack:** React 19, TypeScript 5.6 strict, Vitest 2, @testing-library/react 16, vitest fake timers.

---

## Root cause recap (read once, don't re-debug)

`packages/web/src/state/store.tsx:71-145` defines `wrappedDispatch` like this:

```ts
const wrappedDispatch = useCallback<React.Dispatch<Action>>((action) => {
  if (action.type === 'TOGGLE_FAVORITE') {
    const a = state.assets.find((x) => x.id === action.id);
    // ... reads from `state` for 6 action types
  }
  dispatch(action);
}, [state, dispatch]);   // ← BUG: `state` makes this callback unstable
```

The header comment claims the callback is stable, but `state` in the deps means **every reducer action recreates it**. Then `packages/web/src/App.tsx:178-193` lists `dispatch` (= `wrappedDispatch`) in a `useEffect` dep array, so the effect re-fires on every state change. After the resulting `SET_SIDEBAR_COUNTS` dispatch, the feedback loop closes:

```
any UI action
  → state changes
  → wrappedDispatch recreates
  → effect cleanup, new 500ms timer
  → timer fires → sidebar-counts fetch
  → SET_SIDEBAR_COUNTS
  → state changes
  → wrappedDispatch recreates
  → effect cleanup, new 500ms timer
  → ... (~2 fetches/sec in steady state)
```

`useReducer`'s raw dispatch is stable, so making `wrappedDispatch`'s deps `[dispatch]` fixes everything downstream.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `packages/web/src/state/store.tsx` | modify | Add `stateRef` so the `wrappedDispatch` callback can read latest `state.assets` without depending on it. Change `useCallback` deps to `[dispatch]`. Update the misleading header comment. |
| `packages/web/tests/store.wrappedDispatch.test.tsx` | create | Unit test: `wrappedDispatch` reference is stable across non-asset state changes. |
| `packages/web/tests/App.sidebarCounts.refetch.test.tsx` | create | Integration test: dispatching `SET_SEARCH` after hydration does NOT trigger any additional `sidebar-counts` fetches. |

No backend, no API, no contract, no dependency changes. `App.tsx`'s `useEffect` does NOT need to change — once `wrappedDispatch` is stable, the existing effect is correct.

---

## Task 1: Write the unit test for `wrappedDispatch` stability (failing first)

**Files:**
- Create: `packages/web/tests/store.wrappedDispatch.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
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
```

- [ ] **Step 2: Run the test to verify it FAILS with the current buggy code**

Run: `cd packages/web && pnpm test -- store.wrappedDispatch.test.tsx --run`
Expected: both tests FAIL with
```
AssertionError: expected <fn> to be the same reference as <fn>
```
The first dispatch after `SET_SEARCH` should be a NEW reference, proving `wrappedDispatch` is unstable.

- [ ] **Step 3: Commit the failing test (TDD red)**

```bash
git add packages/web/tests/store.wrappedDispatch.test.tsx
git commit -m "test(web): regression for wrappedDispatch stability across non-asset actions

Fails on main because wrappedDispatch's useCallback deps include state,
so every reducer action recreates the callback. This in turn makes
App.tsx's sidebar-counts refetch effect re-fire on every UI action,
producing ~2 fetches/sec in steady state."
```

---

## Task 2: Fix `wrappedDispatch` to be truly stable

**Files:**
- Modify: `packages/web/src/state/store.tsx:1-9` (imports — add `useRef`)
- Modify: `packages/web/src/state/store.tsx:55-145` (replace the persistence effect + wrappedDispatch block)

- [ ] **Step 1: Add `useRef` to the React import**

In `packages/web/src/state/store.tsx`, change line 1-8 from:
```tsx
import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
```
to:
```tsx
import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
```

- [ ] **Step 2: Replace the `useCallback` block to use a state ref**

In `packages/web/src/state/store.tsx`, find the line `const wrappedDispatch = useCallback<React.Dispatch<Action>>((action) => {` (line 71) and replace the entire block — from the line just before it (the comment block ending at line 70) through the `}, [state, dispatch]);` at line 145 — with:

```tsx
  // Ref-mirror of `state` so the dispatch callback below can read the
  // latest `state.assets` (for TOGGLE_FAVORITE / ADD_TAG / REMOVE_TAG
  // / BATCH_* computed patches) WITHOUT making itself depend on
  // `state`. Without the ref, the useCallback's dep array would have
  // to include `state`, which means every reducer action would
  // recreate wrappedDispatch — which in turn makes every consumer
  // effect that puts `dispatch` in its dep array re-run on every
  // state change (see App.tsx's sidebar-counts refetch for the
  // canonical offender: the feedback loop produced ~2 fetches/sec).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // STABLE across all state changes (deps: [dispatch] only — the raw
  // useReducer dispatch is guaranteed stable by React). The callback
  // reads current state via `stateRef.current`, not via the closure.
  const wrappedDispatch = useCallback<React.Dispatch<Action>>((action) => {
    if (action.type === 'TOGGLE_FAVORITE') {
      const a = stateRef.current.assets.find((x) => x.id === action.id);
      if (a) {
        dispatch({
          type: 'UPDATE_ASSET',
          id: action.id,
          patch: { favorite: !a.favorite },
        });
      }
      return;
    }
    if (action.type === 'ADD_TAG') {
      const a = stateRef.current.assets.find((x) => x.id === action.id);
      if (a && !a.tags.includes(action.tag)) {
        dispatch({
          type: 'UPDATE_ASSET',
          id: action.id,
          patch: { tags: [...a.tags, action.tag] },
        });
      }
      return;
    }
    if (action.type === 'REMOVE_TAG') {
      const a = stateRef.current.assets.find((x) => x.id === action.id);
      if (a) {
        dispatch({
          type: 'UPDATE_ASSET',
          id: action.id,
          patch: { tags: a.tags.filter((t) => t !== action.tag) },
        });
      }
      return;
    }
    if (action.type === 'BATCH_TOGGLE_FAVORITE') {
      for (const id of action.ids) {
        const a = stateRef.current.assets.find((x) => x.id === id);
        if (a) {
          dispatch({
            type: 'UPDATE_ASSET',
            id,
            patch: { favorite: !a.favorite },
          });
        }
      }
      return;
    }
    if (action.type === 'BATCH_ADD_TAG') {
      for (const id of action.ids) {
        const a = stateRef.current.assets.find((x) => x.id === id);
        if (a && !a.tags.includes(action.tag)) {
          dispatch({
            type: 'UPDATE_ASSET',
            id,
            patch: { tags: [...a.tags, action.tag] },
          });
        }
      }
      return;
    }
    if (action.type === 'BATCH_REMOVE_TAG') {
      for (const id of action.ids) {
        const a = stateRef.current.assets.find((x) => x.id === id);
        if (a) {
          dispatch({
            type: 'UPDATE_ASSET',
            id,
            patch: { tags: a.tags.filter((t) => t !== action.tag) },
          });
        }
      }
      return;
    }
    dispatch(action);
  }, [dispatch]);
```

**Verify visually**: the only changes from the original are (a) reading `stateRef.current.assets` instead of `state.assets` in six places, and (b) deps changed from `[state, dispatch]` to `[dispatch]`. The 7 dispatch calls and 6 action-type branches are byte-identical otherwise.

- [ ] **Step 3: Run the unit test — it should now PASS**

Run: `cd packages/web && pnpm test -- store.wrappedDispatch.test.tsx --run`
Expected: both tests PASS.

- [ ] **Step 4: Run the full web test suite — no regressions**

Run: `cd packages/web && pnpm test -- --run`
Expected: all tests pass. (Before this fix the suite was at 233 web tests; we add 2 new ones = 235.)

- [ ] **Step 5: Commit the fix**

```bash
git add packages/web/src/state/store.tsx
git commit -m "fix(web): wrappedDispatch is now truly stable across state changes

Read latest state.assets via a useRef mirror so the useCallback
deps can shrink to [dispatch] (the raw useReducer dispatch is
guaranteed stable by React). The previous [state, dispatch] deps
meant every reducer action recreated wrappedDispatch, which
turned App.tsx's sidebar-counts refetch effect into a feedback
loop producing ~2 fetches/sec in steady state.

The header comment that claimed 'consumers would re-run anyway'
was true only for effects that themselves depend on state — the
sidebar-counts effect depends on state.assets only, so the
justification didn't hold. The fix restores the documented
contract: wrappedDispatch reference is stable until the raw
dispatch changes (which it never does in practice)."
```

---

## Task 3: Write the integration regression test (the user-visible bug)

**Files:**
- Create: `packages/web/tests/App.sidebarCounts.refetch.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
// packages/web/tests/App.sidebarCounts.refetch.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the API layer. We assert ONLY on `sidebarCounts` call counts;
// other endpoints are stubbed so the App can hydrate.
vi.mock('../src/api/auth.js', () => ({ me: vi.fn(), logout: vi.fn() }));
vi.mock('../src/api/orgs.js', () => ({ listMyOrgs: vi.fn(), createOrg: vi.fn() }));
vi.mock('../src/api/assets.js', () => ({
  listAssets: vi.fn(),
  sidebarCounts: vi.fn(),
  updateAsset: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
  permanentDelete: vi.fn(),
  getDownloadUrl: vi.fn(),
  emptyTrash: vi.fn(),
}));
vi.mock('../src/api/share-links.js', () => ({
  createShareLink: vi.fn(),
  listShareLinks: vi.fn(),
  revokeShareLink: vi.fn(),
}));

import App from '../src/App';
import { StoreProvider } from '../src/state/store';
import { ToastProvider } from '../src/components/common/ToastProvider';
import { me } from '../src/api/auth.js';
import { listMyOrgs } from '../src/api/orgs.js';
import { listAssets, sidebarCounts } from '../src/api/assets.js';
import type { Asset } from '@dam-link/contracts';

function makeApiAsset(): Asset {
  return {
    id: 'a1',
    orgId: 'org-1',
    name: 'logo.png',
    type: 'image',
    format: 'PNG',
    size: 1024,
    mimeType: 'image/png',
    uploadedAt: '2026-06-07T00:00:00.000Z',
    uploadedBy: 'u1',
    tags: [],
    favorite: false,
    deletedAt: null,
    objectKey: 'originals/org-1/a1',
    status: 'ready',
    visibility: 'org',
    width: 100,
    height: 100,
    thumbnailKey: null,
    thumbnailUrl: null,
  };
}

/** Mount App with one asset and wait for the card to render (hydration
 *  + first list+counts fetch). */
async function mountApp() {
  vi.mocked(me).mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c', displayName: 'A', createdAt: '2026-06-07T00:00:00.000Z' },
    orgs: [],
  });
  vi.mocked(listMyOrgs).mockResolvedValue([
    {
      org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-07T00:00:00.000Z' },
      role: 'owner',
    },
  ]);
  vi.mocked(listAssets).mockResolvedValue({ items: [makeApiAsset()], nextCursor: null });
  vi.mocked(sidebarCounts).mockResolvedValue({
    byType: { image: 1, video: 0, document: 0, audio: 0 },
    byTag: [],
    favorites: 0,
    trash: 0,
  });

  const utils = render(
    <StoreProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StoreProvider>,
  );
  await screen.findByText('logo.png');
  return utils;
}

describe('App — sidebar-counts refetch behavior', () => {
  beforeEach(() => {
    vi.mocked(sidebarCounts).mockClear();
  });

  it('does NOT refetch sidebar counts when the user types in the search box', async () => {
    await mountApp();
    // Let the initial mount-time refetch (from App.tsx's debounced
    // effect, 500ms after hydration) complete and stabilize.
    await new Promise((r) => setTimeout(r, 1500));
    vi.mocked(sidebarCounts).mockClear();

    // Type a search query. This dispatches SET_SEARCH on every
    // keystroke. With the bug, each dispatch recreates wrappedDispatch
    // and re-fires the refetch effect, producing a fresh fetch every
    // ~500ms.
    const user = userEvent.setup();
    const search = screen.getByRole('searchbox');
    await user.type(search, 'logo');

    // Wait long enough for any debounced refetch to fire. With the
    // fix, zero calls. With the bug, 2-3 calls in this window.
    await new Promise((r) => setTimeout(r, 1500));

    expect(vi.mocked(sidebarCounts)).not.toHaveBeenCalled();
  });

  it('does NOT refetch sidebar counts when the user toggles view mode', async () => {
    await mountApp();
    await new Promise((r) => setTimeout(r, 1500));
    vi.mocked(sidebarCounts).mockClear();

    // Toggle the view-mode button. The Toolbar exposes a grid/list
    // toggle; clicking it dispatches SET_VIEW_MODE. Same root cause
    // as the search test.
    const user = userEvent.setup();
    const listButton = screen.getByRole('button', { name: /list|列表/i });
    await user.click(listButton);

    await new Promise((r) => setTimeout(r, 1500));

    expect(vi.mocked(sidebarCounts)).not.toHaveBeenCalled();
  });

  it('DOES refetch sidebar counts when an asset is added (regression for the original intent)', async () => {
    // This is the inverse: prove we did NOT over-fix. A real asset
    // change must still refetch. We dispatch ADD_ASSET via the store
    // context (a test-only consumer below).
    await mountApp();
    await new Promise((r) => setTimeout(r, 1500));
    vi.mocked(sidebarCounts).mockClear();

    // Dispatch an ADD_ASSET action directly. This changes state.assets,
    // so the refetch SHOULD fire.
    await act(async () => {
      // Use a custom event the App component dispatches when upload
      // completes. For the test we just dispatch via the store:
      // mount a hidden consumer that calls useStore.
    });

    // The above `act` block needs a real consumer. To keep this test
    // simple and self-contained, we drive it through the search input
    // path: the existing tests prove ADD_ASSET triggers refetch
    // (see useUpload tests). The 2 tests above are the load-bearing
    // ones for the bug.
    expect(true).toBe(true);
  });
});
```

**Implementation note for the engineer:** the third test (`DOES refetch...`) is currently a placeholder because driving an `ADD_ASSET` from outside the App component requires either a test-only dispatch consumer or going through the upload flow. The two load-bearing tests above are sufficient to lock down the fix. If you want to make the third test real, the cleanest seam is a `TestDispatch` component that calls `useStore().dispatch({ type: 'ADD_ASSET', asset: ... })` from inside the same `StoreProvider`. Don't ship the third test as a no-op — either implement it for real or delete it.

- [ ] **Step 2: Implement the third test for real (or delete the placeholder)**

Implement the `TestDispatch` consumer. Suggested approach:

```tsx
// Add inside the same file:
import { useStore } from '../src/hooks/useStore';
import type { Action } from '../src/state/actions';
import { apiAssetToLocal } from '../src/state/assetAdapter';

function TestAddAsset() {
  const { dispatch } = useStore();
  // Expose the dispatch on window for the test to call.
  (window as unknown as { __dispatch?: (a: Action) => void }).__dispatch = dispatch;
  return null;
}

// Wrap the mountApp helper's render with <TestAddAsset />:
//   <StoreProvider>
//     <TestAddAsset />
//     <ToastProvider><App /></ToastProvider>
//   </StoreProvider>
//
// Then in the test:
//   await act(async () => {
//     (window as unknown as { __dispatch: (a: Action) => void }).__dispatch({
//       type: 'ADD_ASSET',
//       asset: apiAssetToLocal(makeApiAsset({ id: 'a2', name: 'second.png' })),
//     });
//   });
//   await new Promise((r) => setTimeout(r, 800));
//   expect(vi.mocked(sidebarCounts)).toHaveBeenCalledTimes(1);
```

(Read `packages/web/src/state/assetAdapter.ts` for the exact `apiAssetToLocal` signature — it was added in Plan 15.)

- [ ] **Step 3: Run the integration tests**

Run: `cd packages/web && pnpm test -- App.sidebarCounts.refetch.test.tsx --run`
Expected: all 3 tests pass (2 strict, 1 real-DOES-refetch).

If you skipped the real implementation of test 3 in step 2 and just left the placeholder, the file should have 2 tests. Both must pass.

- [ ] **Step 4: Run the full web test suite one more time**

Run: `cd packages/web && pnpm test -- --run`
Expected: 235 + 2 or 3 tests, all green. No regression in `App.handlers.test.tsx` (which exercises the actual asset-change path through the API mocks — the most likely place a regression would show up).

- [ ] **Step 5: Commit the integration tests**

```bash
git add packages/web/tests/App.sidebarCounts.refetch.test.tsx
git commit -m "test(web): regression for sidebar-counts refetch storm

Mounts the real App component with mocked API and asserts that
non-asset state changes (SET_SEARCH via the search input,
SET_VIEW_MODE via the toolbar) do NOT trigger additional
GET /sidebar-counts calls. Also asserts the inverse: ADD_ASSET
DOES trigger a refetch (proving the fix didn't over-correct).

Combined with the wrappedDispatch stability unit test, these
two regressions lock down the fix for the feedback loop that
was producing ~2 fetches/sec in steady state."
```

---

## Task 4: Type-check + lint the workspace

**Files:** none modified, just verify.

- [ ] **Step 1: Type-check the web package**

Run: `cd packages/web && pnpm exec tsc -b`
Expected: exit 0, no errors. (The fix touches generics + hooks, both strict.)

- [ ] **Step 2: Lint the web package**

Run: `cd packages/web && pnpm lint`
Expected: exit 0, no warnings. If `react-hooks/exhaustive-deps` complains about the `stateRef` pattern in `store.tsx`, suppress with a one-line comment justifying it (the pattern is documented in the new code comments).

- [ ] **Step 3: Run the FULL repo test suite (root level)**

Run: `cd D:/DAM-Link-Backend && pnpm test -- --run`
Expected: all tests across `api` (117), `contracts` (107), `web` (235+2) = 461+ tests pass. (Baseline before this plan was 457 on main per memory.)

---

## Task 5: Visual verification (optional but recommended)

**Files:** new screenshots in `docs/superpowers/plans/screenshots/P17/`.

- [ ] **Step 1: Start the dev stack (api + web)**

Use the existing `pnpm dev` (or split api + web) on the worktree.

- [ ] **Step 2: Open Chrome DevTools → Network tab, filter on `sidebar-counts`**

Clear the network log. Reload the page. Observe:
- 1 call on initial mount (from `loadState` → `persistence.ts`)
- 1 call ~500ms after hydration (from App.tsx's effect)
- **0 further calls** when you type in the search box, switch view mode, click sidebar items, etc.

- [ ] **Step 3: Capture a screenshot of the DevTools Network panel with the filter active**

Save to `docs/superpowers/plans/screenshots/P17/no-extra-fetches.png`.

- [ ] **Step 4: Verify the inverse: dispatch an action that DOES change assets**

Upload a file, or click favorite on an asset, or soft-delete one. Observe **exactly 1** new `sidebar-counts` call ~500ms after the action.

Save to `docs/superpowers/plans/screenshots/P17/asset-change-fetches.png`.

- [ ] **Step 5: Commit the screenshots**

```bash
git add docs/superpowers/plans/screenshots/P17/
git commit -m "docs: visual verification of sidebar-counts refetch fix (P17)"
```

---

## Task 6: Update memory + final commit

**Files:**
- Modify: `C:\Users\Administrator\.claude\projects\D--DAM-Link-Backend\memory\MEMORY.md` (add a Plan 17 bullet)

- [ ] **Step 1: Append the Plan 17 summary to MEMORY.md**

Add a new bullet under the project history section (right after the "Trash Refresh" bullet), following the same template:

```markdown
- **Sidebar Counts Refetch Storm Fix:** MERGED to main YYYY-MM-DD as `<sha>`. Tag `sidebar-counts-storm-fix-v0.15.0` on the merge commit. N commits on top of `trash-refresh-v0.14.0` (commit `615fdaa`). <api|contracts|web> tests: 117 API + 107 contracts + <new web count> web = <total> tests pass on main. Worktree removed; branch `feat/web-sidebar-counts-storm-fix` deleted. Plan markdown at `docs/superpowers/plans/2026-06-07-sidebar-counts-refetch-storm.md`. <N> Playwright/visual-verification screenshots in `screenshots/P17/`. Fixes the bug: `wrappedDispatch`'s `useCallback` deps included `state`, so it was recreated on every reducer action, which made App.tsx's sidebar-counts refetch effect re-fire on every UI action — producing a feedback loop of ~2 fetches/sec in steady state. Fix: read latest `state.assets` via a `useRef` mirror in StoreProvider; shrink deps to `[dispatch]` (raw `useReducer` dispatch is stable). N regression tests: 1 unit (`store.wrappedDispatch.test.tsx` — dispatch reference is stable across SET_SEARCH/SET_VIEW_MODE/SET_SELECTION), 1 integration (`App.sidebarCounts.refetch.test.tsx` — typing in search and toggling view mode do NOT trigger new `sidebar-counts` calls; ADD_ASSET DOES). Generalization rules: (1) **useCallback dep arrays that include `state` are almost always wrong** — if the callback needs current state, use a `useRef` mirror, not a dep; (2) **comments that justify "consumers would re-run anyway" need to name the consumer** — that justification only holds for effects that themselves depend on state; (3) **debounced refetch effects that list `dispatch` in deps will feedback-loop** if dispatch is unstable — fix dispatch stability first; (4) **two coupled bugs need two coupled regression tests** — one at the source (dispatch stability), one at the symptom (network call pattern). **15/15 plans complete.**
```

Fill in the merge SHA, dates, and counts from the actual merge commit.

- [ ] **Step 2: Commit the memory update**

The MEMORY.md lives outside the repo (in `C:\Users\Administrator\.claude\projects\...`), so this commit is informational only — no `git add`/`git commit` needed.

---

## Self-Review Checklist (run before declaring done)

- [ ] Spec coverage: Plan addresses both root causes (dispatch stability + the misleading comment), adds unit + integration regression tests, runs the full repo test suite, includes optional visual verification, and updates memory.
- [ ] No placeholders: every code block in every step is complete and copy-pasteable. The only "implementation note" is the third test, which the engineer is given a clear way to implement (or to delete).
- [ ] Type consistency: `stateRef` is defined in `store.tsx`, used in the same file's `wrappedDispatch`. `apiAssetToLocal` is the function added in Plan 15. `Action` type comes from `../src/state/actions` in both test files.
- [ ] No new dependencies. No API changes. No contract changes.
- [ ] DRY: the two regression tests intentionally cover different seams (unit vs. integration) — not duplicates.
- [ ] YAGNI: didn't add a `useEvent` shim, didn't add a custom debounce hook, didn't add a "refetch storm detector" — just fixed the actual bug.
- [ ] TDD: Task 1 writes a failing test first, then Task 2 fixes the source. Task 3 adds the second regression test. Order matters.
- [ ] Frequent commits: 4 atomic commits (test-red, fix, integration-test, screenshots).
