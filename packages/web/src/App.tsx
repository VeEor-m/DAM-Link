import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { gsap, useGSAP } from './lib/gsap-setup.js';
import { createViewModeSwitchTimeline } from './lib/animations/view-mode-switch.js';
import { AppShell } from './components/layout/AppShell';
import { Toolbar } from './components/toolbar/Toolbar';
import { Sidebar } from './components/sidebar/Sidebar';
import { AssetGrid } from './components/browser/AssetGrid';
import { AssetList } from './components/browser/AssetList';
import { DetailPanel } from './components/detail/DetailPanel';
import { UploadDialog } from './components/upload/UploadDialog';
import { FilterPanel } from './components/filter/FilterPanel';
import { Modal } from './components/common/Modal';
import { ShortcutsHelp } from './components/common/ShortcutsHelp';
import { ContextMenu } from './components/common/ContextMenu';
import { Drawer } from './components/common/Drawer';
import { BottomSheet } from './components/common/BottomSheet';
import { BatchActionBar } from './components/batch/BatchActionBar';
import { useConfirm } from './components/common/ConfirmDialog';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoginScreen } from './components/auth/LoginScreen';
import { buildAssetRowMenuItems } from './components/browser/AssetRowMenu';
import { Lightbox } from './components/preview/Lightbox';
import { useStore } from './hooks/useStore';
import { useDebounce } from './hooks/useDebounce';
import { useToast } from './hooks/useToast';
import { useViewport } from './hooks/useViewport';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { MOCK_ASSETS } from './state/mockData';
import { initialUI } from './state/initialUI';
import {
  selectVisibleAssets,
  selectActiveFilterCount,
  selectLightboxVisibleAssetIds,
} from './state/selectors';
import { copyToClipboard } from './utils/clipboard';
import { downloadAsset } from './utils/download';
import { deleteAsset, emptyTrash, permanentDelete, restoreAsset } from './state/assetOps';
import { me as apiMe } from './api/auth.js';
import {
  updateAsset,
  softDelete as apiSoftDelete,
  restore as apiRestore,
  permanentDelete as apiPermanentDelete,
  emptyTrash as apiEmptyTrash,
  sidebarCounts,
} from './api/assets.js';
import { ApiError } from './api/client.js';
import { createShareLink as apiCreateShareLink } from './api/share-links.js';
import type { KeymapEntry } from './state/keymap';
import type { Asset, SidebarSelection } from './state/types';
import type { SidebarCounts } from '@dam-link/contracts';
import type { NeighborItem } from './components/preview/NeighborStrip';
import styles from './App.module.css';

/** Empty placeholder for `state.ui.sidebarCounts` while the first fetch is
 *  in flight. The shape matches `SidebarCounts` from `@dam-link/contracts`
 *  (the `GET /sidebar-counts` response). */
const EMPTY_COUNTS: SidebarCounts = {
  byType: { image: 0, video: 0, document: 0, audio: 0 },
  byTag: [],
  favorites: 0,
  trash: 0,
};

/** Adapts the server's `SidebarCounts` (array form for `byTag`, nested
 *  `byType`) to the flat + record shape that `<Sidebar>` consumes. The
 *  unused fields (`all`, flat `image`/`video`/`document`/`audio`) are
 *  populated so the prop type keeps compiling without an out-of-scope
 *  Sidebar refactor; they are not rendered. */
function toSidebarCountsProps(c: SidebarCounts): {
  all: number;
  image: number;
  video: number;
  document: number;
  audio: number;
  favorites: number;
  trash: number;
  byTag: Record<string, number>;
} {
  const byTag: Record<string, number> = {};
  for (const { tag, count } of c.byTag) byTag[tag] = count;
  return {
    all: 0,
    image: c.byType.image,
    video: c.byType.video,
    document: c.byType.document,
    audio: c.byType.audio,
    favorites: c.favorites,
    trash: c.trash,
    byTag,
  };
}

export default function App() {
  const { state, dispatch } = useStore();
  const debouncedQuery = useDebounce(state.ui.searchQuery, 150);
  const toast = useToast();
  const { confirm, dialogElement } = useConfirm();
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<
    { asset: Asset; x: number; y: number; trigger: HTMLElement } | null
  >(null);
  const viewport = useViewport();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Auth gate: null = checking, true = authed, false = not authed.
  // We call me() on mount per the Plan 8 spec; on 401 we show LoginScreen,
  // otherwise the full UI. This is separate from the store's own loadState()
  // hydration (which gates rendering of App at all) because the store does
  // not currently expose an auth flag.
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null);
  useEffect(() => {
    apiMe()
      .then(() => setBootstrapped(true))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          setBootstrapped(false);
        } else {
          // Network/other failure: treat as not authed and let LoginScreen
          // surface a real error message if the user tries to log in.
          setBootstrapped(false);
        }
      });
  }, []);

  // displayMode lags state.ui.viewMode. The browser slot renders displayMode,
  // not viewMode. The view-mode useGSAP below swaps displayMode to viewMode
  // at the midpoint of the crossfade. On first mount, viewMode === displayMode
  // (both default to 'grid') so the useGSAP body is a no-op.
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>(state.ui.viewMode);
  const browserRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (state.ui.viewMode === displayMode) return; // no-op on first mount and on no-op dispatches
      if (!browserRef.current) return;
      const target = state.ui.viewMode;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (!browserRef.current) return;
        createViewModeSwitchTimeline(browserRef.current, () => {
          setDisplayMode(target);
        }).play(0);
      });
      // Reduced-motion branch: swap immediately, no animation.
      mm.add('(prefers-reduced-motion: reduce)', () => {
        setDisplayMode(target);
      });
      return () => mm.revert();
    },
    { scope: browserRef, dependencies: [state.ui.viewMode] },
  );

  // Edge E1: phone sheet persists across selections (content swaps).
  // Edge E2: phone drawer closes on Sidebar selection.
  // Edge E3: tablet side detail persists across selections.
  // E2 implementation: when SET_SELECTION fires, close the drawer.
  const onSelectSelection = useCallback(
    (s: SidebarSelection) => {
      dispatch({ type: 'SET_SELECTION', selection: s });
      dispatch({ type: 'SELECT_ASSET', id: null });
      setSidebarOpen(false);
    },
    [dispatch],
  );

  // Auto-open the sheet when an asset becomes selected on phone.
  useEffect(() => {
    if (viewport === 'phone' && state.ui.selectedAssetId) {
      setSheetOpen(true);
    }
  }, [viewport, state.ui.selectedAssetId]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    dispatch({ type: 'SELECT_ASSET', id: null });
  }, [dispatch]);

  const isCompact = viewport === 'phone' || viewport === 'tablet';
  const detailVariant: 'side' | 'sheet' | 'wide' =
    viewport === 'phone' ? 'sheet' : viewport === 'wide' ? 'wide' : 'side';

  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const closeFilter = useCallback(
    () => dispatch({ type: 'SET_FILTER_PANEL', open: false }),
    [dispatch],
  );
  const closeUpload = useCallback(
    () => dispatch({ type: 'SET_UPLOAD_DIALOG', open: false }),
    [dispatch],
  );

  const visibleAssets = useMemo(
    () =>
      selectVisibleAssets(state.assets, {
        ...state.ui,
        searchQuery: debouncedQuery,
      }),
    [state.assets, state.ui, debouncedQuery],
  );

  // Sidebar counts come from the server (authoritative across reloads and
  // for orgs that have more than `limit: 200` assets). Falls back to an
  // empty shell while the first fetch is in flight.
  const counts = state.ui.sidebarCounts ?? EMPTY_COUNTS;
  const filterCount = useMemo(() => selectActiveFilterCount(state.ui.filter), [state.ui.filter]);

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

  // Memoize so the keymap below doesn't re-create on every state change.
  // Without this, `selected` would be a new reference on every render and
  // bust the `useMemo` for `keymap` even when the actual selected asset
  // hasn't changed.
  const selected = useMemo(
    () => state.assets.find((a) => a.id === state.ui.selectedAssetId) ?? null,
    [state.assets, state.ui.selectedAssetId],
  );

  // ── Lightbox wiring ──────────────────────────────────────────────────
  // Filtered to image/video only — see selectLightboxVisibleAssetIds.
  // Without the filter the chevron prev/next chain and the NeighborStrip
  // would include document/audio assets; navigating to one renders an
  // empty MediaStage (it has no case for those types).
  const lightboxVisibleIds = useMemo(
    () => selectLightboxVisibleAssetIds(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.assets, state.ui],
  );
  const visibleNeighborItems = useMemo<NeighborItem[]>(
    () =>
      lightboxVisibleIds
        .map((id) => state.assets.find((a) => a.id === id))
        .filter((a): a is Asset => Boolean(a))
        .map((a) => ({ id: a.id, thumbnailUrl: a._thumbnailUrl ?? null, label: a.name })),
    [lightboxVisibleIds, state.assets],
  );

  const handleCloseLightbox = useCallback(() => {
    dispatch({ type: 'CLOSE_LIGHTBOX' });
  }, [dispatch]);

  const handleLightboxNavigate = useCallback((id: string) => {
    dispatch({ type: 'LIGHTBOX_NAVIGATE', assetId: id });
  }, [dispatch]);

  // Card click: always select. Stably memoized (dispatch is React-guaranteed
  // stable from useReducer), so the prop reference to memoized card/row
  // children is constant across renders.
  const handleSelect = useCallback(
    (id: string) => dispatch({ type: 'SELECT_ASSET', id }),
    [dispatch],
  );

  // Card double-click: open the Lightbox preview for image/video; fall back
  // to select for audio/document (no extra behavior — the DetailPanel
  // already opens via the single-click). The deps include `state.assets` so
  // a new `handleOpen` reference is fine when the asset list changes
  // (uploads, deletes) — not on every action.
  const handleOpen = useCallback(
    (id: string) => {
      const a = state.assets.find((x) => x.id === id);
      if (a && (a.type === 'image' || a.type === 'video')) {
        dispatch({ type: 'OPEN_LIGHTBOX', assetId: id });
      } else {
        dispatch({ type: 'SELECT_ASSET', id });
      }
    },
    [state.assets, dispatch],
  );

  // Close the lightbox whenever the visible list changes underneath it
  // (sidebar selection, search query, filter). The lightbox's prev/next
  // chain is meaningless when the visible list is no longer the same.
  useEffect(() => {
    if (state.ui.lightboxAssetId) {
      dispatch({ type: 'CLOSE_LIGHTBOX' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ui.selection, state.ui.searchQuery, state.ui.filter]);

  async function handleDelete() {
    if (!selected) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    if (selected.deletedAt) {
      // Permanent delete with confirm
      const ok = await confirm({
        title: '永久删除',
        body: `确定要永久删除 ${selected.name} 吗？此操作不可撤销。`,
        confirmLabel: '永久删除',
        cancelLabel: '取消',
        danger: true,
      });
      if (!ok) return;
      const before = state.assets;
      const { nextState } = permanentDelete({ assets: before, ui: state.ui }, selected.id);
      dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
      try {
        await apiPermanentDelete(orgId, selected.id);
        toast.showToast({ message: '已永久删除', variant: 'success' });
      } catch {
        dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
        toast.showToast({ message: '永久删除失败', variant: 'error' });
      }
      return;
    }
    // Soft delete (to trash)
    const before = state.assets;
    const { nextState, undo } = deleteAsset(
      { assets: before, ui: state.ui },
      selected.id,
      new Date(),
    );
    dispatch({
      type: 'HYDRATE_STATE',
      state: { assets: nextState.assets, ui: { ...nextState.ui, selectedAssetId: null } },
    });
    try {
      await apiSoftDelete(orgId, selected.id);
      toast.showToast({
        message: '已移到回收站',
        actionLabel: '撤销',
        onAction: () => {
          if (!undo) return;
          // Optimistic local restore (clears deletedAt in the store).
          dispatch({ type: 'UPDATE_ASSET', id: undo.asset.id, patch: undo.asset });
          // Keep the server in sync; the soft-delete already persisted, so
          // a local-only undo would silently revert on next hydration.
          apiRestore(orgId, undo.asset.id).catch(() => {
            // Best-effort re-soft-delete to keep server in sync with the
            // failed undo. If that also fails, surface a real error.
            apiSoftDelete(orgId, undo.asset.id).catch(() => {
              toast.showToast({ message: '撤销失败,请刷新页面', variant: 'error' });
            });
          });
        },
      });
    } catch {
      dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
      toast.showToast({ message: '移到回收站失败', variant: 'error' });
    }
  }

  async function handleRename(name: string) {
    if (!selected) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    const oldName = selected.name;
    if (name === oldName) return;
    dispatch({ type: 'RENAME_ASSET', id: selected.id, name });
    try {
      const updated = await updateAsset(orgId, selected.id, { name });
      dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { name: updated.name } });
    } catch {
      dispatch({ type: 'RENAME_ASSET', id: selected.id, name: oldName });
      toast.showToast({ message: '重命名失败', variant: 'error' });
    }
  }

  async function handleAddTag(tag: string) {
    if (!selected) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    const trimmed = tag.trim();
    if (!trimmed || selected.tags.includes(trimmed)) return;
    const oldTags = selected.tags;
    dispatch({ type: 'ADD_TAG', id: selected.id, tag: trimmed });
    try {
      const updated = await updateAsset(orgId, selected.id, { tags: [...oldTags, trimmed] });
      dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { tags: updated.tags } });
    } catch {
      dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { tags: oldTags } });
      toast.showToast({ message: '添加标签失败', variant: 'error' });
    }
  }

  async function handleRemoveTag(tag: string) {
    if (!selected) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    const oldTags = selected.tags;
    if (!oldTags.includes(tag)) return;
    dispatch({ type: 'REMOVE_TAG', id: selected.id, tag });
    try {
      const updated = await updateAsset(orgId, selected.id, { tags: oldTags.filter((t) => t !== tag) });
      dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { tags: updated.tags } });
    } catch {
      dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { tags: oldTags } });
      toast.showToast({ message: '删除标签失败', variant: 'error' });
    }
  }

  async function handleToggleFavorite(a: Asset) {
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    const newVal = !a.favorite;
    // Optimistic local flip — works for both the card UI and the detail panel.
    dispatch({ type: 'UPDATE_ASSET', id: a.id, patch: { favorite: newVal } });
    try {
      const updated = await updateAsset(orgId, a.id, { favorite: newVal });
      dispatch({ type: 'UPDATE_ASSET', id: a.id, patch: { favorite: updated.favorite } });
    } catch {
      dispatch({ type: 'UPDATE_ASSET', id: a.id, patch: { favorite: a.favorite } });
      toast.showToast({ message: '操作失败', variant: 'error' });
    }
  }

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

  // ── Batch (multi-select) handlers ───────────────────────────────────
  const batchCount = state.ui.selectedIds.length;
  const batchAllFavorites = useMemo(() => {
    if (batchCount === 0) return false;
    const idSet = new Set(state.ui.selectedIds);
    return state.assets
      .filter((a) => idSet.has(a.id))
      .every((a) => a.favorite);
  }, [state.assets, state.ui.selectedIds, batchCount]);

  function handleBatchClear() {
    dispatch({ type: 'CLEAR_BATCH_SELECTION' });
  }

  async function handleBatchToggleFavorite() {
    if (batchCount === 0) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    const next = !batchAllFavorites;
    // Only act on assets whose current value differs (avoids no-op PATCHes).
    const ids = state.ui.selectedIds.filter((id) => {
      const a = state.assets.find((x) => x.id === id);
      return a && a.favorite !== next;
    });
    // Snapshot the "before" values so we can roll back per-asset on failure.
    const beforeById = new Map<string, boolean>();
    for (const id of ids) {
      const a = state.assets.find((x) => x.id === id);
      if (a) beforeById.set(id, a.favorite);
    }
    // Optimistic local flip for all selected assets.
    for (const id of ids) {
      dispatch({ type: 'UPDATE_ASSET', id, patch: { favorite: next } });
    }
    // Sequential PATCH with per-asset rollback on failure.
    let failed = 0;
    for (const id of ids) {
      try {
        await updateAsset(orgId, id, { favorite: next });
      } catch {
        failed += 1;
        const before = beforeById.get(id);
        if (before !== undefined) {
          dispatch({ type: 'UPDATE_ASSET', id, patch: { favorite: before } });
        }
      }
    }
    if (failed > 0) {
      toast.showToast({ message: '部分收藏操作失败', variant: 'error' });
    }
  }

  async function handleBatchDelete() {
    if (batchCount === 0) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    const ok = await confirm({
      title: '批量移到回收站',
      body: `确定要将 ${batchCount} 个资产移到回收站吗？`,
      confirmLabel: '移到回收站',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    const before = state.assets;
    // Soft-delete only the SELECTED ids, not the entire trash. The previous
    // implementation dispatched a BATCH_DELETE reducer which only updated
    // state but never called the API; we now run `deleteAsset` per id so
    // the server is kept in sync.
    let working = before;
    const when = new Date();
    for (const id of state.ui.selectedIds) {
      const { nextState: afterOne } = deleteAsset({ assets: working, ui: state.ui }, id, when);
      working = afterOne.assets;
    }
    dispatch({ type: 'HYDRATE_STATE', state: { assets: working, ui: state.ui } });
    dispatch({ type: 'CLEAR_BATCH_SELECTION' });
    // Sequential API calls with per-asset rollback on failure.
    let failed = 0;
    for (const id of state.ui.selectedIds) {
      try {
        await apiSoftDelete(orgId, id);
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      // Roll back the local state for the failed ones by restoring `before`.
      dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
      toast.showToast({ message: `${failed} 个资产删除失败`, variant: 'error' });
    } else {
      toast.showToast({ message: `已将 ${batchCount} 个资产移到回收站`, variant: 'success' });
    }
  }

  async function handleCopyLink() {
    if (!selected) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    try {
      const link = await apiCreateShareLink(orgId, selected.id, {});
      const url = `${window.location.origin}/api/v1/share/${link.token}`;
      const ok = await copyToClipboard(url);
      toast.showToast({
        message: ok ? '链接已复制' : '复制失败',
        variant: ok ? 'success' : 'error',
      });
    } catch {
      toast.showToast({ message: '复制失败', variant: 'error' });
    }
  }

  async function handleDownload() {
    if (!selected) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    try {
      await downloadAsset(selected, orgId);
    } catch {
      toast.showToast({
        message: '下载失败',
        variant: 'error',
      });
    }
  }

  // Lightbox-bound download: takes the asset from the lightbox (not the
  // DetailPanel `selected`), so it's distinct from `handleDownload` above.
  const handleDownloadLightboxAsset = useCallback(
    async (asset: Asset) => {
      const orgId = state.ui.activeOrgId;
      if (!orgId) return;
      try {
        await downloadAsset(asset, orgId);
      } catch {
        toast.showToast({ message: '下载失败', variant: 'error' });
      }
    },
    [state.ui.activeOrgId, toast],
  );

  // ── Kebab context menu (per-row, operates on the row's asset) ───────
  function handleKebab(asset: Asset, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    setMenuAnchor({ asset, x: rect.right, y: rect.bottom, trigger: anchor });
  }

  async function menuCopyLink(a: Asset) {
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    try {
      const link = await apiCreateShareLink(orgId, a.id, {});
      const url = `${window.location.origin}/api/v1/share/${link.token}`;
      const ok = await copyToClipboard(url);
      toast.showToast({
        message: ok ? '链接已复制' : '复制失败',
        variant: ok ? 'success' : 'error',
      });
    } catch {
      toast.showToast({ message: '复制失败', variant: 'error' });
    }
  }

  async function menuDelete(a: Asset) {
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    if (a.deletedAt) {
      const ok = await confirm({
        title: '永久删除',
        body: `确定要永久删除 ${a.name} 吗？此操作不可撤销。`,
        confirmLabel: '永久删除',
        cancelLabel: '取消',
        danger: true,
      });
      if (!ok) return;
      const before = state.assets;
      const { nextState } = permanentDelete({ assets: before, ui: state.ui }, a.id);
      dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
      try {
        await apiPermanentDelete(orgId, a.id);
        toast.showToast({ message: '已永久删除', variant: 'success' });
      } catch {
        dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
        toast.showToast({ message: '永久删除失败', variant: 'error' });
      }
      return;
    }
    const before = state.assets;
    const { nextState, undo } = deleteAsset({ assets: before, ui: state.ui }, a.id, new Date());
    dispatch({
      type: 'HYDRATE_STATE',
      state: {
        assets: nextState.assets,
        ui: {
          ...nextState.ui,
          selectedAssetId:
            state.ui.selectedAssetId === a.id ? null : state.ui.selectedAssetId,
        },
      },
    });
    try {
      await apiSoftDelete(orgId, a.id);
      toast.showToast({
        message: '已移到回收站',
        actionLabel: '撤销',
        onAction: () => {
          if (!undo) return;
          // Optimistic local restore (clears deletedAt in the store).
          dispatch({ type: 'UPDATE_ASSET', id: undo.asset.id, patch: undo.asset });
          // Keep the server in sync; the soft-delete already persisted, so
          // a local-only undo would silently revert on next hydration.
          apiRestore(orgId, undo.asset.id).catch(() => {
            // Best-effort re-soft-delete to keep server in sync with the
            // failed undo. If that also fails, surface a real error.
            apiSoftDelete(orgId, undo.asset.id).catch(() => {
              toast.showToast({ message: '撤销失败,请刷新页面', variant: 'error' });
            });
          });
        },
      });
    } catch {
      dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
      toast.showToast({ message: '移到回收站失败', variant: 'error' });
    }
  }

  async function menuRestore(a: Asset) {
    if (!a.deletedAt) return;
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    const before = state.assets;
    const { nextState } = restoreAsset({ assets: before, ui: state.ui }, a.id);
    dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
    try {
      await apiRestore(orgId, a.id);
      toast.showToast({ message: '已恢复', variant: 'success' });
    } catch {
      dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
      toast.showToast({ message: '恢复失败', variant: 'error' });
    }
  }

  function menuToggleFavorite(a: Asset) {
    void handleToggleFavorite(a);
  }

  function menuDownload(a: Asset) {
    const orgId = state.ui.activeOrgId;
    if (!orgId) return;
    downloadAsset(a, orgId).catch(() => {
      toast.showToast({ message: '下载失败', variant: 'error' });
    });
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  const keymap: KeymapEntry[] = useMemo(
    () => [
      { key: '/', scope: 'global', description: '聚焦搜索框', handler: () => {
        const el = document.querySelector<HTMLInputElement>('input[type="search"]');
        el?.focus();
        el?.select();
      }},
      { key: '1', scope: 'global', description: '切换到网格视图', handler: () => dispatch({ type: 'SET_VIEW_MODE', mode: 'grid' }) },
      { key: '2', scope: 'global', description: '切换到列表视图', handler: () => dispatch({ type: 'SET_VIEW_MODE', mode: 'list' }) },
      { key: 'u', scope: 'global', description: '打开上传对话框', handler: () => dispatch({ type: 'SET_UPLOAD_DIALOG', open: true }) },
      { key: 'f', scope: 'global', description: '收藏 / 取消收藏', handler: () => selected && handleToggleFavorite(selected) },
      { key: 'Delete', scope: 'global', description: '移到回收站', handler: () => handleDelete() },
      { key: 'Backspace', scope: 'global', description: '移到回收站', handler: () => handleDelete() },
      { key: 'ArrowDown', scope: 'global', description: '选择下一个资产', handler: () => navigateAsset(1) },
      { key: 'ArrowUp', scope: 'global', description: '选择上一个资产', handler: () => navigateAsset(-1) },
      { key: '?', scope: 'global', description: '显示快捷键帮助', handler: () => setHelpOpen(true) },
      { key: 'a', mod: 'ctrl', scope: 'global', description: '全选可见资产', handler: () => {
        dispatch({ type: 'SELECT_ALL_VISIBLE', ids: visibleAssets.map((a) => a.id) });
      }},
      { key: 'Escape', scope: 'global', description: '关闭 / 清除选择 / 清除搜索', handler: () => {
        if (sheetOpen) { setSheetOpen(false); return; }
        if (sidebarOpen) { setSidebarOpen(false); return; }
        if (state.ui.selectedIds.length > 0) { dispatch({ type: 'CLEAR_BATCH_SELECTION' }); return; }
        if (state.ui.searchQuery) { dispatch({ type: 'SET_SEARCH', query: '' }); return; }
        if (state.ui.selectedAssetId) { dispatch({ type: 'SELECT_ASSET', id: null }); }
      }},
    ],
    [selected, state.ui.searchQuery, state.ui.selectedAssetId, state.ui.selectedIds, sheetOpen, sidebarOpen, visibleAssets, dispatch],
  );
  useKeyboardShortcuts(keymap, 'global');

  function navigateAsset(delta: number) {
    if (visibleAssets.length === 0) return;
    const idx = selected ? visibleAssets.findIndex((a) => a.id === selected.id) : -1;
    const next = (idx + delta + visibleAssets.length) % visibleAssets.length;
    dispatch({ type: 'SELECT_ASSET', id: visibleAssets[next].id });
  }

  function handleErrorReset() {
    // Recovery from a render-time error: replace assets with mocks and
    // reset ephemeral UI. The HYDRATE_STATE action keeps persistence in
    // sync (the next debounced save writes the recovered state).
    dispatch({
      type: 'HYDRATE_STATE',
      state: { assets: MOCK_ASSETS, ui: initialUI },
    });
  }

  if (bootstrapped === null) {
    return <div style={{ padding: 32 }}>Loading…</div>;
  }
  if (!bootstrapped) {
    return <LoginScreen onSuccess={() => setBootstrapped(true)} />;
  }

  return (
    <ErrorBoundary onReset={handleErrorReset}>
      <AppShell
        toolbar={
          <Toolbar
            searchQuery={state.ui.searchQuery}
            onSearchChange={(q) => dispatch({ type: 'SET_SEARCH', query: q })}
            viewMode={state.ui.viewMode}
            onViewModeChange={(m) => dispatch({ type: 'SET_VIEW_MODE', mode: m })}
            onFilterClick={() =>
              dispatch({ type: 'SET_FILTER_PANEL', open: !state.ui.filterPanelOpen })
            }
            onUploadClick={() => dispatch({ type: 'SET_UPLOAD_DIALOG', open: true })}
            filterCount={filterCount}
            compact={isCompact}
            onMenuClick={() => setSidebarOpen(true)}
            sortKey={state.ui.sortKey}
            sortDir={state.ui.sortDir}
            onSortChange={({ sortKey, sortDir }) =>
              dispatch({ type: 'SET_SORT', sortKey, sortDir })
            }
            assets={state.assets}
          />
        }
        sidebar={
          <Sidebar
            selection={state.ui.selection}
            onSelect={onSelectSelection}
            counts={toSidebarCountsProps(counts)}
          />
        }
        browser={
          <div ref={browserRef} style={{ display: 'contents' }}>
            <BatchActionBar
              count={batchCount}
              allFavorites={batchAllFavorites}
              onClear={handleBatchClear}
              onToggleFavorite={handleBatchToggleFavorite}
              onDelete={handleBatchDelete}
            />
            {displayMode === 'grid' ? (
              <AssetGrid
                assets={visibleAssets}
                selectedId={state.ui.selectedAssetId}
                onSelect={handleSelect}
                onOpen={handleOpen}
                showFavorites={
                  state.ui.selection.kind === 'smart' &&
                  state.ui.selection.smart === 'favorites'
                }
                multiSelectedIds={state.ui.selectedIds}
                onToggleMultiSelect={(id) =>
                  dispatch({ type: 'TOGGLE_BATCH_SELECT', id })
                }
              />
            ) : (
              <AssetList
                assets={visibleAssets}
                selectedId={state.ui.selectedAssetId}
                onSelect={handleSelect}
                onOpen={handleOpen}
                onToggleFavorite={(id) => dispatch({ type: 'TOGGLE_FAVORITE', id })}
                onKebab={handleKebab}
                multiSelectedIds={state.ui.selectedIds}
                onToggleMultiSelect={(id) =>
                  dispatch({ type: 'TOGGLE_BATCH_SELECT', id })
                }
              />
            )}
          </div>
        }
        detail={
          <DetailPanel
            asset={selected}
            variant={detailVariant}
            onToggleFavorite={() => selected && handleToggleFavorite(selected)}
            onDelete={handleDelete}
            onCopyLink={handleCopyLink}
            onDownload={handleDownload}
            onRename={handleRename}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            onRestore={() => selected && menuRestore(selected)}
            onClose={() => dispatch({ type: 'SELECT_ASSET', id: null })}
          />
        }
      />

      <Drawer
        open={sidebarOpen && isCompact}
        onClose={() => setSidebarOpen(false)}
        side="left"
        width="280px"
        label="资产分类"
      >
        <Sidebar
          selection={state.ui.selection}
          onSelect={onSelectSelection}
          counts={toSidebarCountsProps(counts)}
        />
      </Drawer>

      {viewport === 'phone' && (
        <BottomSheet
          open={sheetOpen}
          onClose={closeSheet}
          label="资产详情"
        >
          <DetailPanel
            asset={selected}
            variant="sheet"
            onToggleFavorite={() => selected && handleToggleFavorite(selected)}
            onDelete={handleDelete}
            onCopyLink={handleCopyLink}
            onDownload={handleDownload}
            onRename={handleRename}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            onRestore={() => selected && menuRestore(selected)}
            onClose={closeSheet}
          />
        </BottomSheet>
      )}

      {state.ui.filterPanelOpen && (
        <Modal
          open
          title="筛选"
          onClose={closeFilter}
        >
          <FilterPanel
            assets={state.assets}
            filter={state.ui.filter}
            onChange={(patch) => dispatch({ type: 'SET_FILTER', filter: patch })}
            onClear={() => dispatch({ type: 'CLEAR_FILTERS' })}
          />
        </Modal>
      )}

      <UploadDialog
        open={state.ui.uploadDialogOpen}
        onClose={closeUpload}
      />

      <ShortcutsHelp
        open={helpOpen}
        onClose={closeHelp}
        entries={keymap}
      />

      {dialogElement}

      {state.ui.selection.kind === 'smart' && state.ui.selection.smart === 'trash' && (
        <div className={styles.emptyTrashWrapper}>
          <button
            type="button"
            className={styles.emptyTrashButton}
            onClick={handleEmptyTrash}
          >
            清空回收站
          </button>
        </div>
      )}

      <ContextMenu
        anchor={menuAnchor ? { x: menuAnchor.x, y: menuAnchor.y } : null}
        items={
          menuAnchor
            ? buildAssetRowMenuItems({
                asset: menuAnchor.asset,
                onCopyLink: menuCopyLink,
                onDownload: menuDownload,
                onToggleFavorite: menuToggleFavorite,
                onDelete: menuDelete,
                onRestore: menuRestore,
              })
            : []
        }
        onClose={() => setMenuAnchor(null)}
        triggerRef={menuAnchor?.trigger ?? null}
      />

      <Lightbox
        asset={
          state.assets.find((a) => a.id === state.ui.lightboxAssetId) ?? null
        }
        neighbors={visibleNeighborItems}
        visibleIds={lightboxVisibleIds}
        orgId={state.ui.activeOrgId}
        onNavigate={handleLightboxNavigate}
        onClose={handleCloseLightbox}
        onToggleFavorite={(id) => dispatch({ type: 'TOGGLE_FAVORITE', id })}
        onDownload={handleDownloadLightboxAsset}
      />
    </ErrorBoundary>
  );
}
