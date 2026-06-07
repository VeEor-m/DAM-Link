import { useCallback, useMemo } from 'react';
import type { Asset } from '../state/types';
import { useIdleTimer } from './useIdleTimer';

export interface UseLightboxOpts {
  open: boolean;
  asset: Asset | null;
  /** Visible asset ids in display order. */
  visibleIds: string[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}

export interface UseLightboxResult {
  prevId: string | null;
  nextId: string | null;
  isIdle: boolean;
  onKeyDown: (e: { key: string }) => void;
  onMouseMove: () => void;
}

/**
 * Lightbox behavior: keyboard nav, cinema-mode idle flag, prev/next id.
 * The component attaches `onKeyDown` to its root element and the keydown
 * listener is also added to `window` while `open` is true (so the keys
 * work regardless of focus, as long as no input is focused — see component
 * for the focus guard).
 */
export function useLightbox(opts: UseLightboxOpts): UseLightboxResult {
  const { open, asset, visibleIds, onNavigate, onClose } = opts;

  const index = useMemo(
    () => (asset ? visibleIds.indexOf(asset.id) : -1),
    [asset, visibleIds],
  );
  const prevId = index > 0 ? visibleIds[index - 1] : null;
  const nextId = index >= 0 && index < visibleIds.length - 1 ? visibleIds[index + 1] : null;

  const isIdle = useIdleTimer(2000, { pauseOn: () => !open });

  const handleKey = useCallback(
    (e: { key: string }) => {
      if (!open) return;
      if (e.key === 'ArrowLeft' && prevId) onNavigate(prevId);
      else if (e.key === 'ArrowRight' && nextId) onNavigate(nextId);
      else if (e.key === 'Escape') onClose();
    },
    [open, prevId, nextId, onNavigate, onClose],
  );

  return {
    prevId,
    nextId,
    isIdle,
    onKeyDown: handleKey,
    onMouseMove: () => {}, // idle timer listens on window itself
  };
}
