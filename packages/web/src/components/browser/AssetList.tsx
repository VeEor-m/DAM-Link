import { useMemo } from 'react';
import type { Asset, SortDir, SortKey } from '../../state/types';
import { AssetListRow } from './AssetListRow';
import { StackedCardList } from './StackedCardList';
import { EmptyState } from '../common/EmptyState';
import { useViewport } from '../../hooks/useViewport';
import { useStore } from '../../hooks/useStore';
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
    <div className={styles.list} role="grid">
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
