import {
  IconStar,
  IconStarFilled,
  IconDotsVertical,
  IconCheck,
} from '@tabler/icons-react';
import type { Asset } from '../../state/types';
import { thumbnailEmoji, thumbnailSrc } from '../../utils/fileType';
import {
  formatSize,
  formatRelativeDate,
  formatDims,
  formatDuration,
} from '../../utils/format';
import styles from './AssetList.module.css';

interface AssetListRowProps {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
  onKebab: (e: React.MouseEvent) => void;
  /**
   * Multi-select checkbox. Orthogonal to `selected` (which opens the
   * detail panel). When `onToggleMultiSelect` is omitted the checkbox
   * is not rendered (backward compat).
   */
  multiSelected?: boolean;
  onToggleMultiSelect?: () => void;
}

export function AssetListRow({
  asset,
  selected,
  onClick,
  onToggleFavorite,
  onKebab,
  multiSelected = false,
  onToggleMultiSelect,
}: AssetListRowProps) {
  const secondary =
    asset.type === 'image'
      ? formatDims(asset.width, asset.height) || '矢量'
      : asset.type === 'video' || asset.type === 'audio'
        ? formatDuration(asset.duration ?? 0)
        : '—';

  return (
    <div
      role="row"
      data-anim="row"
      className={`${styles.row} ${selected ? styles.selected : ''}`}
    >
      {onToggleMultiSelect && (
        <button
          type="button"
          role="checkbox"
          aria-checked={multiSelected}
          aria-label={multiSelected ? '取消选择' : '选择'}
          className={`${styles.checkbox} ${multiSelected ? styles.checkboxChecked : ''}`}
          // stopPropagation so clicking the checkbox doesn't also
          // open the asset in the detail panel via the select button.
          onClick={(e) => {
            e.stopPropagation();
            onToggleMultiSelect();
          }}
        >
          {multiSelected && <IconCheck size={12} aria-hidden="true" />}
        </button>
      )}
      <button
        type="button"
        className={styles.selectButton}
        onClick={onClick}
        aria-label={`选择 ${asset.name}`}
        aria-pressed={selected}
      />
      <div className={styles.thumb}>
        {thumbnailSrc(asset) ? (
          <img src={thumbnailSrc(asset) ?? undefined} alt="" />
        ) : (
          <span aria-hidden="true">{thumbnailEmoji(asset.type, asset.format)}</span>
        )}
      </div>
      <span className={styles.name} title={asset.name}>
        {asset.name}
      </span>
      <span className={styles.muted}>{asset.format}</span>
      <span className={styles.muted}>{formatSize(asset.size)}</span>
      <span className={styles.muted}>{secondary}</span>
      <span className={styles.tags}>
        {asset.tags.slice(0, 2).map((t) => (
          <span key={t} className={styles.tag}>
            {t}
          </span>
        ))}
        {asset.tags.length > 2 && (
          <span className={styles.muted}>+{asset.tags.length - 2}</span>
        )}
      </span>
      <span className={styles.muted}>{asset.uploadedBy}</span>
      <span className={styles.muted}>{formatRelativeDate(asset.uploadedAt)}</span>
      <button
        type="button"
        className={styles.star}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={asset.favorite ? '取消收藏' : '添加收藏'}
        aria-pressed={asset.favorite}
      >
        {asset.favorite ? (
          <IconStarFilled size={14} aria-hidden="true" />
        ) : (
          <IconStar size={14} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={styles.kebab}
        onClick={(e) => {
          e.stopPropagation();
          onKebab(e);
        }}
        aria-label="更多操作"
        aria-haspopup="menu"
      >
        <IconDotsVertical size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
