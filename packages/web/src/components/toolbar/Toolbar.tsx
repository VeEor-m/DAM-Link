import {
  IconSearch,
  IconLayoutGrid,
  IconList,
  IconFilter,
  IconUpload,
  IconMenu2,
  IconLibrary,
  IconSortAscending,
  IconSortDescending,
} from '@tabler/icons-react';
import type { Asset, SortDir, SortKey } from '../../state/types';
import { ExportButton } from './ExportButton';
import styles from './Toolbar.module.css';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: '名称' },
  { value: 'type', label: '类型' },
  { value: 'size', label: '大小' },
  { value: 'date', label: '上传时间' },
  { value: 'favorite', label: '收藏' },
];

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (m: 'grid' | 'list') => void;
  onFilterClick: () => void;
  onUploadClick: () => void;
  filterCount: number;
  /** Phone/tablet: replace the filter button with a ☰ that opens the
   *  sidebar drawer, hide the logo, and let the search expand. */
  compact?: boolean;
  onMenuClick?: () => void;
  /** Current sort key + direction. Drives the dropdown selection. */
  sortKey: SortKey;
  sortDir: SortDir;
  /** Called when the user picks a new sort key or flips direction. */
  onSortChange: (s: { sortKey: SortKey; sortDir: SortDir }) => void;
  /** Full asset list — passed to <ExportButton /> for the localStorage
   *  migration export. Excludes trashed items inside the button. */
  assets: Asset[];
}

export function Toolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onFilterClick,
  onUploadClick,
  filterCount,
  compact = false,
  onMenuClick,
  sortKey,
  sortDir,
  onSortChange,
  assets,
}: ToolbarProps) {
  return (
    <div
      className={`${styles.toolbar} ${compact ? styles.compact : ''}`}
      role="toolbar"
      aria-label="主工具栏"
      data-anim="toolbar-row"
    >
      {compact && onMenuClick && (
        <button
          type="button"
          className={styles.btn}
          onClick={onMenuClick}
          aria-label="打开侧栏"
          title="侧栏"
        >
          <IconMenu2 size={18} aria-hidden="true" />
        </button>
      )}
      {!compact && (
        <div className={styles.logo} aria-label="DAM-Link">
          <IconLibrary size={20} aria-hidden="true" />
          <span>DAM-Link</span>
        </div>
      )}
      <div className={styles.search}>
        <IconSearch size={16} aria-hidden="true" />
        <input
          type="search"
          className={styles.searchInput}
          placeholder={compact ? '搜索…' : '搜索资产…'}
          aria-label="搜索资产"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className={styles.actions}>
        {!compact && (
          <div className={styles.sortGroup}>
            <select
              className={styles.sortSelect}
              value={sortKey}
              onChange={(e) =>
                onSortChange({ sortKey: e.target.value as SortKey, sortDir })
              }
              aria-label="排序方式"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.sortDir}
              onClick={() =>
                onSortChange({
                  sortKey,
                  sortDir: sortDir === 'asc' ? 'desc' : 'asc',
                })
              }
              aria-label={sortDir === 'asc' ? '升序，点击切换为降序' : '降序，点击切换为升序'}
              title={sortDir === 'asc' ? '升序' : '降序'}
            >
              {sortDir === 'asc' ? (
                <IconSortAscending size={14} aria-hidden="true" />
              ) : (
                <IconSortDescending size={14} aria-hidden="true" />
              )}
            </button>
          </div>
        )}
        <div className={styles.toggleGroup} role="group" aria-label="视图模式">
          <button
            type="button"
            className={`${styles.btn} ${viewMode === 'grid' ? styles.active : ''}`}
            onClick={() => onViewModeChange('grid')}
            aria-pressed={viewMode === 'grid'}
            aria-label="网格视图"
            title="网格视图 (1)"
          >
            <IconLayoutGrid size={16} aria-hidden="true" />
            <span>网格</span>
          </button>
          <button
            type="button"
            className={`${styles.btn} ${viewMode === 'list' ? styles.active : ''}`}
            onClick={() => onViewModeChange('list')}
            aria-pressed={viewMode === 'list'}
            aria-label="列表视图"
            title="列表视图 (2)"
          >
            <IconList size={16} aria-hidden="true" />
            <span>列表</span>
          </button>
        </div>
        {!compact && (
          <button
            type="button"
            className={styles.btn}
            onClick={onFilterClick}
            aria-label="打开筛选"
            title="筛选"
          >
            <IconFilter size={16} aria-hidden="true" />
            <span>筛选</span>
            {filterCount > 0 && (
              <span className={styles.badge} aria-label={`${filterCount} 个筛选条件`}>
                {filterCount}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          className={styles.btn}
          onClick={onUploadClick}
          aria-label="上传资产"
          title="上传 (U)"
        >
          <IconUpload size={16} aria-hidden="true" />
          <span>上传</span>
        </button>
        <ExportButton assets={assets} />
      </div>
    </div>
  );
}
