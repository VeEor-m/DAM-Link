import { Component, type ErrorInfo, type ReactNode } from 'react';
import { IconAlertTriangle, IconReload } from '@tabler/icons-react';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called when the user clicks "重试" in the fallback UI. The parent
   *  is expected to do whatever recovery is appropriate (e.g. reset
   *  state to mocks, reload persisted data). The boundary then clears
   *  its own error state so children can render again. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render-time errors anywhere in its
 * subtree and shows a recovery panel instead of a blank screen. The
 * "重试" button delegates to the parent's onReset handler — the
 * boundary itself clears its error state after calling it so the next
 * render can succeed (or fail again, in which case the boundary
 * re-engages).
 *
 * NB: class component is required because React only supports the
 * error-boundary lifecycle (getDerivedStateFromError / componentDidCatch)
 * on classes. There is no hook equivalent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In a real app this would post to a logger. We keep it as a
    // console.error so dev builds still surface the trace.
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.fallback} role="alert">
          <IconAlertTriangle size={32} aria-hidden="true" className={styles.icon} />
          <h2 className={styles.title}>出错了</h2>
          <p className={styles.body}>
            渲染过程中出现意外错误。你可以重试一次，或刷新页面恢复。
          </p>
          {this.state.error && (
            <pre className={styles.detail}>{this.state.error.message}</pre>
          )}
          <button
            type="button"
            className={styles.retry}
            onClick={this.handleReset}
          >
            <IconReload size={14} aria-hidden="true" />
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
