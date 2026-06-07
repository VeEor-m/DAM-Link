import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Asset } from '../../state/types.js';
import { useLightbox } from '../../hooks/useLightbox.js';
import { MediaStage } from './MediaStage.js';
import { NeighborStrip, type NeighborItem } from './NeighborStrip.js';
import styles from './Lightbox.module.css';

export interface LightboxProps {
  asset: Asset | null;
  neighbors: NeighborItem[];
  visibleIds: string[];
  orgId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onDownload: (asset: Asset) => void;
}

export function Lightbox(props: LightboxProps) {
  const { asset, neighbors, visibleIds, orgId, onNavigate, onClose, onToggleFavorite, onDownload } = props;
  const dialogRef = useRef<HTMLDivElement>(null);

  const lb = useLightbox({
    open: asset !== null,
    asset,
    visibleIds,
    onNavigate,
    onClose,
  });

  // Focus trap: focus the dialog on open; restore previous focus on close.
  useEffect(() => {
    if (!asset) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { prev?.focus(); };
  }, [asset]);

  // Window-level keydown for ←/→/Esc.
  useEffect(() => {
    if (!asset) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      lb.onKeyDown(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asset, lb]);

  if (!asset) return null;

  const headerClass = lb.isIdle ? styles.headerHidden : styles.header;
  const stripClass = lb.isIdle ? styles.stripHidden : styles.strip;
  const chevronClass = lb.isIdle ? styles.chevronsHidden : styles.chevrons;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-filename"
      tabIndex={-1}
      className={styles.root}
      data-testid="lightbox"
    >
      <header className={headerClass}>
        <div className={styles.headerLeft}>
          <h2 id="lightbox-filename" className={styles.filename}>{asset.name}</h2>
          <p className={styles.meta}>
            {formatSize(asset.size)} · {asset.format} · {(asset as { mimeType?: string }).mimeType ?? ''}
          </p>
        </div>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={asset.favorite ? '取消收藏' : '收藏'}
            onClick={() => onToggleFavorite(asset.id)}
          >
            {asset.favorite ? '★' : '☆'}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="下载"
            onClick={() => onDownload(asset)}
          >
            ⬇
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="关闭预览"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={chevronClass}>
          <button
            type="button"
            className={styles.chevron}
            disabled={!lb.prevId}
            aria-label="上一张"
            onClick={() => lb.prevId && onNavigate(lb.prevId)}
          >‹</button>
        </div>
        {orgId ? (
          <MediaStage
            orgId={orgId}
            asset={asset}
            posterUrl={asset._thumbnailUrl ?? null}
            onError={() => { /* error UI is rendered inside MediaStage */ }}
          />
        ) : null}
        <div className={chevronClass}>
          <button
            type="button"
            className={styles.chevron}
            disabled={!lb.nextId}
            aria-label="下一张"
            onClick={() => lb.nextId && onNavigate(lb.nextId)}
          >›</button>
        </div>
      </main>

      <footer className={stripClass}>
        <NeighborStrip items={neighbors} currentId={asset.id} onNavigate={onNavigate} />
      </footer>
    </div>,
    document.body,
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
