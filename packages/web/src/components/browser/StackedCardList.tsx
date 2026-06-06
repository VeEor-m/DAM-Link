import type { Asset } from '../../state/types';
import { thumbnailEmoji, thumbnailSrc } from '../../utils/fileType';
import { formatSize, formatDims, formatDuration } from '../../utils/format';
import { IconStar, IconStarFilled, IconDotsVertical, IconCheck } from '@tabler/icons-react';
import styles from './StackedCardList.module.css';

interface StackedCardListProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onKebab: (asset: Asset, anchor: HTMLElement) => void;
  /** Multi-select ids (forwarded to each row's checkbox). */
  multiSelectedIds?: string[];
  onToggleMultiSelect?: (id: string) => void;
}

function subtitleFor(a: Asset): string {
  const size = formatSize(a.size);
  if (a.type === 'image') {
    return a.format === 'SVG'
      ? `${size} · 矢量`
      : `${size} · ${formatDims(a.width, a.height)}`;
  }
  if (a.type === 'video' || a.type === 'audio') {
    const dur = formatDuration(a.duration ?? 0);
    return dur ? `${size} · ${dur}` : size;
  }
  return size;
}

export function StackedCardList({
  assets,
  selectedId,
  onSelect,
  onToggleFavorite,
  onKebab,
  multiSelectedIds,
  onToggleMultiSelect,
}: StackedCardListProps) {
  const idSet = multiSelectedIds ? new Set(multiSelectedIds) : null;
  return (
    <div className={styles.list} role="list">
      {assets.map((a) => {
        const selected = a.id === selectedId;
        const multiSelected = idSet?.has(a.id) ?? false;
        return (
          <div
            key={a.id}
            className={styles.row}
            data-selected={selected}
            role="listitem"
          >
            {onToggleMultiSelect && (
              <button
                type="button"
                role="checkbox"
                aria-checked={multiSelected}
                aria-label={multiSelected ? '取消选择' : '选择'}
                className={`${styles.checkbox} ${multiSelected ? styles.checkboxChecked : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMultiSelect(a.id);
                }}
              >
                {multiSelected && <IconCheck size={14} aria-hidden="true" />}
              </button>
            )}
            <button
              type="button"
              className={styles.selectButton}
              onClick={() => onSelect(a.id)}
              aria-label={`选择 ${a.name}`}
              aria-pressed={selected}
            />
            <div className={styles.thumb}>
              {thumbnailSrc(a) ? (
                <img src={thumbnailSrc(a) ?? undefined} alt="" />
              ) : (
                <span aria-hidden="true">{thumbnailEmoji(a.type, a.format)}</span>
              )}
            </div>
            <div className={styles.text}>
              <div className={styles.name} title={a.name}>{a.name}</div>
              <div className={styles.meta}>{subtitleFor(a)}</div>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.kebab}
                onClick={(e) => {
                  e.stopPropagation();
                  onKebab(a, e.currentTarget);
                }}
                aria-label="更多操作"
                aria-haspopup="menu"
              >
                <IconDotsVertical size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.star}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(a.id);
                }}
                aria-label={a.favorite ? `取消收藏 ${a.name}` : `添加收藏 ${a.name}`}
                aria-pressed={a.favorite}
              >
                {a.favorite ? (
                  <IconStarFilled size={18} aria-hidden="true" />
                ) : (
                  <IconStar size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
