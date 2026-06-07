import { useMemo, useRef } from 'react';
import type { Asset, SortDir, SortKey } from '../../state/types';
import { AssetListRow } from './AssetListRow';
import { StackedCardList } from './StackedCardList';
import { EmptyState } from '../common/EmptyState';
import { useViewport } from '../../hooks/useViewport';
import { useStore } from '../../hooks/useStore';
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import { createAssetListFade } from '../../lib/animations/asset-list.js';
import { useIsFirstMount } from '../../hooks/useIsFirstMount';
import styles from './AssetList.module.css';

interface AssetListProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onKebab: (asset: Asset, anchor: HTMLElement) => void;
  /** Multi-select: ids currently checked. */
  multiSelectedIds?: string[];
  onToggleMultiSelect?: (id: string) => void;
}

export function AssetList({
  assets,
  selectedId,
  onSelect,
  onToggleFavorite,
  onKebab,
  multiSelectedIds,
  onToggleMultiSelect,
}: AssetListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useIsFirstMount();

  // Replay whole-list fade on user-initiated `assets` changes (search /
  // filter / sidebar click). First invocation is gated by useIsFirstMount
  // — the AppShell mount already animated the initial list, so the first
  // dep change should be a no-op. Gated by prefers-reduced-motion via
  // gsap.matchMedia so the no-motion branch is a no-op.
  useGSAP(
    () => {
      if (!listRef.current) return;
      const rows = Array.from(
        listRef.current.querySelectorAll<HTMLElement>('[data-anim="row"]'),
      );
      if (rows.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        createAssetListFade(listRef.current!, rows).play(0);
      });
      return () => mm.revert();
    },
    { scope: listRef, dependencies: [assets, isFirstMount] },
  );

  const viewport = useViewport();
  // Sort lives in global UI state so it persists across view-mode
  // switches and sessions. Header clicks dispatch SET_SORT instead of
  // touching local useState.
  const { state, dispatch } = useStore();
  const sortKey = state.ui.sortKey;
  const sortDir = state.ui.sortDir;
  const asc = sortDir === 'asc';

  const sorted = useMemo(() => {
    const arr = [...assets];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'type') cmp = a.type.localeCompare(b.type);
      else if (sortKey === 'size') cmp = a.size - b.size;
      else if (sortKey === 'date')
        cmp = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
      else if (sortKey === 'favorite') cmp = Number(a.favorite) - Number(b.favorite);
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [assets, sortKey, asc]);

  function clickHeader(k: SortKey) {
    let nextDir: SortDir;
    if (sortKey === k) {
      // Toggle direction when clicking the active column.
      nextDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      // New column: name defaults ascending (alphabetic), everything
      // else descending (newest/biggest first reads more naturally).
      nextDir = k === 'name' ? 'asc' : 'desc';
    }
    dispatch({ type: 'SET_SORT', sortKey: k, sortDir: nextDir });
  }

  if (assets.length === 0) {
    return <EmptyState message="没有匹配的资产" />;
  }

  if (viewport === 'phone') {
    return (
      <StackedCardList
        assets={sorted}
        selectedId={selectedId}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
        onKebab={onKebab}
        multiSelectedIds={multiSelectedIds}
        onToggleMultiSelect={onToggleMultiSelect}
      />
    );
  }

  const idSet = multiSelectedIds ? new Set(multiSelectedIds) : null;
  const hasCheckbox = onToggleMultiSelect !== undefined;

  return (
    <div ref={listRef} className={styles.list} role="grid">
      <div className={`${styles.header} ${hasCheckbox ? styles.headerHasCheckbox : ''}`} role="row">
        {hasCheckbox && <span></span>}
        <span></span>
        <button onClick={() => clickHeader('name')}>名称 {sortKey === 'name' ? (asc ? '↑' : '↓') : ''}</button>
        <button onClick={() => clickHeader('type')}>类型</button>
        <button onClick={() => clickHeader('size')}>大小</button>
        <span>信息</span>
        <span>标签</span>
        <span>上传者</span>
        <button onClick={() => clickHeader('date')}>上传时间 {sortKey === 'date' ? (asc ? '↑' : '↓') : ''}</button>
        <button onClick={() => clickHeader('favorite')}>★</button>
        <span></span>
      </div>
      {sorted.map((a) => (
        <AssetListRow
          key={a.id}
          asset={a}
          selected={selectedId === a.id}
          onClick={() => onSelect(a.id)}
          onToggleFavorite={() => onToggleFavorite(a.id)}
          onKebab={(e) => onKebab(a, e.currentTarget as HTMLElement)}
          multiSelected={idSet?.has(a.id) ?? false}
          onToggleMultiSelect={
            onToggleMultiSelect ? () => onToggleMultiSelect(a.id) : undefined
          }
        />
      ))}
    </div>
  );
}
