import type { AppState } from './types';
import { initialUI } from './initialUI';

export const STORAGE_KEY = 'dam-link-state-v1';
const DEBOUNCE_MS = 300;

let pending: ReturnType<typeof setTimeout> | null = null;
let lastValue: AppState | null = null;

function isAppState(x: unknown): x is AppState {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (!Array.isArray(s.assets)) return false;
  if (!s.ui || typeof s.ui !== 'object') return false;
  return true;
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isAppState(parsed)) return null;
    // Migration: a persisted state from a previous version may be
    // missing fields that were added later (e.g. selectedIds in T1,
    // sortKey/sortDir in T6). Merge `initialUI` defaults underneath
    // the loaded ui so missing fields fall back to the default
    // instead of crashing the app. Persisted values win where present.
    return {
      assets: parsed.assets,
      ui: {
        ...initialUI,
        ...(parsed.ui as object),
        // Nested merge: the `filter` object can be partial too, so
        // fall back to the default filter sub-fields where missing.
        filter: {
          ...initialUI.filter,
          ...((parsed.ui as { filter?: object }).filter ?? {}),
        },
      },
    };
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  lastValue = state;
  if (pending) return;
  pending = setTimeout(() => {
    try {
      if (lastValue) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lastValue));
      }
    } catch {
      // quota exceeded — swallow
    }
    pending = null;
  }, DEBOUNCE_MS);
}
