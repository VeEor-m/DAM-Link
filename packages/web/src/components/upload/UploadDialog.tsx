import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { DropZone } from './DropZone';
import { useUpload } from '../../hooks/useUpload';
import { listMyOrgs, createOrg } from '../../api/orgs.js';
import { formatSize } from '../../utils/format';
import styles from './UploadDialog.module.css';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'loading' | 'no-orgs' | 'ready' | 'error';

export function UploadDialog({ open, onClose }: UploadDialogProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reset to loading on every open transition so a stale empty/error state
  // from a previous open doesn't bleed through.
  useEffect(() => {
    if (!open) return;
    setPhase('loading');
    setLoadError(null);
    let cancelled = false;
    listMyOrgs()
      .then((orgs) => {
        if (cancelled) return;
        if (orgs.length === 0) {
          setPhase('no-orgs');
        } else {
          setOrgId(orgs[0]!.org.id);
          setPhase('ready');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '加载组织失败');
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Modal open={open} title="上传资产" onClose={onClose}>
      {phase === 'loading' && <div className={styles.preview}>正在准备…</div>}
      {phase === 'no-orgs' && (
        <NoOrgsState
          onCreated={(id) => {
            setOrgId(id);
            setPhase('ready');
          }}
        />
      )}
      {phase === 'error' && <ErrorState message={loadError} onClose={onClose} />}
      {phase === 'ready' && orgId && <UploadDialogBody orgId={orgId} onClose={onClose} />}
    </Modal>
  );
}

function NoOrgsState({ onCreated }: { onCreated: (orgId: string) => void }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createOrg({ name: trimmed });
      onCreated(res.org.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建组织失败');
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.emptyState}>
      <h3 className={styles.emptyHeading}>需要先创建组织</h3>
      <p className={styles.emptyBody}>
        每个资产必须归属于一个组织。请输入组织名称以开始使用 DAM-Link。
      </p>
      <form className={styles.emptyForm} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.emptyInput}
          aria-label="组织名称"
          placeholder="组织名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          required
        />
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={submitting || name.trim() === ''}
        >
          {submitting ? '创建中…' : '创建'}
        </button>
      </form>
      {error && <p className={styles.emptyError} role="alert">{error}</p>}
    </div>
  );
}

function ErrorState({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <div className={styles.emptyState}>
      <h3 className={styles.emptyHeading}>无法加载组织</h3>
      <p className={styles.emptyBody} role="alert">{message ?? '未知错误'}</p>
      <button type="button" className={styles.primaryButton} onClick={onClose}>
        关闭
      </button>
    </div>
  );
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
