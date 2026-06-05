import { useState } from 'react';
import {
  IconFolderOpen,
  IconPhoto,
  IconVideo,
  IconFileText,
  IconMusic,
  IconTag,
  IconClock,
  IconStar,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { SidebarSelection } from '../../state/types';
import styles from './Sidebar.module.css';

interface SidebarProps {
  selection: SidebarSelection;
  onSelect: (s: SidebarSelection) => void;
  counts: {
    all: number;
    image: number;
    video: number;
    document: number;
    audio: number;
    favorites: number;
    trash: number;
    byTag: Record<string, number>;
  };
}

/** Show the first N tag rows by default; anything beyond is hidden behind
 *  a "展开 (k)" toggle. Bumping this is safe — counts and the active-tag
 *  auto-expand both key off it. */
const TAG_COLLAPSE_THRESHOLD = 5;

function isActive(a: SidebarSelection, b: SidebarSelection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ItemRow({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.item} ${active ? styles.active : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span className={styles.itemLabel}>{children}</span>
    </button>
  );
}

export function Sidebar({ selection, onSelect, counts }: SidebarProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const sortedTags = Object.entries(counts.byTag).sort(
    ([a, aCount], [b, bCount]) => {
      // count desc — most-used tags first so the first 5 are the most useful.
      // alphabetical tiebreak keeps the order stable when counts are equal
      // (otherwise the visible window would shuffle on every count change).
      if (bCount !== aCount) return bCount - aCount;
      return a.localeCompare(b);
    },
  );
  const needsCollapse = sortedTags.length > TAG_COLLAPSE_THRESHOLD;

  // If the active tag sits beyond the visible window, force-expand so the
  // user always sees which tag is currently selected. The user's manual
  // toggle is OR'd with this so clicking 收起 still works.
  const activeTagName = selection.kind === 'tag' ? selection.tag : null;
  const activeTagIndex = activeTagName
    ? sortedTags.findIndex(([t]) => t === activeTagName)
    : -1;
  const isActiveHidden = activeTagIndex >= TAG_COLLAPSE_THRESHOLD;
  const effectiveExpanded = tagsExpanded || isActiveHidden;
  const visibleTags = effectiveExpanded
    ? sortedTags
    : sortedTags.slice(0, TAG_COLLAPSE_THRESHOLD);
  const hiddenCount = sortedTags.length - TAG_COLLAPSE_THRESHOLD;

  return (
    <div className={styles.sidebar}>
      <ItemRow
        active={isActive(selection, { kind: 'all' })}
        onClick={() => onSelect({ kind: 'all' })}
        icon={<IconFolderOpen size={14} aria-hidden="true" />}
      >
        全部资产
      </ItemRow>
      <ItemRow
        active={isActive(selection, { kind: 'type', type: 'image' })}
        onClick={() => onSelect({ kind: 'type', type: 'image' })}
        icon={<IconPhoto size={14} aria-hidden="true" />}
      >
        图片
      </ItemRow>
      <ItemRow
        active={isActive(selection, { kind: 'type', type: 'video' })}
        onClick={() => onSelect({ kind: 'type', type: 'video' })}
        icon={<IconVideo size={14} aria-hidden="true" />}
      >
        视频
      </ItemRow>
      <ItemRow
        active={isActive(selection, { kind: 'type', type: 'document' })}
        onClick={() => onSelect({ kind: 'type', type: 'document' })}
        icon={<IconFileText size={14} aria-hidden="true" />}
      >
        文档
      </ItemRow>
      <ItemRow
        active={isActive(selection, { kind: 'type', type: 'audio' })}
        onClick={() => onSelect({ kind: 'type', type: 'audio' })}
        icon={<IconMusic size={14} aria-hidden="true" />}
      >
        音频
      </ItemRow>

      <div className={styles.sectionLabel}>标签</div>
      {visibleTags.map(([tag, count]) => (
        <ItemRow
          key={tag}
          active={isActive(selection, { kind: 'tag', tag })}
          onClick={() => onSelect({ kind: 'tag', tag })}
          icon={<IconTag size={14} aria-hidden="true" />}
        >
          {tag} <span className={styles.count}>{count}</span>
        </ItemRow>
      ))}
      {needsCollapse && (
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setTagsExpanded((v) => !v)}
          aria-expanded={effectiveExpanded}
        >
          {effectiveExpanded ? (
            <IconChevronUp size={12} aria-hidden="true" />
          ) : (
            <IconChevronDown size={12} aria-hidden="true" />
          )}
          <span>{effectiveExpanded ? '收起' : `展开 (${hiddenCount})`}</span>
        </button>
      )}

      <div className={styles.sectionLabel}>智能集合</div>
      <ItemRow
        active={isActive(selection, { kind: 'smart', smart: 'recent' })}
        onClick={() => onSelect({ kind: 'smart', smart: 'recent' })}
        icon={<IconClock size={14} aria-hidden="true" />}
      >
        最近上传
      </ItemRow>
      <ItemRow
        active={isActive(selection, { kind: 'smart', smart: 'favorites' })}
        onClick={() => onSelect({ kind: 'smart', smart: 'favorites' })}
        icon={<IconStar size={14} aria-hidden="true" />}
      >
        已收藏 <span className={styles.count}>{counts.favorites}</span>
      </ItemRow>
      <ItemRow
        active={isActive(selection, { kind: 'smart', smart: 'trash' })}
        onClick={() => onSelect({ kind: 'smart', smart: 'trash' })}
        icon={<IconTrash size={14} aria-hidden="true" />}
      >
        回收站 <span className={styles.count}>{counts.trash}</span>
      </ItemRow>
    </div>
  );
}
