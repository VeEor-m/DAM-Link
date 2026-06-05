import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Toast, type ToastItem, type ToastVariant } from './Toast';
import { newId } from '../../utils/id';
import styles from './Toast.module.css';

interface ShowOptions {
  message: string;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastApi {
  showToast: (opts: ShowOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const DEFAULT_DURATION = 4000;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (opts: ShowOptions): string => {
      const id = newId();
      const next: ToastItem = {
        id,
        message: opts.message,
        variant: opts.variant ?? 'info',
        actionLabel: opts.actionLabel,
        onAction: opts.onAction,
        durationMs: opts.durationMs ?? DEFAULT_DURATION,
      };
      setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), next]);
      return id;
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      {createPortal(
        <div
          className={styles.stack}
          aria-live="polite"
          aria-atomic="false"
        >
          {items.map((item) => (
            <Toast key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
