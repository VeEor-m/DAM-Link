import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

interface AppShellProps {
  toolbar: ReactNode;
  sidebar: ReactNode;
  browser: ReactNode;
  detail: ReactNode;
  /**
   * Viewport tier from useViewport(). The shell writes this onto
   * `body[data-viewport]` via the parent; the shell does not own viewport
   * state. We accept it as a prop so App.tsx remains the single caller of
   * useViewport().
   */
  dataViewport?: 'phone' | 'tablet' | 'desktop' | 'wide';
}

/**
 * The 3-pane DAM layout, mirroring the mockup on desktop and adapting
 * per viewport via CSS attribute selectors on `body[data-viewport]`.
 *
 *   ┌─ Toolbar (full width) ───────────────────────┐
 *   ├─ Sidebar ─┬─ Main (browser) ─────┬─ Detail ─┤
 *   │           │                      │          │
 *   └───────────┴──────────────────────┴──────────┘
 *
 * On phone/tablet the sidebar and detail slots are hidden via CSS and the
 * parent renders them as Drawer / BottomSheet overlays. On desktop/wide
 * the slots are visible and the overlays are hidden.
 */
export function AppShell({ toolbar, sidebar, browser, detail }: AppShellProps) {
  return (
    <div className={`app-root ${styles.shell}`}>
      <h1 className="sr-only">资产浏览器</h1>
      <div className={styles.toolbar}>{toolbar}</div>
      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="资产分类">
          {sidebar}
        </nav>
        <main className={styles.main}>{browser}</main>
        <aside className={styles.detail} aria-label="资产详情">
          {detail}
        </aside>
      </div>
    </div>
  );
}
