import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import {
  IconDownload,
  IconCopy,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconRestore,
  IconX,
} from '@tabler/icons-react';
import type { Asset } from '../../state/types';
import { thumbnailEmoji, thumbnailSrc } from '../../utils/fileType';
import {
  formatSize,
  formatDate,
  formatDims,
  formatDuration,
} from '../../utils/format';
import { TagEditor } from './TagEditor';
import styles from './DetailPanel.module.css';

type DetailPanelVariant = 'side' | 'sheet' | 'wide';

interface DetailPanelProps {
  asset: Asset | null;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onDownload: () => void;
  onRename: (name: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onRestore?: () => void;
  onClose?: () => void;
  /**
   * Layout context:
   * - 'side'  — default 200px-wide right panel (desktop)
   * - 'sheet' — BottomSheet host (phone); close button moves to drag-handle
   *             area at the top of the sheet
   * - 'wide'  — 320px-wide right panel (>1280px); bigger preview, larger font
   */
  variant?: DetailPanelVariant;
}

export function DetailPanel({
  asset,
  onToggleFavorite,
  onDelete,
  onCopyLink,
  onDownload,
  onRename,
  onAddTag,
  onRemoveTag,
  onRestore,
  onClose,
  variant = 'side',
}: DetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(asset?.name ?? '');
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, asset?.name]);

  if (!asset) {
    return (
      <div className={styles.empty}>
        <p>请从左侧选择一个资产</p>
      </div>
    );
  }

  const inTrash = asset.deletedAt !== null;

  function commitRename() {
    const v = draft.trim();
    if (v && v !== asset!.name) onRename(v);
    setEditing(false);
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  }

  return (
    <div className={styles.detail} data-variant={variant} data-anim="detail-panel">
      {onClose && (
        <button
          type="button"
          className={variant === 'sheet' ? `${styles.closeBtn} ${styles.sheetClose}` : styles.closeBtn}
          data-sheet-close={variant === 'sheet' ? 'true' : undefined}
          onClick={onClose}
          aria-label="关闭详情"
          title="关闭详情 (Esc)"
        >
          <IconX size={16} aria-hidden="true" />
        </button>
      )}
      <div className={styles.preview}>
        {thumbnailSrc(asset) ? (
          <img src={thumbnailSrc(asset) ?? undefined} alt="" className={styles.previewImg} />
        ) : (
          <span aria-hidden="true">
            {thumbnailEmoji(asset.type, asset.format)}
          </span>
        )}
        <button
          type="button"
          className={styles.favBtn}
          onClick={onToggleFavorite}
          aria-label={asset.favorite ? '取消收藏' : '收藏'}
          aria-pressed={asset.favorite}
          title={asset.favorite ? '取消收藏 (F)' : '收藏 (F)'}
        >
          {asset.favorite ? (
            <IconStarFilled size={16} aria-hidden="true" />
          ) : (
            <IconStar size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          className={styles.nameInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onNameKey}
          onBlur={commitRename}
          autoFocus
        />
      ) : (
        <button
          type="button"
          className={styles.name}
          onClick={() => !inTrash && setEditing(true)}
          title={inTrash ? asset.name : '点击重命名'}
        >
          {asset.name}
        </button>
      )}
      <div className={styles.kv}>
        <Row label="文件大小" value={formatSize(asset.size)} />
        {(asset.width || asset.height) && (
          <Row label="尺寸" value={formatDims(asset.width, asset.height)} />
        )}
        {asset.type === 'video' && asset.duration !== undefined && (
          <Row label="时长" value={formatDuration(asset.duration)} />
        )}
        {asset.type === 'audio' && asset.duration !== undefined && (
          <Row label="时长" value={formatDuration(asset.duration)} />
        )}
        <Row label="格式" value={`${asset.format}-24`} />
        <Row label="上传时间" value={formatDate(asset.uploadedAt)} />
        <Row label="上传者" value={asset.uploadedBy} />
        <div className={styles.kvRow}>
          <span className={styles.kvKey}>标签</span>
          <div className={styles.tagList}>
            <TagEditor
              tags={asset.tags}
              onAdd={onAddTag}
              onRemove={onRemoveTag}
              readOnly={inTrash}
            />
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actBtn}
          onClick={onDownload}
          disabled={inTrash}
        >
          <IconDownload size={13} aria-hidden="true" />
          下载
        </button>
        <button
          type="button"
          className={styles.actBtn}
          onClick={onCopyLink}
          disabled={inTrash}
        >
          <IconCopy size={13} aria-hidden="true" />
          复制链接
        </button>
      </div>
      <div className={styles.actions}>
        {inTrash && (
          <button
            type="button"
            className={styles.actBtn}
            onClick={onRestore}
            disabled={!onRestore}
            title="恢复"
          >
            <IconRestore size={13} aria-hidden="true" />
            恢复
          </button>
        )}
        <button
          type="button"
          className={`${styles.actBtn} ${styles.danger}`}
          onClick={onDelete}
        >
          <IconTrash size={13} aria-hidden="true" />
          {inTrash ? '永久删除' : '移到回收站'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kvRow}>
      <span className={styles.kvKey}>{label}</span>
      <span className={styles.kvVal}>{value}</span>
    </div>
  );
}
