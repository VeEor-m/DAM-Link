import { useState } from 'react';
import { Modal } from '../common/Modal';
import { DropZone } from './DropZone';
import { parseFile } from '../../utils/uploadParser';
import { formatSize } from '../../utils/format';
import type { Asset } from '../../state/types';
import styles from './UploadDialog.module.css';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (assets: Asset[]) => void;
}

interface PendingRow {
  name: string;
  size: number;
  status: 'pending' | 'ok' | 'error';
  error?: string;
  asset?: Asset;
}

export function UploadDialog({ open, onClose, onAdd }: UploadDialogProps) {
  const [rows, setRows] = useState<PendingRow[]>([]);

  async function handleFiles(files: File[]) {
    const newRows: PendingRow[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      status: 'pending',
    }));
    setRows((prev) => [...prev, ...newRows]);
    for (let i = 0; i < files.length; i++) {
      try {
        const asset = await parseFile(files[i]);
        setRows((prev) =>
          prev.map((r) =>
            r.name === files[i].name && r.status === 'pending'
              ? { ...r, status: 'ok', asset }
              : r,
          ),
        );
      } catch (err) {
        setRows((prev) =>
          prev.map((r) =>
            r.name === files[i].name && r.status === 'pending'
              ? { ...r, status: 'error', error: String(err) }
              : r,
          ),
        );
      }
    }
  }

  function commit() {
    const ok = rows.filter((r) => r.status === 'ok' && r.asset).map((r) => r.asset!);
    if (ok.length > 0) onAdd(ok);
    setRows([]);
    onClose();
  }

  function cancel() {
    setRows([]);
    onClose();
  }

  const allDone = rows.length === 0 || rows.every((r) => r.status !== 'pending');
  const anyOk = rows.some((r) => r.status === 'ok');

  return (
    <Modal
      open={open}
      title="上传资产"
      onClose={cancel}
      footer={
        <>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={cancel}
          >
            取消
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={commit}
            disabled={!allDone || !anyOk}
          >
            添加到资产库
          </button>
        </>
      }
    >
      <DropZone onFiles={handleFiles} />
      {rows.length > 0 && (
        <div className={styles.preview}>
          {rows.map((r, i) => (
            <div
              key={i}
              className={`${styles.row} ${r.status === 'error' ? styles.error : ''}`}
            >
              <span className={styles.name}>{r.name}</span>
              <span className={styles.size}>{formatSize(r.size)}</span>
              <span>{r.status === 'pending' ? '…' : r.status === 'ok' ? '✓' : '✗'}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
