import { IconX, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-react';
import styles from './BatchActionBar.module.css';

interface BatchActionBarProps {
  /** Number of assets currently multi-selected. When 0 the bar renders null. */
  count: number;
  onClear: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  /** When true, the favorite button reads "取消收藏" instead of "收藏"
   *  (i.e. every selected asset is already favorited). */
  allFavorites?: boolean;
}

/**
 * Sticky action bar that slides in when one or more assets are multi-
 * selected. Sits above the browser pane and offers batch operations:
 * clear, favorite-toggle, delete (move to trash).
 *
 * Renders null when `count === 0` so the bar never takes up vertical
 * space in the common case.
 */
export function BatchActionBar({
  count,
  onClear,
  onToggleFavorite,
  onDelete,
  allFavorites = false,
}: BatchActionBarProps) {
  if (count === 0) return null;

  return (
    <div className={styles.bar} role="region" aria-label="批量操作">
      <span className={styles.count} aria-live="polite">
        已选 {count} 项
      </span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={onClear}
          aria-label="取消选择"
        >
          <IconX size={14} aria-hidden="true" />
          取消
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={onToggleFavorite}
          aria-label={allFavorites ? '取消收藏' : '收藏'}
        >
          {allFavorites ? (
            <IconStarFilled size={14} aria-hidden="true" />
          ) : (
            <IconStar size={14} aria-hidden="true" />
          )}
          {allFavorites ? '取消收藏' : '收藏'}
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.danger}`}
          onClick={onDelete}
          aria-label="移到回收站"
        >
          <IconTrash size={14} aria-hidden="true" />
          删除
        </button>
      </div>
    </div>
  );
}
