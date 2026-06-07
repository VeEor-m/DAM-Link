# Upload Local Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the user finishes uploading one or more files, the newly uploaded assets appear in the grid immediately — no full page reload, no manual `loadState()` re-run.

**Architecture:** TDD red→green→commit per task. The `useUpload` hook gains an `onUploaded(serverId: string)` callback that fires on every successful upload+finalize. The `UploadDialog` provides a callback that fetches the full asset via `getAsset(orgId, serverId)`, maps the API `Asset` to the local UI `Asset` shape (the same mapper used by `persistence.ts`), and dispatches `ADD_ASSET`. The store's `ADD_ASSET` action (defined in `actions.ts` since Plan 8 but never wired up) prepends the new asset. No new backend endpoints, no new schemas, no new dependencies. One small helper (`apiAssetToLocal`) is extracted from `persistence.ts` to avoid the 12-field map being duplicated in two places.

**Tech Stack:** React 19 + Vite + TypeScript 5.6 strict + Vitest 4 + jsdom (frontend only). Patterns: existing `ADD_ASSET` action (discriminated union, never used), `useReducer` + Context store, `useStore()` hook for dispatch, `_thumbnailUrl` leading-underscore convention for presigned URLs (Plan 13), `ApiError` for failure surfacing.

---

## File Structure

### Modified files
- `packages/web/src/hooks/useUpload.ts` — add `onUploaded` callback to the hook signature; call it on `status: 'done'` with the server asset id
- `packages/web/src/state/persistence.ts` — extract `apiAssetToLocal(a: ApiAsset): LocalAsset` helper; use it in `loadState()`
- `packages/web/src/components/upload/UploadDialog.tsx` — wire `onUploaded` callback: `getAsset` → `apiAssetToLocal` → `dispatch({ type: 'ADD_ASSET', asset })`

### New files
- `packages/web/src/state/assetAdapter.ts` — new home for `apiAssetToLocal` (extracted from `persistence.ts`)
- `packages/web/tests/assetAdapter.test.ts` — unit tests for the mapper (covers 15 fields, nullable/optional, `_thumbnailUrl` extraction)
- `packages/web/tests/useUpload.test.ts` — hook-level tests with mocked `initiateUpload`/`directPut`/`finalizeUpload` (covers: callback fires with correct id, callback not called on error, sequential uploads each fire the callback)

### New tests
- `packages/web/tests/UploadDialog.integration.test.tsx` — render `<UploadDialog open />` with a mocked `useUpload` that fires `onUploaded`, assert `getAsset` is called, `dispatch({ type: 'ADD_ASSET' })` is dispatched, and the new asset card appears in the underlying grid (use a sibling `<TestGrid>` consumer that renders `state.assets`)

### State addition (for reference, repeated in Task 1)
The store's `ADD_ASSET` reducer case (in `packages/web/src/state/reducer.ts` or wherever the reducer lives) must insert the asset at the head of `state.assets` (newest first, matches the `uploadedAt:desc` default sort). The case may already exist; this task verifies and patches it.

### Conventions
- All copy / error messages in Chinese (project convention).
- `toast.showToast` uses the existing `<ToastProvider>` context.
- `ApiError` from `api/client.js` for failure surfacing.
- The `onUploaded` callback is **fire-and-forget** — failures inside the callback (e.g. `getAsset` 500) are caught inside the callback and surfaced via `toast.showToast`; they do NOT roll back the upload (the server already has the asset).

---

## Task 1: Extract `apiAssetToLocal` helper from `persistence.ts`

**Files:**
- Create: `packages/web/src/state/assetAdapter.ts`
- Modify: `packages/web/src/state/persistence.ts` (replace the inline `items.map(...)` with `apiAssetToLocal(a)`)
- Create: `packages/web/tests/assetAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/tests/assetAdapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { apiAssetToLocal } from '../src/state/assetAdapter';
import type { Asset as ApiAsset } from '@dam-link/contracts';

const baseApiAsset: ApiAsset = {
  id: 'a1',
  name: 'cat.png',
  type: 'image',
  format: 'PNG',
  size: 1024,
  uploadedAt: '2026-06-07T00:00:00.000Z',
  uploadedBy: 'u1',
  tags: ['cute'],
  favorite: false,
  deletedAt: null,
  width: 800,
  height: 600,
  duration: null,
  visibility: 'private',
  thumbnailUrl: 'https://cdn/x.png?sig=abc',
};

describe('apiAssetToLocal', () => {
  it('maps all 13 known fields from API shape to UI shape', () => {
    const local = apiAssetToLocal(baseApiAsset);
    expect(local).toEqual({
      id: 'a1',
      name: 'cat.png',
      type: 'image',
      format: 'PNG',
      size: 1024,
      uploadedAt: '2026-06-07T00:00:00.000Z',
      uploadedBy: 'u1',
      tags: ['cute'],
      favorite: false,
      deletedAt: null,
      width: 800,
      height: 600,
      duration: undefined,
      _thumbnailUrl: 'https://cdn/x.png?sig=abc',
    });
  });

  it('coerces null width/height/duration to undefined for optional-chaining safety', () => {
    const local = apiAssetToLocal({ ...baseApiAsset, width: null, height: null, duration: null });
    expect(local.width).toBeUndefined();
    expect(local.height).toBeUndefined();
    expect(local.duration).toBeUndefined();
  });

  it('preserves null thumbnailUrl as _thumbnailUrl: null (UI falls back to emoji)', () => {
    const local = apiAssetToLocal({ ...baseApiAsset, thumbnailUrl: null });
    expect(local._thumbnailUrl).toBeNull();
  });

  it('does NOT include `visibility` (UI Asset type does not declare it)', () => {
    const local = apiAssetToLocal(baseApiAsset) as Record<string, unknown>;
    expect('visibility' in local).toBe(false);
  });

  it('does NOT include `thumbnailUrl` (UI uses _thumbnailUrl only)', () => {
    const local = apiAssetToLocal(baseApiAsset) as Record<string, unknown>;
    expect('thumbnailUrl' in local).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test -- tests/assetAdapter.test.ts`
Expected: FAIL — `assetAdapter` module doesn't exist.

- [ ] **Step 3: Create `assetAdapter.ts`**

Create `packages/web/src/state/assetAdapter.ts`:

```ts
import type { Asset as ApiAsset } from '@dam-link/contracts';
import type { Asset as LocalAsset } from './types.js';

/**
 * Map the API's `Asset` shape to the UI's `Asset` shape.
 *
 * Two adjustments:
 *  - `width ?? null` / `height ?? null` / `duration ?? null` → `undefined`
 *    so optional-chaining (`a.width?.toFixed(0)`) is type-safe.
 *  - `thumbnailUrl` (presigned, expires) is renamed to `_thumbnailUrl`
 *    (leading underscore = runtime-only, never persisted). The `previewDataUrl`
 *    legacy field stays undefined.
 *
 * Single source of truth for the API↔UI shape mapping. Don't bypass this
 * by passing API responses directly into reducer actions.
 */
export function apiAssetToLocal(a: ApiAsset): LocalAsset {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    format: a.format,
    size: a.size,
    uploadedAt: a.uploadedAt,
    uploadedBy: a.uploadedBy,
    tags: a.tags,
    favorite: a.favorite,
    deletedAt: a.deletedAt,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    duration: a.duration ?? undefined,
    _thumbnailUrl: a.thumbnailUrl ?? null,
  };
}
```

- [ ] **Step 4: Replace inline mapper in `persistence.ts`**

In `packages/web/src/state/persistence.ts`, replace the `items.map((a) => ({...}))` block in `loadState()`:

```ts
import { me } from '../api/auth.js';
import { listMyOrgs } from '../api/orgs.js';
import { listAssets, sidebarCounts } from '../api/assets.js';
import type { AppState, UIState } from './types.js';
import { apiAssetToLocal } from './assetAdapter.js';

export async function loadState(): Promise<AppState | null> {
  try {
    const meRes = await me();
    if (!meRes.user) return null;
    const orgs = await listMyOrgs();
    const firstOrg = orgs[0];
    if (!firstOrg) {
      return { assets: [], ui: defaultUI() };
    }
    const { items } = await listAssets(firstOrg.org.id, { limit: 200, sort: 'uploadedAt:desc', dateBucket: 'all' });
    void (await sidebarCounts(firstOrg.org.id));
    return {
      assets: items.map(apiAssetToLocal),
      ui: { ...defaultUI(), activeOrgId: firstOrg.org.id },
    };
  } catch {
    return null;
  }
}

// ... defaultUI() and saveState() unchanged ...
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test -- tests/assetAdapter.test.ts`
Expected: 5 new tests PASS.

- [ ] **Step 6: Run full web test suite + tsc (regression check)**

```bash
cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test && pnpm --filter @dam-link/web exec tsc -b
```
Expected: all 219 tests (214 prior + 5 new) pass; tsc clean.

- [ ] **Step 7: Commit**

```bash
cd D:/DAM-Link-Backend
git add packages/web/src/state/assetAdapter.ts packages/web/src/state/persistence.ts packages/web/tests/assetAdapter.test.ts
git commit -m "feat(web): extract apiAssetToLocal mapper for API↔UI Asset shape"
```

---

## Task 2: `useUpload` hook — add `onUploaded` callback

**Files:**
- Modify: `packages/web/src/hooks/useUpload.ts` (add `onUploaded` parameter, fire on `status: 'done'`)
- Create: `packages/web/tests/useUpload.test.ts` (hook tests with mocked API)

- [ ] **Step 1: Check existing `useUpload` test (if any)**

Run: `ls D:/DAM-Link-Backend/packages/web/tests/ | grep -i upload`
If `useUpload.test.ts` exists, extend it. Otherwise create new.

- [ ] **Step 2: Write the failing test**

Create `packages/web/tests/useUpload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../src/api/uploads.js', () => ({
  initiateUpload: vi.fn(),
  directPut: vi.fn(),
  finalizeUpload: vi.fn(),
}));

import { useUpload } from '../src/hooks/useUpload';
import { initiateUpload, directPut, finalizeUpload } from '../src/api/uploads.js';

const baseInit = {
  assetId: 'srv-1',
  uploadUrl: 'https://s3/put?sig=abc',
  objectKey: 'originals/org-1/srv-1',
  expiresInSec: 300,
};

describe('useUpload — onUploaded callback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fires onUploaded with the server id after a successful upload', async () => {
    vi.mocked(initiateUpload).mockResolvedValue(baseInit);
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockResolvedValue({ id: 'srv-1', status: 'ready' });

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await act(async () => {
      await result.current.uploadMany([file]);
    });

    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith('srv-1');
    // Final status is 'done'
    expect(result.current.items[0]?.status).toBe('done');
  });

  it('does NOT fire onUploaded when directPut throws', async () => {
    vi.mocked(initiateUpload).mockResolvedValue(baseInit);
    vi.mocked(directPut).mockRejectedValue(new Error('network'));
    vi.mocked(finalizeUpload).mockResolvedValue({ id: 'srv-1', status: 'ready' });

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await act(async () => {
      await result.current.uploadMany([file]);
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(result.current.items[0]?.status).toBe('error');
  });

  it('does NOT fire onUploaded when finalizeUpload throws', async () => {
    vi.mocked(initiateUpload).mockResolvedValue(baseInit);
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockRejectedValue(new Error('500'));

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await act(async () => {
      await result.current.uploadMany([file]);
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(result.current.items[0]?.status).toBe('error');
  });

  it('fires onUploaded once per file when uploading multiple files sequentially', async () => {
    vi.mocked(initiateUpload).mockImplementation(async (_org, _input) => ({
      ...baseInit,
      assetId: `srv-${Math.random().toString(36).slice(2, 8)}`,
    }));
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockImplementation(async (_org, id) => ({
      id,
      status: 'ready' as const,
    }));

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.png', { type: 'image/png' }),
    ];
    await act(async () => {
      await result.current.uploadMany(files);
    });

    expect(onUploaded).toHaveBeenCalledTimes(3);
    // Items are all 'done'
    expect(result.current.items.every((i) => i.status === 'done')).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test -- tests/useUpload.test.ts`
Expected: FAIL — `useUpload` doesn't accept a second argument.

- [ ] **Step 4: Update `useUpload` signature**

Replace `packages/web/src/hooks/useUpload.ts`:

```ts
import { useCallback, useState } from 'react';
import { initiateUpload, finalizeUpload, directPut } from '../api/uploads.js';
import { ApiError } from '../api/client.js';

export interface UploadItem {
  id: string; // local temp id
  file: File;
  status: 'queued' | 'uploading' | 'finalizing' | 'done' | 'error';
  serverId?: string;
  error?: string;
  meta?: { width?: number; height?: number; duration?: number };
}

export interface UseUploadOptions {
  /**
   * Called with the server-side asset id when an upload + finalize succeeds.
   * The hook does NOT throw if the callback throws — failures are swallowed
   * (the upload itself has already succeeded on the server). The caller is
   * expected to handle the asset-id (e.g. fetch full Asset via getAsset and
   * dispatch ADD_ASSET).
   */
  onUploaded?: (serverId: string) => void;
}

export function useUpload(orgId: string, options: UseUploadOptions = {}) {
  const { onUploaded } = options;
  const [items, setItems] = useState<UploadItem[]>([]);

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const uploadOne = useCallback(
    async (item: UploadItem) => {
      try {
        const init = await initiateUpload(orgId, {
          filename: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          size: item.file.size,
          type: item.meta?.duration
            ? 'video'
            : item.file.type.startsWith('image/')
              ? 'image'
              : item.file.type.startsWith('video/')
                ? 'video'
                : item.file.type.startsWith('audio/')
                  ? 'audio'
                  : 'document',
          format: (item.file.name.split('.').pop() ?? 'bin').toUpperCase(),
        });
        updateItem(item.id, { status: 'uploading', serverId: init.assetId });
        await directPut(init.uploadUrl, item.file);
        updateItem(item.id, { status: 'finalizing' });
        await finalizeUpload(orgId, init.assetId, item.meta ?? {});
        updateItem(item.id, { status: 'done' });
        // Fire callback after the local state is updated so consumers that
        // immediately re-render see the 'done' row.
        try {
          onUploaded?.(init.assetId);
        } catch {
          // swallow — see UseUploadOptions.onUploaded doc
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unknown error';
        updateItem(item.id, { status: 'error', error: message });
      }
    },
    [orgId, onUploaded],
  );

  const uploadMany = useCallback(
    async (files: File[]) => {
      const newItems: UploadItem[] = files.map((f, idx) => ({
        id: `local-${Date.now()}-${idx}`,
        file: f,
        status: 'queued',
      }));
      setItems((cur) => [...cur, ...newItems]);
      for (const item of newItems) {
        await uploadOne(item);
      }
    },
    [uploadOne],
  );

  return { items, uploadMany };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test -- tests/useUpload.test.ts`
Expected: 4 new tests PASS.

- [ ] **Step 6: Run full web test suite + tsc**

```bash
cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test && pnpm --filter @dam-link/web exec tsc -b
```
Expected: all 223 tests (219 prior + 4 new) pass; tsc clean.

- [ ] **Step 7: Commit**

```bash
cd D:/DAM-Link-Backend
git add packages/web/src/hooks/useUpload.ts packages/web/tests/useUpload.test.ts
git commit -m "feat(web): useUpload fires onUploaded(serverId) callback on success"
```

---

## Task 3: Verify `ADD_ASSET` reducer case inserts at the head

**Files:**
- Modify: `packages/web/src/state/reducer.ts` (or wherever the reducer lives — likely `store.tsx` or a separate `reducer.ts`)

- [ ] **Step 1: Find the reducer**

Run: `cd D:/DAM-Link-Backend && grep -rn "case 'ADD_ASSET'" packages/web/src/`
Expected: a single match in the reducer. Read the file.

- [ ] **Step 2: Inspect the existing case**

If it exists, read it. The expected shape (newest first):

```ts
case 'ADD_ASSET':
  return { ...state, assets: [action.asset, ...state.assets] };
```

If it does NOT exist or is wrong, this task patches it.

- [ ] **Step 3: Write the failing test for reducer ADD_ASSET behavior**

Create `packages/web/tests/reducer.addAsset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reducer } from '../src/state/reducer';
import type { AppState, Asset } from '../src/state/types';

const baseAsset: Asset = {
  id: 'a1', name: 'a.png', type: 'image', format: 'PNG', size: 1,
  uploadedAt: '2026-06-07T00:00:00.000Z', uploadedBy: 'u1',
  tags: [], favorite: false, deletedAt: null,
};
const older: Asset = { ...baseAsset, id: 'a0', uploadedAt: '2026-06-06T00:00:00.000Z' };
const newer: Asset = { ...baseAsset, id: 'a2', uploadedAt: '2026-06-08T00:00:00.000Z' };

const emptyState: AppState = { assets: [baseAsset], ui: {} as AppState['ui'] };

describe('reducer — ADD_ASSET', () => {
  it('prepends the new asset (newest-first ordering)', () => {
    const next = reducer(emptyState, { type: 'ADD_ASSET', asset: newer });
    expect(next.assets[0]?.id).toBe('a2');
    expect(next.assets[1]?.id).toBe('a1');
  });

  it('does not mutate the input state', () => {
    const snapshot = [...emptyState.assets];
    reducer(emptyState, { type: 'ADD_ASSET', asset: older });
    expect(emptyState.assets).toEqual(snapshot);
  });

  it('does not deduplicate — adding an existing id leaves the list with a duplicate (caller is responsible for de-dup)', () => {
    const next = reducer(emptyState, { type: 'ADD_ASSET', asset: baseAsset });
    expect(next.assets.filter((a) => a.id === 'a1').length).toBe(2);
  });
});
```

- [ ] **Step 4: Run test to verify it fails or passes**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test -- tests/reducer.addAsset.test.ts`
Expected: depends on the existing reducer. If it already prepends, the test passes and you can skip Steps 5-7. If not, the test fails — proceed.

- [ ] **Step 5: If failing — patch the reducer**

Edit the reducer's `case 'ADD_ASSET'` to:

```ts
case 'ADD_ASSET':
  return { ...state, assets: [action.asset, ...state.assets] };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test -- tests/reducer.addAsset.test.ts`
Expected: 3 new tests PASS.

- [ ] **Step 7: Run full suite + tsc**

```bash
cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test && pnpm --filter @dam-link/web exec tsc -b
```
Expected: clean.

- [ ] **Step 8: Commit (only if Step 5 modified code)**

```bash
cd D:/DAM-Link-Backend
git add packages/web/src/state/reducer.ts packages/web/tests/reducer.addAsset.test.ts
git commit -m "test(web): cover ADD_ASSET reducer (prepend, immutable, no dedup)"
```

(If Step 5 was a no-op, skip the commit. The test file itself is still worth committing as a regression guard.)

---

## Task 4: Wire `UploadDialog` — `onUploaded` → `getAsset` → `ADD_ASSET`

**Files:**
- Modify: `packages/web/src/components/upload/UploadDialog.tsx` (add `onUploaded` prop to `UploadDialogBody`, pass to `useUpload`, do the getAsset + dispatch dance)
- Create: `packages/web/tests/UploadDialog.integration.test.tsx` (integration test)

- [ ] **Step 1: Find where `<UploadDialog>` is mounted**

Run: `cd D:/DAM-Link-Backend && grep -rn "UploadDialog" packages/web/src/App.tsx packages/web/src/components/`
Expected: 1-2 mount points. Identify the parent that has access to `dispatch`.

- [ ] **Step 2: Inspect the parent (likely `App.tsx` or a layout component)**

If `<UploadDialog>` is rendered inside `<App>`, you can pass `onUploaded` as a prop. If it's deeper (e.g. inside `Toolbar`), consider hoisting the callback through React context, or threading it via prop drilling (max 2 levels deep, acceptable).

- [ ] **Step 3: Write the failing integration test**

Create `packages/web/tests/UploadDialog.integration.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../src/api/auth.js', () => ({ me: vi.fn() }));
vi.mock('../src/api/orgs.js', () => ({
  listMyOrgs: vi.fn(),
  createOrg: vi.fn(),
}));
vi.mock('../src/api/assets.js', () => ({
  listAssets: vi.fn(),
  sidebarCounts: vi.fn(),
  getAsset: vi.fn(),
}));
vi.mock('../src/api/uploads.js', () => ({
  initiateUpload: vi.fn(),
  directPut: vi.fn(),
  finalizeUpload: vi.fn(),
}));

import { UploadDialog } from '../src/components/upload/UploadDialog';
import { StoreProvider } from '../src/state/store';
import { me } from '../src/api/auth.js';
import { listMyOrgs } from '../src/api/orgs.js';
import { listAssets, sidebarCounts, getAsset } from '../src/api/assets.js';
import { initiateUpload, directPut, finalizeUpload } from '../src/api/uploads.js';
import { useStore } from '../src/hooks/useStore';

const freshAsset = {
  id: 'srv-1',
  name: 'hello.png',
  type: 'image' as const,
  format: 'PNG',
  size: 1024,
  uploadedAt: '2026-06-07T08:00:00.000Z',
  uploadedBy: 'u1',
  tags: [],
  favorite: false,
  deletedAt: null,
  width: 800,
  height: 600,
  duration: null,
  visibility: 'private' as const,
  thumbnailUrl: 'https://cdn/hello.png?sig=abc',
};

function GridConsumer() {
  const { state } = useStore();
  return <ul data-testid="grid">{state.assets.map((a) => <li key={a.id}>{a.name}</li>)}</ul>;
}

describe('<UploadDialog> — ADD_ASSET after upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the full asset and dispatches ADD_ASSET after a successful upload', async () => {
    vi.mocked(me).mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', displayName: 'A' } });
    vi.mocked(listMyOrgs).mockResolvedValue([
      { org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-07T00:00:00.000Z' }, role: 'owner' },
    ]);
    vi.mocked(listAssets).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({ byType: {}, byTag: {}, favorites: 0, trash: 0 });
    vi.mocked(initiateUpload).mockResolvedValue({
      assetId: 'srv-1', uploadUrl: 'https://s3/put', objectKey: 'k', expiresInSec: 300,
    });
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockResolvedValue({ id: 'srv-1', status: 'ready' });
    vi.mocked(getAsset).mockResolvedValue(freshAsset);

    const user = userEvent.setup();
    render(
      <StoreProvider>
        <UploadDialog open onClose={() => {}} />
        <GridConsumer />
      </StoreProvider>,
    );
    await screen.findByText('正在准备…');

    // Simulate the DropZone firing onFiles
    const dropzone = await screen.findByText(/拖入文件|drop/i);
    void dropzone; // DropZone is exercised via onFiles prop in real usage

    // The real path: trigger the upload via a programmatic call to the
    // hidden <input type="file">. For a Vitest integration test, dispatch
    // the file-change event directly.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(getAsset).toHaveBeenCalledWith('org-1', 'srv-1');
    });
    await waitFor(() => {
      expect(screen.getByTestId('grid')).toHaveTextContent('hello.png');
    });
  });
});
```

(Adjust selectors to match DropZone's actual rendered text. The point of the test is `getAsset` is called + the asset appears in the grid; selectors are a means to that end.)

- [ ] **Step 4: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test -- tests/UploadDialog.integration.test.tsx`
Expected: FAIL — `onUploaded` is not wired, so `getAsset` is never called and the grid stays empty.

- [ ] **Step 5: Add `onUploaded` prop to `UploadDialogBody`**

In `packages/web/src/components/upload/UploadDialog.tsx`, modify `BodyProps` and `UploadDialogBody`:

```tsx
import { useStore } from '../../hooks/useStore';
import { getAsset } from '../../api/assets.js';
import { apiAssetToLocal } from '../../state/assetAdapter.js';
import { useToast } from '../common/Toast'; // or wherever the hook is exported
import type { Asset as ApiAsset } from '@dam-link/contracts';

interface BodyProps {
  orgId: string;
  onClose: () => void;
}

function UploadDialogBody({ orgId, onClose }: BodyProps) {
  const { dispatch } = useStore();
  const toast = useToast();

  const handleUploaded = async (serverId: string) => {
    try {
      const apiAsset = await getAsset(orgId, serverId);
      const local = apiAssetToLocal(apiAsset as ApiAsset);
      dispatch({ type: 'ADD_ASSET', asset: local });
    } catch (err) {
      toast.showToast({
        message: '已上传,但本地列表未能自动刷新。请刷新页面。',
        variant: 'error',
      });
    }
  };

  const { items, uploadMany } = useUpload(orgId, { onUploaded: handleUploaded });

  // ... rest of UploadDialogBody unchanged ...
}
```

(Adjust imports to match the actual `useToast` / `useStore` paths in the project. Read `UploadDialog.tsx` to see existing imports.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test -- tests/UploadDialog.integration.test.tsx`
Expected: 1 new test PASS.

- [ ] **Step 7: Run full suite + tsc**

```bash
cd D:/DAM-Link-Backend && pnpm --filter @dam-link/web test && pnpm --filter @dam-link/web exec tsc -b
```
Expected: all 224 tests pass; tsc clean.

- [ ] **Step 8: Commit**

```bash
cd D:/DAM-Link-Backend
git add packages/web/src/components/upload/UploadDialog.tsx packages/web/tests/UploadDialog.integration.test.tsx
git commit -m "feat(web): UploadDialog refreshes grid via ADD_ASSET after upload"
```

---

## Task 5: Visual verification (Playwright)

**Files:**
- Create: `docs/superpowers/plans/screenshots/P15/verify.py` + 2 PNGs (before + after upload)

- [ ] **Step 1: Start the dev servers**

```bash
cd D:/DAM-Link-Backend
# Terminal 1
pnpm --filter @dam-link/api dev
# Terminal 2
pnpm --filter @dam-link/web dev
```

Confirm: `curl -sI http://localhost:3000/healthz` → 200; `curl -sI http://localhost:5173` → 200.

- [ ] **Step 2: Create the Playwright script**

Create `docs/superpowers/plans/screenshots/P15/verify.py`. Use the `webapp-testing` skill's `with_server.py` pattern. The script:

1. Logs in as a self-test user.
2. Records the asset count in the grid (`page.locator('[data-testid="grid"] li').count()`).
3. Opens the UploadDialog and uploads a small test image.
4. Waits for the upload to reach `status: 'done'` (or just waits 3 seconds).
5. Asserts the grid count has increased by 1.
6. Asserts the new asset's name appears in the grid WITHOUT a page reload.
7. Takes a `before.png` and `after.png`.

(Reuse the login + asset-upload patterns from `docs/superpowers/plans/screenshots/P14/verify.py` and the T1-T12 scripts.)

- [ ] **Step 3: Run the script and confirm 1/1**

```bash
python with_server.py --server "pnpm -F @dam-link/api dev" --port 3000 \
  --server "pnpm -F @dam-link/web dev" --port 5173 \
  -- python docs/superpowers/plans/screenshots/P15/verify.py
```
Expected: exit 0. Console output: "Grid count before: N, after: N+1. PASS."

- [ ] **Step 4: Commit**

```bash
cd D:/DAM-Link-Backend
git add docs/superpowers/plans/screenshots/P15/
git commit -m "docs: visual verification of upload local refresh (P15)"
```

---

## Task 6: Update memory + merge to main

- [ ] **Step 1: Add Plan 15 entry to `memory/gotchas.md`**

Append a new section after Plan 14:

```markdown
# Plan 15 — Upload local refresh (2026-06-07)

## Symptom
- After the user finished uploading a file (status reached 'done' in the dialog), the new asset did NOT appear in the grid. The asset existed on the server (visible in MinIO + the database), but the user had to do a hard page refresh to see it.

## Root cause
- `useUpload` tracked local `UploadItem[]` state for progress display, but never called back to the parent when an upload completed. The store's `ADD_ASSET` action (defined since Plan 8) was never wired to anything — a "dead action" awaiting its first consumer.
- The mapper from API Asset → local UI Asset (12-field object literal) was inlined inside `loadState()`'s `items.map(...)`, so a second consumer would have had to copy-paste the mapping.

## Fix (worktree: TBD)
[elided — see plan at docs/superpowers/plans/2026-06-07-upload-local-refresh.md]

## Generalization rules
- **A reducer action that exists in the actions union but is never dispatched is a dead action waiting for its consumer.** Audit your action types: `rg "type: 'ADD_ASSET'" packages/web/src` (only the reducer should match; if no component matches, the action is unused). Either wire it up or remove it from the union.
- **The API↔UI mapper belongs in one file, not inline.** Any time you find yourself writing `items.map(a => ({ id: a.id, name: a.name, ... }))` more than once across the codebase, extract the mapper. The mapper is the *only* place the two shapes meet.
- **`onUploaded` callbacks should be fire-and-forget, not awaited.** Inside the hook, wrap the callback in `try { onUploaded?.(id) } catch {}` — the upload has already succeeded on the server; the callback is for UI-sync only and must not roll back state.
- **Don't poll for the new asset by re-running `loadState()`.** The full hydration is expensive (N+1 thumbnail URLs, sidebar counts) and stomps on optimistic local state. Use `ADD_ASSET` for the per-asset case and reserve `HYDRATE_STATE` for full refreshes.
```

- [ ] **Step 2: Commit the memory update**

Use the Edit tool on `C:\Users\Administrator\.claude\projects\D--DAM-Link-Backend\memory\gotchas.md`. (This is not a git commit in the worktree.)

- [ ] **Step 3: Merge to main**

```bash
cd D:/DAM-Link-Backend
git checkout main
git merge --no-ff feat/web-upload-local-refresh
pnpm install --frozen-lockfile  # per memory/gotchas.md Plan 9 gotcha
pnpm -r test                     # full suite
```

- [ ] **Step 4: Tag the release**

```bash
git tag upload-local-refresh-v0.13.0
```

- [ ] **Step 5: Clean up the worktree**

```bash
git worktree remove .worktrees/web-upload-local-refresh
git branch -d feat/web-upload-local-refresh
```

(Per Plan 10 gotcha: on Windows, a dangling empty dir may remain. Accept as litter.)

- [ ] **Step 6: Report back to the user**

- The uploaded assets now appear in the grid immediately, with no page refresh.
- The new `useUpload.onUploaded` callback is the integration point for any future "fire a side effect on upload" use case (analytics, telemetry, thumbnail pre-warm).
- All 4 unit-test suites pass + Playwright visual verification done.

---

## Deferred follow-up (separate plan, to be written next)

User reported (intermittently, in older Slack): "上传后只看到缩略图,看不到尺寸" — after upload, the new asset card shows the thumbnail but the dimensions field in the DetailPanel is empty until the next page refresh. Root cause: `finalizeUpload` accepts width/height in its request body, but the new asset is re-fetched via `getAsset` BEFORE the server has finished writing the dimension metadata to the row (race condition). Fix: in `useUpload`, wait ~500ms after `finalizeUpload` resolves before firing `onUploaded`, OR include the dimensions in the upload's own metadata flow so `getAsset` returns the full row on first fetch.
