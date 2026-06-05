import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmDialogProps {
  request: ConfirmOptions | null;
  onResolve: (ok: boolean) => void;
}

export function ConfirmDialog({ request, onResolve }: ConfirmDialogProps) {
  return (
    <Modal
      open={!!request}
      title={request?.title ?? ''}
      onClose={() => onResolve(false)}
      footer={
        request && (
          <>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => onResolve(false)}
            >
              {request.cancelLabel ?? '取消'}
            </button>
            <button
              type="button"
              className={`${styles.confirmBtn} ${request.danger ? styles.danger : ''}`}
              onClick={() => onResolve(true)}
            >
              {request.confirmLabel ?? '确认'}
            </button>
          </>
        )
      }
    >
      {request && <div className={styles.body}>{request.body}</div>}
    </Modal>
  );
}

// Resolver is stored in a ref (not module-level `let`) so:
//   1. It doesn't leak across tests / component instances.
//   2. Concurrent `confirm()` calls don't overwrite the first promise's resolver
//      (the first is auto-canceled, which matches user intent: only one dialog
//      is on screen at a time).
// The `request` state is what the dialog renders.
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const handleResolve = useCallback((ok: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(ok);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const prev = resolverRef.current;
        resolverRef.current = resolve;
        setRequest(opts);
        prev?.(false);
      }),
    [],
  );

  const dialogElement = useMemo(
    () => <ConfirmDialog request={request} onResolve={handleResolve} />,
    [request, handleResolve],
  );

  return { confirm, dialogElement };
}
