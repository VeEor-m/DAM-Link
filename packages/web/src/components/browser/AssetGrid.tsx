import { useRef } from 'react';
import type { Asset, AssetType } from '../../state/types';
import { AssetCard } from './AssetCard';
import { EmptyState } from '../common/EmptyState';
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import { createAssetGridStagger } from '../../lib/animations/asset-grid.js';
import styles from './AssetGrid.module.css';

interface AssetGridProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showFavorites: boolean;
  /**
   * T6: forwarded to each AssetCard so the kebab (⋮) menu can be opened
   * from grid view. Optional — callers (e.g. favorites sidebar) can
   * omit it and the cards will simply not render the kebab.
   */
  onKebab?: (asset: Asset, anchor: HTMLElement) => void;
  /**
   * Multi-select: ids currently checked. The grid forwards the per-id
   * boolean to each card so the checkbox renders in the right state.
   * `onToggleMultiSelect` is required if `multiSelectedIds` is provided.
   */
  multiSelectedIds?: string[];
  onToggleMultiSelect?: (id: string) => void;
}

const TYPE_LABELS: Record<AssetType, string> = {
  image: '图片',
  video: '视频',
  document: '文档',
  audio: '音频',
};

const TYPE_ORDER: AssetType[] = ['image', 'video', 'document', 'audio'];

/**
 * Group assets by type and render one section per type. Each section shows a
 * label and a responsive grid of cards. Empty types are omitted.
 */
export function AssetGrid({
  assets,
  selectedId,
  onSelect,
  showFavorites,
  onKebab,
  multiSelectedIds,
  onToggleMultiSelect,
}: AssetGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const hasFiredRef = useRef(false);

  // Replay per-card stagger on user-initiated `assets` changes (search /
  // filter / sidebar click). The first time the body runs AND finds cards
  // is gated out via hasFiredRef — the AppShell mount already animated
  // the initial cards, so that first non-empty body run should be a
  // no-op. Subsequent `assets` changes replay the stagger. Gated by
  // prefers-reduced-motion via gsap.matchMedia so the no-motion branch
  // is a no-op.
  useGSAP(
    () => {
      if (!gridRef.current) return;
      const cards = Array.from(
        gridRef.current.querySelectorAll<HTMLElement>('[data-anim="card"]'),
      );
      if (cards.length === 0) return;
      // Skip the first time the body runs with cards — the AppShell
      // mount already animated the initial cards. Subsequent user-
      // initiated `assets` changes (search/filter/sidebar click)
      // replay the stagger.
      if (!hasFiredRef.current) {
        hasFiredRef.current = true;
        return;
      }
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        createAssetGridStagger(gridRef.current!, cards).play(0);
      });
      return () => mm.revert();
    },
    { scope: gridRef, dependencies: [assets] },
  );

  if (assets.length === 0) {
    return <EmptyState message="没有匹配的资产" />;
  }

  const byType = new Map<AssetType, Asset[]>();
  for (const a of assets) {
    if (!byType.has(a.type)) byType.set(a.type, []);
    byType.get(a.type)!.push(a);
  }
  const idSet = multiSelectedIds ? new Set(multiSelectedIds) : null;

  return (
    <div ref={gridRef} className={styles.sections}>
      {TYPE_ORDER.filter((t) => byType.has(t)).map((type) => {
        const list = byType.get(type)!;
        return (
          <section key={type} className={styles.section}>
            <h3 className={styles.label}>
              {TYPE_LABELS[type]}（{list.length}）
            </h3>
            <div className={styles.grid}>
              {list.map((a) => (
                <AssetCard
                  key={a.id}
                  asset={a}
                  selected={selectedId === a.id}
                  onClick={() => onSelect(a.id)}
                  showFavorite={showFavorites}
                  onKebab={
                    onKebab
                      ? (e) => onKebab(a, e.currentTarget as HTMLElement)
                      : undefined
                  }
                  multiSelected={idSet?.has(a.id) ?? false}
                  onToggleMultiSelect={
                    onToggleMultiSelect
                      ? () => onToggleMultiSelect(a.id)
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
