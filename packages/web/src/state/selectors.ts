import type {
  Asset,
  AssetType,
  DateBucket,
  FilterState,
  SidebarSelection,
  SizeBucket,
  UIState,
} from './types';

const SIZE_THRESHOLDS: Record<SizeBucket, [number, number]> = {
  small: [0, 1024 * 1024], // < 1 MB
  medium: [1024 * 1024, 10 * 1024 * 1024], // 1-10 MB
  large: [10 * 1024 * 1024, Infinity], // > 10 MB
};

const DATE_THRESHOLDS: Record<DateBucket, number | null> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  all: null,
};

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export function matchesSearch(asset: Asset, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (normalize(asset.name).includes(q)) return true;
  if (normalize(asset.format).includes(q)) return true;
  if (normalize(asset.uploadedBy).includes(q)) return true;
  if (asset.tags.some((t) => normalize(t).includes(q))) return true;
  return false;
}

export function matchesFilters(asset: Asset, f: FilterState): boolean {
  if (f.typeFilter.length > 0 && !f.typeFilter.includes(asset.type)) return false;
  if (f.formatFilter.length > 0 && !f.formatFilter.includes(asset.format)) return false;
  if (f.sizeBucket) {
    const [lo, hi] = SIZE_THRESHOLDS[f.sizeBucket];
    if (asset.size < lo || asset.size >= hi) return false;
  }
  if (f.dateBucket !== 'all') {
    const cutoff = DATE_THRESHOLDS[f.dateBucket]!;
    const ageMs = Date.now() - new Date(asset.uploadedAt).getTime();
    if (ageMs > cutoff) return false;
  }
  if (f.uploaderFilter.length > 0 && !f.uploaderFilter.includes(asset.uploadedBy))
    return false;
  return true;
}

export function isInSelection(asset: Asset, sel: SidebarSelection): boolean {
  if (sel.kind === 'all') return asset.deletedAt === null;
  if (sel.kind === 'type') {
    return asset.type === sel.type && asset.deletedAt === null;
  }
  if (sel.kind === 'tag') {
    return asset.tags.includes(sel.tag) && asset.deletedAt === null;
  }
  // smart
  if (sel.smart === 'trash') return asset.deletedAt !== null;
  if (sel.smart === 'favorites') {
    return asset.favorite && asset.deletedAt === null;
  }
  if (sel.smart === 'recent') {
    if (asset.deletedAt !== null) return false;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return new Date(asset.uploadedAt).getTime() >= cutoff;
  }
  return true;
}

export function selectVisibleAssets(assets: Asset[], ui: UIState): Asset[] {
  return assets.filter(
    (a) =>
      isInSelection(a, ui.selection) &&
      matchesFilters(a, ui.filter) &&
      matchesSearch(a, ui.searchQuery),
  );
}

export interface SidebarCounts {
  all: number;
  image: number;
  video: number;
  document: number;
  audio: number;
  favorites: number;
  trash: number;
  byTag: Record<string, number>;
}

export function selectSidebarCounts(assets: Asset[]): SidebarCounts {
  const active = assets.filter((a) => a.deletedAt === null);
  const trash = assets.filter((a) => a.deletedAt !== null);
  const byType: Record<AssetType, number> = {
    image: 0,
    video: 0,
    document: 0,
    audio: 0,
  };
  for (const a of active) byType[a.type]++;
  const byTag: Record<string, number> = {};
  for (const a of active) for (const t of a.tags) byTag[t] = (byTag[t] ?? 0) + 1;
  return {
    all: active.length,
    image: byType.image,
    video: byType.video,
    document: byType.document,
    audio: byType.audio,
    favorites: active.filter((a) => a.favorite).length,
    trash: trash.length,
    byTag,
  };
}

export function selectActiveFilterCount(f: FilterState): number {
  let n = 0;
  if (f.typeFilter.length > 0) n++;
  if (f.formatFilter.length > 0) n++;
  if (f.sizeBucket) n++;
  if (f.dateBucket !== 'all') n++;
  if (f.uploaderFilter.length > 0) n++;
  return n;
}
