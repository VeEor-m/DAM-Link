import { useEffect } from 'react';
import styles from './Toast.module.css';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

interface ToastProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

export function Toast({ item, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), item.durationMs);
    return () => clearTimeout(t);
  }, [item.id, item.durationMs, onDismiss]);

  return (
    <div
      className={`${styles.toast} ${styles[item.variant]}`}
      role="status"
    >
      <span className={styles.message}>{item.message}</span>
      {item.actionLabel && item.onAction && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            item.onAction?.();
            onDismiss(item.id);
          }}
        >
          {item.actionLabel}
        </button>
      )}
    </div>
  );
}
