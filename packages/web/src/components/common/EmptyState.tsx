import styles from './EmptyState.module.css';

interface EmptyStateProps {
  message: string;
}

/**
 * Presentational empty state. Centered message used wherever a list/grid
 * has nothing to show. No hooks, no state, no business logic.
 */
export function EmptyState({ message }: EmptyStateProps) {
  return <div className={styles.empty}>{message}</div>;
}
