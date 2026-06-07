import styles from './LightboxError.module.css';

export function LightboxError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.box} role="alert">
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>重试</button>
    </div>
  );
}
