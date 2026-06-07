import styles from './PlayButton.module.css';

export function PlayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      aria-label="播放"
    >
      <span className={styles.triangle} aria-hidden="true" />
    </button>
  );
}
