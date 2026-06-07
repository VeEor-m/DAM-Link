# Trash View Refresh + Related Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the empty recycle bin on reload, wire `handleEmptyTrash` to the API, switch sidebar counts to the server endpoint, and remove dead reducer actions.

**Architecture:**
- `loadState()` calls `listAssets` twice (active + trash, deduped) and includes the server's `sidebarCounts` in the returned UI state.
- `App.tsx` reads sidebar counts from `state.ui.sidebarCounts` (server truth) and refetches on a 500ms debounce whenever `state.assets` changes.
- `handleEmptyTrash` calls `apiEmptyTrash(orgId)` (was previously local-only — silently left trashed rows on the server).
- Five reducer actions that nothing dispatches (`DELETE_ASSET`, `RESTORE_ASSET`, `PERMANENT_DELETE`, `EMPTY_TRASH`, `BATCH_DELETE`) are removed from the action union and reducer.

**Tech Stack:** React 19, TypeScript 5.6 strict, Vitest 2, `@testing-library/react`, Playwright (visual).

---

## Working directory

All commands run inside the worktree at `D:\DAM-Link-Backend\.worktrees\trash-refresh`. The branch is `feat/web-trash-refresh`. Tag to use on completion: `trash-refresh-v0.14.0`.

---

## File map

| File | Change |
|------|--------|
| `packages/web/src/state/types.ts` | Add `sidebarCounts: SidebarCounts \| null` to `UIState` |
| `packages/web/src/state/initialUI.ts` | Add `sidebarCounts: null` field |
| `packages/web/src/state/persistence.ts` | Fetch active + trash + counts; use `initialUI`; populate `sidebarCounts` |
| `packages/web/src/state/actions.ts` | Add `SET_SIDEBAR_COUNTS`; remove 5 dead actions |
| `packages/web/src/state/reducer.ts` | Handle `SET_SIDEBAR_COUNTS`; remove 5 dead `case` blocks |
| `packages/web/src/App.tsx` | Read `state.ui.sidebarCounts`; debounced refetch `useEffect`; `handleEmptyTrash` calls `apiEmptyTrash` |
| `packages/web/tests/persistence.test.ts` | 2 new tests (trash fetch, counts stored) |
| `packages/web/tests/App.handlers.test.tsx` | 2 new tests (emptyTrash calls API, counts displayed from state) |
| `packages/web/tests/reducer.sidebarCounts.test.ts` | 1 new test (SET_SIDEBAR_COUNTS) |

---

## Task 1: Add `sidebarCounts` to `UIState`

**Files:**
- Modify: `packages/web/src/state/types.ts:60-78`
- Modify: `packages/web/src/state/initialUI.ts:5-24`
- Modify: `packages/web/src/state/actions.ts:46-60` (the structural `AppState.ui` mirror)

- [ ] **Step 1: Add field to `UIState` in `types.ts`**

In `packages/web/src/state/types.ts`, change the `UIState` interface (lines 60-78). Add a new field after `activeOrgId`:

```ts
export interface UIState {
  searchQuery: string;
  selection: SidebarSelection;
  viewMode: ViewMode;
  selectedAssetId: string | null;
  filterPanelOpen: boolean;
  uploadDialogOpen: false;
  filter: FilterState;
  selectedIds: string[];
  sortKey: SortKey;
  sortDir: SortDir;
  activeOrgId: string | null;
  /** Server-side counts for the sidebar (authoritative, refetched on a
   *  debounce). `null` until the first `loadState()` completes. The
   *  shape matches the `GET /sidebar-counts` response (`SidebarCounts`
   *  in `@dam-link/contracts`). */
  sidebarCounts: SidebarCounts | null;
}
```

Add the import at the top of the file (next to the existing type-only imports):

```ts
import type { SidebarCounts } from '@dam-link/contracts';
```

- [ ] **Step 2: Add the same field to `initialUI`**

In `packages/web/src/state/initialUI.ts`, add `sidebarCounts: null,` as the last property of the returned object (after `activeOrgId`).

- [ ] **Step 3: Update the structural mirror in `actions.ts`**

`actions.ts` declares a local structural `AppState` (lines 46-60) to avoid a circular import. Add the new field so `HYDRATE_STATE` payloads still type-check. Inside the `ui: { ... }` object, add `sidebarCounts: SidebarCounts | null;`. Import `SidebarCounts` from `@dam-link/contracts`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd packages/web && npx tsc -b`
Expected: Errors only related to existing consumers of the old shape (none yet — keep going).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/types.ts packages/web/src/state/initialUI.ts packages/web/src/state/actions.ts
git commit -m "feat(web): add sidebarCounts to UIState"
```

---

## Task 2: Add `SET_SIDEBAR_COUNTS` action and reducer case

**Files:**
- Modify: `packages/web/src/state/actions.ts:10-41`
- Modify: `packages/web/src/state/reducer.ts:39-147`
- Create: `packages/web/tests/reducer.sidebarCounts.test.ts`

- [ ] **Step 1: Add the new action variant**

In `packages/web/src/state/actions.ts`, add to the `Action` union (right after the `BATCH_REMOVE_TAG` line, but before the closing semicolon):

```ts
  | { type: 'SET_SIDEBAR_COUNTS'; counts: SidebarCounts }
```

Add `import type { SidebarCounts } from '@dam-link/contracts';` at the top.

- [ ] **Step 2: Write the failing reducer test**

Create `packages/web/tests/reducer.sidebarCounts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reducer } from '../src/state/reducer';
import type { AppState } from '../src/state/types';
import type { SidebarCounts } from '@dam-link/contracts';

function makeState(): AppState {
  return {
    assets: [],
    ui: {
      searchQuery: '',
      selection: { kind: 'all' },
      viewMode: 'grid',
      selectedAssetId: null,
      filterPanelOpen: false,
      uploadDialogOpen: false,
      filter: { typeFilter: [], formatFilter: [], sizeBucket: null, dateBucket: 'all', uploaderFilter: [] },
      selectedIds: [],
      sortKey: 'date',
      sortDir: 'desc',
      activeOrgId: 'org-1',
      sidebarCounts: null,
    },
  };
}

const FAKE_COUNTS: SidebarCounts = {
  byType: { image: 3, video: 1, document: 0, audio: 0 },
  byTag: [{ name: 'logo', count: 2 }],
  favorites: 1,
  trash: 4,
};

describe("reducer — SET_SIDEBAR_COUNTS", () => {
  it('replaces state.ui.sidebarCounts with the new value', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'SET_SIDEBAR_COUNTS', counts: FAKE_COUNTS });
    expect(s1.ui.sidebarCounts).toEqual(FAKE_COUNTS);
  });

  it('does not mutate the input state', () => {
    const s0 = makeState();
    const snapshot = JSON.stringify(s0);
    reducer(s0, { type: 'SET_SIDEBAR_COUNTS', counts: FAKE_COUNTS });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('preserves unrelated ui fields', () => {
    const s0 = makeState();
    s0.ui.searchQuery = 'logo';
    s0.ui.activeOrgId = 'org-99';
    const s1 = reducer(s0, { type: 'SET_SIDEBAR_COUNTS', counts: FAKE_COUNTS });
    expect(s1.ui.searchQuery).toBe('logo');
    expect(s1.ui.activeOrgId).toBe('org-99');
  });
});
```

- [ ] **Step 3: Run the new test, see it fail**

Run: `cd packages/web && npx vitest run tests/reducer.sidebarCounts.test.ts`
Expected: TypeScript error or "ReferenceError" because the reducer case doesn't exist yet.

- [ ] **Step 4: Implement the reducer case**

In `packages/web/src/state/reducer.ts`, add a new case before the `default` case (around line 144):

```ts
    case 'SET_SIDEBAR_COUNTS':
      return { ...state, ui: { ...state.ui, sidebarCounts: action.counts } };
```

- [ ] **Step 5: Run the test, see it pass**

Run: `cd packages/web && npx vitest run tests/reducer.sidebarCounts.test.ts`
Expected: 3/3 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/state/actions.ts packages/web/src/state/reducer.ts packages/web/tests/reducer.sidebarCounts.test.ts
git commit -m "feat(web): SET_SIDEBAR_COUNTS action + reducer case"
```

---

## Task 3: `loadState()` fetches active + trash + counts (the primary bug)

**Files:**
- Modify: `packages/web/src/state/persistence.ts:1-46`
- Modify: `packages/web/tests/persistence.test.ts:1-52`

- [ ] **Step 1: Write the failing test for trash fetch + counts**

Add to `packages/web/tests/persistence.test.ts`, inside the `describe` block:

```ts
  it('fetches both active and trashed assets and includes server counts', async () => {
    const ACTIVE_ID = '11111111-1111-4111-8111-aaaaaaaaaaaa';
    const TRASH_ID = '22222222-2222-4222-8222-bbbbbbbbbbbb';
    const ACTIVE = {
      id: ACTIVE_ID, orgId: 'org-1', name: 'active.png', type: 'image' as const,
      format: 'PNG', size: 1024, mimeType: 'image/png',
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null,
      objectKey: `originals/org-1/${ACTIVE_ID}`, status: 'ready' as const,
      visibility: 'org' as const, width: 100, height: 100,
      thumbnailKey: null, thumbnailUrl: null,
    };
    const TRASHED = { ...ACTIVE, id: TRASH_ID, name: 'old.png', deletedAt: '2026-06-05T00:00:00.000Z' };

    vi.mocked(me).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c', displayName: 'A', createdAt: '2026-06-06T00:00:00.000Z' },
      orgs: [],
    });
    vi.mocked(listMyOrgs).mockResolvedValue([
      { org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-06T00:00:00.000Z' }, role: 'owner' },
    ]);
    // First call → active; second call → trash.
    vi.mocked(listAssets)
      .mockResolvedValueOnce({ items: [ACTIVE], nextCursor: null })
      .mockResolvedValueOnce({ items: [TRASHED], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({
      byType: { image: 1, video: 0, document: 0, audio: 0 },
      byTag: [],
      favorites: 0,
      trash: 1,
    });

    const s = await loadState();
    expect(s).not.toBeNull();
    // Both calls were made with the right args.
    expect(listAssets).toHaveBeenCalledTimes(2);
    expect(listAssets).toHaveBeenNthCalledWith(
      1, 'org-1', expect.objectContaining({ inTrash: undefined }),
    );
    expect(listAssets).toHaveBeenNthCalledWith(
      2, 'org-1', expect.objectContaining({ inTrash: true }),
    );
    // Both assets are in the returned state.
    expect(s!.assets.map((a) => a.id).sort()).toEqual([ACTIVE_ID, TRASH_ID].sort());
    // The trashed one has deletedAt set.
    const trashAsset = s!.assets.find((a) => a.id === TRASH_ID)!;
    expect(trashAsset.deletedAt).toBe('2026-06-05T00:00:00.000Z');
    // The server counts are stored in ui.
    expect(s!.ui.sidebarCounts).toEqual({
      byType: { image: 1, video: 0, document: 0, audio: 0 },
      byTag: [],
      favorites: 0,
      trash: 1,
    });
  });
```

- [ ] **Step 2: Run, see it fail**

Run: `cd packages/web && npx vitest run tests/persistence.test.ts`
Expected: This new test fails (and probably 1-2 others from the existing file because the API is only called once today).

- [ ] **Step 3: Update `loadState()` in `persistence.ts`**

Replace the function body (lines 12-30) with:

```ts
export async function loadState(): Promise<AppState | null> {
  try {
    const meRes = await me();
    if (!meRes.user) return null;
    const orgs = await listMyOrgs();
    const firstOrg = orgs[0];
    if (!firstOrg) {
      return { assets: [], ui: { ...initialUI, sidebarCounts: null } };
    }
    const listArgs = { limit: 200, sort: 'uploadedAt:desc', dateBucket: 'all' } as const;
    const [activeRes, trashRes] = await Promise.all([
      listAssets(firstOrg.org.id, listArgs),
      listAssets(firstOrg.org.id, { ...listArgs, inTrash: true }),
    ]);
    // The server's default `buildWhereClause` is "active only" so the
    // trash list excludes soft-deleted. The two lists should be disjoint
    // (a row can't be both active and trashed) but we dedupe defensively
    // in case the server contract changes.
    const seen = new Set<string>();
    const items = [...activeRes.items, ...trashRes.items].filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    const counts = await sidebarCounts(firstOrg.org.id).catch(() => null);
    return {
      assets: items.map(apiAssetToLocal),
      ui: { ...initialUI, activeOrgId: firstOrg.org.id, sidebarCounts: counts },
    };
  } catch {
    return null;
  }
}
```

Delete the local `defaultUI()` function at lines 32-46 of the same file (we now use `initialUI` from `./initialUI.js`).

Update the import block at the top to:

```ts
import { me } from '../api/auth.js';
import { listMyOrgs } from '../api/orgs.js';
import { listAssets, sidebarCounts } from '../api/assets.js';
import { initialUI } from './initialUI.js';
import type { AppState } from './types.js';
import { apiAssetToLocal } from './assetAdapter.js';
```

- [ ] **Step 4: Run, see all persistence tests pass**

Run: `cd packages/web && npx vitest run tests/persistence.test.ts`
Expected: All 4 tests pass (3 existing + 1 new). The 3 existing tests need updating because `loadState` now calls `listAssets` once OR `listAssets` and `sidebarCounts`. The existing tests at lines 18-45 already mock both — they just don't assert the call shape, so they should still pass without changes. The test at lines 47-51 (`me() throws`) is unaffected.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/persistence.ts packages/web/tests/persistence.test.ts
git commit -m "fix(web): loadState fetches trash + server counts (recycle bin bug)"
```

---

## Task 4: `App.tsx` reads from `state.ui.sidebarCounts` (with debounced refetch)

**Files:**
- Modify: `packages/web/src/App.tsx:1-50, 128, 267-279`
- Modify: `packages/web/tests/App.handlers.test.tsx:1-220`

- [ ] **Step 1: Add a debounced refetch effect in `App.tsx`**

In `packages/web/src/App.tsx`, add a `useEffect` import (already imported on line 1: `useState, useMemo, useCallback, useEffect`). Add the helper just below the existing `counts` useMemo on line 128:

```ts
  // Debounced refetch of server sidebar counts whenever the in-memory
  // assets change. 500ms is short enough to feel live, long enough to
  // coalesce bursts (e.g. batch delete of 50 items).
  useEffect(() => {
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      sidebarCounts(orgId)
        .then((c) => {
          if (!cancelled) dispatch({ type: 'SET_SIDEBAR_COUNTS', counts: c });
        })
        .catch(() => { /* silent — counts will refresh on next action */ });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.assets, state.ui.activeOrgId, dispatch]);
```

Import `sidebarCounts` from `./api/assets.js` (extend the existing import on lines 36-41):

```ts
import {
  updateAsset,
  softDelete as apiSoftDelete,
  restore as apiRestore,
  permanentDelete as apiPermanentDelete,
  emptyTrash as apiEmptyTrash,
  sidebarCounts,
} from './api/assets.js';
```

- [ ] **Step 2: Replace the local `selectSidebarCounts` read in `App.tsx`**

Change line 128 from:

```ts
  const counts = useMemo(() => selectSidebarCounts(state.assets), [state.assets]);
```

to:

```ts
  // Sidebar counts come from the server (authoritative across reloads and
  // for orgs that have more than `limit: 200` assets). Falls back to an
  // empty shell while the first fetch is in flight.
  const counts = state.ui.sidebarCounts ?? EMPTY_COUNTS;
```

Add the constant at the top of the file (after imports, before the component):

```ts
const EMPTY_COUNTS: SidebarCounts = {
  byType: { image: 0, video: 0, document: 0, audio: 0 },
  byTag: [],
  favorites: 0,
  trash: 0,
};
```

Add the import for `SidebarCounts`:

```ts
import type { Asset, SidebarSelection } from './state/types';
import type { SidebarCounts } from '@dam-link/contracts';
```

Remove the now-unused `selectSidebarCounts` import from the `state/selectors` import (line 29).

- [ ] **Step 3: Wire `handleEmptyTrash` to the API**

Replace `handleEmptyTrash` (lines 267-279) with:

```ts
  async function handleEmptyTrash() {
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    const ok = await confirm({
      title: '清空回收站',
      body: '确定要清空回收站吗？此操作不可撤销。',
      confirmLabel: '清空',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    const before = state.assets;
    const { nextState } = emptyTrash({ assets: before, ui: state.ui });
    dispatch({
      type: 'HYDRATE_STATE',
      state: { assets: nextState.assets, ui: { ...nextState.ui, selectedAssetId: null } },
    });
    try {
      await apiEmptyTrash(orgId);
      toast.showToast({ message: '回收站已清空', variant: 'success' });
    } catch {
      dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
      toast.showToast({ message: '清空回收站失败', variant: 'error' });
    }
  }
```

(`emptyTrash` from `./state/assetOps` is the local op; `apiEmptyTrash` is the server call. Both are now used.)

- [ ] **Step 4: Update the existing App test mocks**

In `packages/web/tests/App.handlers.test.tsx`:

- Add `emptyTrash` to the `vi.mock` for `assets.js` (line 11-20). It's already there.
- The existing `mountAppWithAsset` helper (lines 71-110) and `mountWithTwoAssets` (lines 124-176) mock `sidebarCounts` to return zeros. With the new behavior, the App shows these counts in the sidebar. No assertion breaks.

- [ ] **Step 5: Write the new test for `handleEmptyTrash`**

Add to `packages/web/tests/App.handlers.test.tsx` (a new `describe` block, after the existing one):

```ts
describe('App — handleEmptyTrash', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiEmptyTrash after the user confirms', async () => {
    const user = userEvent.setup();
    const asset = makeApiAsset({ id: 'a1', name: 'old.png' });
    await mountAppWithAsset(asset);

    // Click the sidebar 回收站 entry.
    await user.click(screen.getByRole('button', { name: /回收站/ }));

    // Confirm dialog: click the confirm button.
    await user.click(screen.getByRole('button', { name: /^清空$/ }));

    await waitFor(() => {
      expect(vi.mocked(emptyTrash)).toHaveBeenCalledWith('org-1');
    });
  });

  it('does NOT call apiEmptyTrash when the user cancels', async () => {
    const user = userEvent.setup();
    const asset = makeApiAsset({ id: 'a1', name: 'old.png' });
    await mountAppWithAsset(asset);

    await user.click(screen.getByRole('button', { name: /回收站/ }));
    await user.click(screen.getByRole('button', { name: /^取消$/ }));

    // Wait a tick to make sure no API call sneaks in.
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(emptyTrash)).not.toHaveBeenCalled();
  });
});
```

Import `emptyTrash` alongside the other API imports at the top of the file (extend the existing import on lines 28-35):

```ts
import {
  listAssets,
  sidebarCounts,
  updateAsset,
  softDelete,
  restore,
  getDownloadUrl,
  emptyTrash,
} from '../src/api/assets.js';
```

- [ ] **Step 6: Write the new test for sidebar counts from state**

Add to `packages/web/tests/App.handlers.test.tsx`:

```ts
describe('App — sidebar counts from state.ui.sidebarCounts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('displays the server-provided counts in the sidebar', async () => {
    const asset = makeApiAsset({ id: 'a1', name: 'a.png' });
    // Override the default zero counts.
    vi.mocked(me).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c', displayName: 'A', createdAt: '2026-06-06T00:00:00.000Z' },
      orgs: [],
    });
    vi.mocked(listMyOrgs).mockResolvedValue([
      { org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-06T00:00:00.000Z' }, role: 'owner' },
    ]);
    vi.mocked(listAssets).mockResolvedValue({ items: [asset], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({
      byType: { image: 7, video: 2, document: 0, audio: 0 },
      byTag: [],
      favorites: 1,
      trash: 5,
    });

    render(
      <StoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StoreProvider>,
    );
    await screen.findByText('a.png');

    // 回收站 sidebar count should be 5 (from sidebarCounts mock).
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 7: Run, see new tests pass and existing ones still pass**

Run: `cd packages/web && npx vitest run tests/App.handlers.test.tsx`
Expected: All old tests pass + 3 new tests pass (2 for handleEmptyTrash + 1 for counts).

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/App.tsx packages/web/tests/App.handlers.test.tsx
git commit -m "feat(web): App reads sidebar counts from state, handleEmptyTrash calls API"
```

---

## Task 5: Remove dead actions and reducer cases

**Files:**
- Modify: `packages/web/src/state/actions.ts:10-41`
- Modify: `packages/web/src/state/reducer.ts:39-147`

The dead actions (none dispatched anywhere in `packages/web/src/`) are:
- `DELETE_ASSET`
- `RESTORE_ASSET`
- `PERMANENT_DELETE`
- `EMPTY_TRASH`
- `BATCH_DELETE`

Plan-15 generalization rule: a reducer action that exists in the union but is never dispatched is dead code awaiting a consumer. Remove it.

- [ ] **Step 1: Verify they are dead**

Run: `cd packages/web && grep -rn "type: 'DELETE_ASSET'\|type: 'RESTORE_ASSET'\|type: 'PERMANENT_DELETE'\|type: 'EMPTY_TRASH'\|type: 'BATCH_DELETE'" src/`

Expected: Only matches in `actions.ts` (the union) and `reducer.ts` (the case blocks). No `dispatch({ type: ... })` call sites.

- [ ] **Step 2: Remove from the action union**

In `packages/web/src/state/actions.ts`, delete these 5 lines from the union:

```ts
  | { type: 'DELETE_ASSET'; id: string; deletedAt: string }
  | { type: 'RESTORE_ASSET'; id: string }
  | { type: 'PERMANENT_DELETE'; id: string }
  | { type: 'EMPTY_TRASH' }
  | { type: 'BATCH_DELETE'; ids: string[]; when: Date }
```

The remaining `Action` union is the new, smaller shape. The `Asset` ops (`deleteAsset`, `restoreAsset`, `permanentDelete`, `emptyTrash`) in `assetOps.ts` stay — they're used by `App.tsx`.

- [ ] **Step 3: Remove the dead reducer cases**

In `packages/web/src/state/reducer.ts`, delete the case blocks for the 5 actions:

- `case 'DELETE_ASSET':` (lines 104-110)
- `case 'RESTORE_ASSET':` (lines 111-117)
- `case 'PERMANENT_DELETE':` (lines 118-127)
- `case 'EMPTY_TRASH':` (lines 128-133)
- `case 'BATCH_DELETE':` (lines 134-143)

The `case 'default': return state;` stays at the end.

- [ ] **Step 4: Run the full web test suite**

Run: `cd packages/web && npx vitest run`
Expected: All tests pass (no behavior change, only dead code removed).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/actions.ts packages/web/src/state/reducer.ts
git commit -m "refactor(web): remove 5 dead reducer actions (DELETE_ASSET et al.)"
```

---

## Task 6: Visual verification (Playwright)

**Files:**
- Create: `docs/superpowers/plans/screenshots/P16/` directory

- [ ] **Step 1: Start the backend + web dev servers**

Open two terminals.

Terminal 1 (API):
```bash
cd packages/api && pnpm dev
```

Terminal 2 (web):
```bash
cd packages/web && pnpm dev
```

Wait for both to be ready (Vite prints "ready in Xms"; API prints "Server listening at http://0.0.0.0:3000").

- [ ] **Step 2: Playwright script — verify the bug is fixed**

Create `tmp/p16-trash-verify.mjs` (gitignored; ephemeral). The script logs in, soft-deletes an asset, reloads the page, then verifies the trashed card is visible after clicking the 回收站 sidebar entry.

```js
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/superpowers/plans/screenshots/P16';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://localhost:5173/login');
await page.fill('input[type="email"]', 'e2e@dam-link.local');
await page.fill('input[type="password"]', 'TestPass123!');
await page.click('button[type="submit"]');
await page.waitForSelector('text=资源库');

// 1. Soft-delete the first asset via the DetailPanel.
// The asset card is a button whose aria-label is "${name}，${size}".
const firstCard = page.locator('button[aria-label]').first();
await firstCard.waitFor({ timeout: 10_000 });
const cardLabel = await firstCard.getAttribute('aria-label');
await firstCard.click();
await page.click('button:has-text("删除")');
await page.waitForSelector('text=已移到回收站');

// 2. Reload the page (this is the bug repro — trash was empty after reload).
await page.reload();
await page.waitForSelector('text=资源库');
await page.screenshot({ path: `${OUT}/01-after-reload-sidebar.png` });

// 3. Click the 回收站 sidebar entry.
await page.click('button:has-text("回收站")');
await page.waitForTimeout(500); // allow grid to render
await page.screenshot({ path: `${OUT}/02-trash-grid-with-item.png` });

// 4. Assert the same asset card is now visible.
const trashCard = page.locator(`button[aria-label="${cardLabel}"]`);
const visible = await trashCard.isVisible();
if (!visible) {
  throw new Error(`FAIL: trashed asset "${cardLabel}" not visible after reload`);
}
console.log(`PASS: trashed asset "${cardLabel}" is visible in the trash view after reload.`);

await browser.close();
```

- [ ] **Step 3: Run the script**

Run: `cd packages/web && node ../../tmp/p16-trash-verify.mjs`
Expected: "PASS: trashed asset is visible in the trash view after reload."

- [ ] **Step 4: Inspect the screenshots**

Open `docs/superpowers/plans/screenshots/P16/01-after-reload-sidebar.png` — the sidebar should show "回收站 1" (or however many trashed items there are).

Open `docs/superpowers/plans/screenshots/P16/02-trash-grid-with-item.png` — the main grid should show the trashed asset card.

- [ ] **Step 5: Commit the screenshots**

```bash
git add docs/superpowers/plans/screenshots/P16/
git commit -m "docs: visual verification of trash refresh after reload (P16)"
```

---

## Task 7: Full test suite, tag, merge, cleanup

- [ ] **Step 1: Run the full test suite**

Run: `pnpm -r test --run`
Expected: All packages pass. Web should have ~470 tests now (was 452 before; +3 reducer/handler/persistence tests, +3 App handler tests, ≈+10%).

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm -r typecheck && pnpm -r lint`
Expected: 0 errors.

- [ ] **Step 3: Tag the merge commit**

The work is on `feat/web-trash-refresh` branch. After merging to main:

```bash
git checkout main
git merge --no-ff feat/web-trash-refresh -m "Merge branch 'feat/web-trash-refresh' into main"
git tag -a trash-refresh-v0.14.0 -m "Trash view refresh + sidebar counts + dead code cleanup"
```

- [ ] **Step 4: Reinstall lockfile dependencies after merge**

```bash
pnpm install --frozen-lockfile
```

(This is the project's documented gotcha: after merge, the lockfile may have new entries that `node_modules/` doesn't have yet. Found in Plan 9.)

- [ ] **Step 5: Remove the worktree and delete the branch**

```bash
git worktree remove .worktrees/trash-refresh
git branch -d feat/web-trash-refresh
```

- [ ] **Step 6: Update `MEMORY.md`**

Append a new bullet to the "Project at a glance" section documenting this plan, following the existing format. Include the worktree path, tag, test count, plan markdown path, the 4 fixes, and 1-2 generalization rules.

---

## Self-review checklist (run after writing the plan)

- [ ] **Spec coverage:** all 4 fixes have at least one task. ✓
- [ ] **Type consistency:** `UIState.sidebarCounts` added in Task 1, consumed in Task 2 (reducer), populated in Task 3 (loadState), consumed in Task 4 (App). ✓
- [ ] **No placeholders:** every step has the actual code or command. ✓
- [ ] **No "similar to Task N":** repeated content where needed. ✓
- [ ] **Tests are concrete:** every new test has the full body, not "write a test that...". ✓
- [ ] **Commit messages follow Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`). ✓

---

## Out of scope (deferred to a follow-up plan if needed)

- Refetching the asset list (not just counts) when the user changes org or the trash view when it has > 200 items.
- Replacing the optimistic-dispatch pattern in `handleDelete` / `handleRestore` / `handleEmptyTrash` with a single "intent → server response → state merge" pipeline.
- Per-row optimistic dirty flags so concurrent edits from other tabs can be reconciled.
- The "dimensions field empty until refresh" race condition noted at the end of Plan 15.
