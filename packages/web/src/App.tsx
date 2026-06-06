import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { useStore } from './hooks/useStore';
import { useDebounce } from './hooks/useDebounce';
import { useToast } from './hooks/useToast';
import { useViewport } from './hooks/useViewport';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { MOCK_ASSETS } from './state/mockData';
import { initialUI } from './state/initialUI';
import {
  selectVisibleAssets,
  selectSidebarCounts,
  selectActiveFilterCount,
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
} from './api/assets.js';
import { ApiError } from './api/client.js';
import type { KeymapEntry } from './state/keymap';
import type { Asset, SidebarSelection } from './state/types';
import styles from './App.module.css';

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

  const counts = useMemo(() => selectSidebarCounts(state.assets), [state.assets]);
  const filterCount = useMemo(() => selectActiveFilterCount(state.ui.filter), [state.ui.filter]);

  // Memoize so the keymap below doesn't re-create on every state change.
  // Without this, `selected` would be a new reference on every render and
  // bust the `useMemo` for `keymap` even when the actual selected asset
  // hasn't changed.
  const selected = useMemo(
    () => state.assets.find((a) => a.id === state.ui.selectedAssetId) ?? null,
    [state.assets, state.ui.selectedAssetId],
  );

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
    const ok = await confirm({
      title: '清空回收站',
      body: '确定要清空回收站吗？此操作不可撤销。',
      confirmLabel: '清空',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    const { nextState } = emptyTrash({ assets: state.assets, ui: state.ui });
    dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
    toast.showToast({ message: '回收站已清空', variant: 'success' });
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

  function handleCopyLink() {
    if (!selected) return;
    copyToClipboard(`dam-link://asset/${selected.id}`)
      .then((ok) =>
        toast.showToast({
          message: ok ? '链接已复制' : '复制失败',
          variant: ok ? 'success' : 'error',
        }),
      );
  }

  function handleDownload() {
    if (!selected) return;
    downloadAsset(selected);
  }

  // ── Kebab context menu (per-row, operates on the row's asset) ───────
  function handleKebab(asset: Asset, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    setMenuAnchor({ asset, x: rect.right, y: rect.bottom, trigger: anchor });
  }

  function menuCopyLink(a: Asset) {
    copyToClipboard(`dam-link://asset/${a.id}`).then((ok) =>
      toast.showToast({
        message: ok ? '链接已复制' : '复制失败',
        variant: ok ? 'success' : 'error',
      }),
    );
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
    downloadAsset(a);
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
            counts={counts}
          />
        }
        browser={
          <>
            <BatchActionBar
              count={batchCount}
              allFavorites={batchAllFavorites}
              onClear={handleBatchClear}
              onToggleFavorite={handleBatchToggleFavorite}
              onDelete={handleBatchDelete}
            />
            {state.ui.viewMode === 'grid' ? (
              <AssetGrid
                assets={visibleAssets}
                selectedId={state.ui.selectedAssetId}
                onSelect={(id) => dispatch({ type: 'SELECT_ASSET', id })}
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
                onSelect={(id) => dispatch({ type: 'SELECT_ASSET', id })}
                onToggleFavorite={(id) => dispatch({ type: 'TOGGLE_FAVORITE', id })}
                onKebab={handleKebab}
                multiSelectedIds={state.ui.selectedIds}
                onToggleMultiSelect={(id) =>
                  dispatch({ type: 'TOGGLE_BATCH_SELECT', id })
                }
              />
            )}
          </>
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
          counts={counts}
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
    </ErrorBoundary>
  );
}
