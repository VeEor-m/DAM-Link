import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { DropZone } from './DropZone';
import { useUpload } from '../../hooks/useUpload';
import { listMyOrgs } from '../../api/orgs.js';
import { formatSize } from '../../utils/format';
import styles from './UploadDialog.module.css';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UploadDialog({ open, onClose }: UploadDialogProps) {
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!open) return;
    listMyOrgs()
      .then((orgs) => {
        if (cancelled) return;
        setOrgId(orgs[0]?.org.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setOrgId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!orgId) {
    return (
      <Modal open={open} title="上传资产" onClose={onClose}>
        <div className={styles.preview}>正在准备…</div>
      </Modal>
    );
  }

  return <UploadDialogBody orgId={orgId} onClose={onClose} />;
}

interface BodyProps {
  orgId: string;
  onClose: () => void;
}

function UploadDialogBody({ orgId, onClose }: BodyProps) {
  const { items, uploadMany } = useUpload(orgId);

  async function handleFiles(files: File[]) {
    await uploadMany(files);
  }

  const inProgress = items.some(
    (i) => i.status === 'uploading' || i.status === 'finalizing' || i.status === 'queued',
  );
  const allDone = items.length === 0 || items.every((i) => i.status === 'done' || i.status === 'error');
  const anyOk = items.some((i) => i.status === 'done');

  return (
    <Modal
      open
      title="上传资产"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={inProgress}
          >
            取消
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onClose}
            disabled={!allDone || !anyOk}
          >
            完成
          </button>
        </>
      }
    >
      <DropZone onFiles={handleFiles} />
      {items.length > 0 && (
        <div className={styles.preview}>
          {items.map((i) => (
            <div
              key={i.id}
              className={`${styles.row} ${i.status === 'error' ? styles.error : ''}`}
            >
              <span className={styles.name}>{i.file.name}</span>
              <span className={styles.size}>{formatSize(i.file.size)}</span>
              <span>
                {i.status === 'queued' && '…'}
                {i.status === 'uploading' && '上传中…'}
                {i.status === 'finalizing' && '完成中…'}
                {i.status === 'done' && '✓'}
                {i.status === 'error' && `✗ ${i.error ?? ''}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
