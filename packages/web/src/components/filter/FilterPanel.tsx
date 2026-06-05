import { useMemo } from 'react';
import type { Asset, AssetType, FilterState, SizeBucket, DateBucket } from '../../state/types';
import styles from './FilterPanel.module.css';

interface FilterPanelProps {
  assets: Asset[];
  filter: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onClear: () => void;
}

const TYPES: { type: AssetType; label: string }[] = [
  { type: 'image', label: '图片' },
  { type: 'video', label: '视频' },
  { type: 'document', label: '文档' },
  { type: 'audio', label: '音频' },
];

const SIZES: { value: SizeBucket; label: string }[] = [
  { value: 'small', label: '小 < 1MB' },
  { value: 'medium', label: '中 1-10MB' },
  { value: 'large', label: '大 > 10MB' },
];

const DATES: { value: DateBucket; label: string }[] = [
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '90d', label: '近 90 天' },
  { value: 'all', label: '全部时间' },
];

export function FilterPanel({ assets, filter, onChange, onClear }: FilterPanelProps) {
  const formats = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.deletedAt === null) set.add(a.format);
    return Array.from(set).sort();
  }, [assets]);

  const uploaders = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.deletedAt === null) set.add(a.uploadedBy);
    return Array.from(set).sort();
  }, [assets]);

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.clearBtn} onClick={onClear}>
        清除全部
      </button>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>类型</div>
        {TYPES.map((t) => (
          <label key={t.type} className={styles.checkbox}>
            <input
              type="checkbox"
              checked={filter.typeFilter.includes(t.type)}
              onChange={() => onChange({ typeFilter: toggle(filter.typeFilter, t.type) })}
            />
            {t.label}
          </label>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>格式</div>
        <div className={styles.bucketRow}>
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.bucketBtn} ${filter.formatFilter.includes(f) ? styles.active : ''}`}
              onClick={() => onChange({ formatFilter: toggle(filter.formatFilter, f) })}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>大小</div>
        <div className={styles.bucketRow}>
          {SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`${styles.bucketBtn} ${filter.sizeBucket === s.value ? styles.active : ''}`}
              onClick={() => onChange({ sizeBucket: filter.sizeBucket === s.value ? null : s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>上传时间</div>
        <div className={styles.bucketRow}>
          {DATES.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`${styles.bucketBtn} ${filter.dateBucket === d.value ? styles.active : ''}`}
              onClick={() => onChange({ dateBucket: d.value })}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>上传者</div>
        {uploaders.map((u) => (
          <label key={u} className={styles.checkbox}>
            <input
              type="checkbox"
              checked={filter.uploaderFilter.includes(u)}
              onChange={() => onChange({ uploaderFilter: toggle(filter.uploaderFilter, u) })}
            />
            {u}
          </label>
        ))}
      </div>
    </div>
  );
}
