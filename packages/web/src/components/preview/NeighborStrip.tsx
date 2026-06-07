import styles from './NeighborStrip.module.css';

export interface NeighborItem {
  id: string;
  thumbnailUrl: string | null;
  label: string;
}

export function NeighborStrip({
  items,
  currentId,
  onNavigate,
}: {
  items: NeighborItem[];
  currentId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <div className={styles.strip} role="toolbar" aria-label="邻居资源">
      {items.map((it) => {
        const isCurrent = it.id === currentId;
        return (
          <button
            key={it.id}
            type="button"
            className={isCurrent ? styles.thumbCurrent : styles.thumb}
            aria-label={it.label}
            aria-current={isCurrent ? 'true' : 'false'}
            onClick={() => onNavigate(it.id)}
          >
            {it.thumbnailUrl ? (
              <img src={it.thumbnailUrl} alt="" className={styles.image} />
            ) : (
              <div className={styles.placeholder} aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
