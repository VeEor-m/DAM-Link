import { IconStar, IconStarFilled, IconDotsVertical, IconCheck } from '@tabler/icons-react';
import type { KeyboardEvent } from 'react';
import type { Asset } from '../../state/types';
import { thumbnailEmoji, thumbnailSrc } from '../../utils/fileType';
import { formatSize, formatDims, formatDuration } from '../../utils/format';
import styles from './AssetCard.module.css';

interface AssetCardProps {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
  /**
   * Optional double-click handler. Wired to the native `onDoubleClick`
   * event AND to the `Enter` keyboard activation on the focused card.
   * Omitting it preserves the pre-Plan-21 behavior: `Enter` falls back
   * to `onClick`, and mouse dblclick is a no-op (the two preceding
   * clicks still fire `onClick`).
   */
  onDoubleClick?: () => void;
  showFavorite: boolean;
  /**
   * T2: the kebab (⋮) is always visible (no hover required) so touch
   * devices can open the row context menu without long-press. Optional
   * for backward compat with the favorites sidebar that doesn't show it.
   */
  onKebab?: (e: React.MouseEvent) => void;
  /**
   * Multi-select checkbox state. When `onToggleMultiSelect` is omitted the
   * checkbox is not rendered at all (backward compat — DetailPanel and
   * non-grid callers don't need it). The checkbox is ORTHOGONAL to
   * `selected` (which drives the detail panel) — both can be true.
   */
  multiSelected?: boolean;
  onToggleMultiSelect?: () => void;
}

function subtitleFor(a: Asset): string {
  if (a.type === 'image') {
    if (a.format === 'SVG') return `${formatSize(a.size)} · 矢量`;
    return `${formatSize(a.size)} · ${formatDims(a.width, a.height)}`;
  }
  if (a.type === 'video' || a.type === 'audio') {
    const dur = formatDuration(a.duration ?? 0);
    return dur ? `${formatSize(a.size)} · ${dur}` : formatSize(a.size);
  }
  return formatSize(a.size);
}

export function AssetCard({
  asset,
  selected,
  onClick,
  onDoubleClick,
  showFavorite,
  onKebab,
  multiSelected = false,
  onToggleMultiSelect,
}: AssetCardProps) {
  const hasCheckbox = onToggleMultiSelect !== undefined;
  const thumbSrc = thumbnailSrc(asset);
  // The outer used to be a <button>, but it contains other <button>s
  // (the multi-select checkbox and the kebab). HTML disallows nested
  // buttons; the renderer warned and React flagged a hydration risk.
  // Use a <div role="button"> instead, with tabIndex + an Enter/Space
  // handler so the click-to-open affordance stays keyboard-accessible.
  // The handler only fires when the event target IS the card — we
  // don't want to steal Enter/Space from focused children (checkbox,
  // kebab), which have their own native button activation behavior.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      // Enter mirrors mouse double-click: open the preview if a handler
      // is provided, otherwise fall back to the single-click action.
      if (onDoubleClick) onDoubleClick();
      else onClick();
    } else if (e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      data-anim="card"
      className={`${styles.card} ${selected ? styles.selected : ''} ${hasCheckbox ? styles.hasCheckbox : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      aria-pressed={selected}
      aria-label={`${asset.name}，${formatSize(asset.size)}`}
    >
      <div className={styles.thumb}>
        {thumbSrc ? (
          <img src={thumbSrc} alt="" className={styles.thumbImg} />
        ) : (
          <span aria-hidden="true">{thumbnailEmoji(asset.type, asset.format)}</span>
        )}
        <span className={styles.badge}>{asset.format}</span>
        {hasCheckbox && (
          <button
            type="button"
            role="checkbox"
            aria-checked={multiSelected}
            aria-label={multiSelected ? '取消选择' : '选择'}
            className={`${styles.checkbox} ${multiSelected ? styles.checked : ''}`}
            // stopPropagation so clicking the checkbox doesn't also
            // open the asset in the detail panel.
            onClick={(e) => {
              e.stopPropagation();
              onToggleMultiSelect();
            }}
          >
            {multiSelected && <IconCheck size={12} aria-hidden="true" />}
          </button>
        )}
        {showFavorite && asset.favorite && (
          <span className={styles.favIcon} aria-label="已收藏">
            <IconStarFilled size={11} aria-hidden="true" />
          </span>
        )}
        {onKebab && (
          <span
            className={styles.kebabWrap}
            onClick={(e) => {
              e.stopPropagation();
              onKebab(e);
            }}
          >
            <button
              type="button"
              className={styles.kebab}
              aria-label="更多操作"
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                onKebab(e);
              }}
            >
              <IconDotsVertical size={14} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      <div className={styles.meta}>
        <div className={styles.name} title={asset.name}>
          {asset.name}
        </div>
        <div className={styles.sub}>{subtitleFor(asset)}</div>
      </div>
      {!showFavorite && asset.favorite && (
        <span className={styles.favCorner} aria-hidden="true">
          <IconStar size={10} />
        </span>
      )}
    </div>
  );
}
