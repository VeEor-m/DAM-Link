import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import type { AppState } from './types';
import type { Action } from './actions';
import { loadState, saveState } from './persistence';
import { reducer } from './reducer';
import { initialUI } from './initialUI';

export interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

export const StoreContext = createContext<StoreContextValue | null>(null);

function init(): AppState {
  // loadState is async, so the real hydration happens in the useEffect below.
  // Seed with an empty state so the reducer has a valid initial value; the
  // StoreProvider renders a loading screen until the API responds.
  return { assets: [], ui: { ...initialUI, filter: { ...initialUI.filter } } };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadState()
      .then((s) => {
        if (cancelled) return;
        if (s) {
          dispatch({ type: 'HYDRATE_STATE', state: s });
        }
        // If s is null (not logged in), leave state as the empty init
        // state so App can render the LoginScreen (Task 10).
        setHydrated(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every state change (debounced inside saveState — a no-op now
  // that the server is the source of truth).
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Fix up computed patches (TOGGLE_FAVORITE, ADD_TAG, REMOVE_TAG,
  // BATCH_TOGGLE_FAVORITE, BATCH_ADD_TAG, BATCH_REMOVE_TAG) by reading the
  // current asset and dispatching the actual UPDATE_ASSET. This keeps the
  // reducer pure and the patch function non-special.
  // Wrapped in useCallback so consumers that put `dispatch` in a dependency
  // array don't see a fresh reference on every state change (which would
  // re-run their effects). `state` is a dep because the computed patches
  // read from the current assets; the callback is therefore stable until
  // state itself changes, which is when consumers would re-run anyway.
  const wrappedDispatch = useCallback<React.Dispatch<Action>>((action) => {
    if (action.type === 'TOGGLE_FAVORITE') {
      const a = state.assets.find((x) => x.id === action.id);
      if (a) {
        dispatch({
          type: 'UPDATE_ASSET',
          id: action.id,
          patch: { favorite: !a.favorite },
        });
      }
      return;
    }
    if (action.type === 'ADD_TAG') {
      const a = state.assets.find((x) => x.id === action.id);
      if (a && !a.tags.includes(action.tag)) {
        dispatch({
          type: 'UPDATE_ASSET',
          id: action.id,
          patch: { tags: [...a.tags, action.tag] },
        });
      }
      return;
    }
    if (action.type === 'REMOVE_TAG') {
      const a = state.assets.find((x) => x.id === action.id);
      if (a) {
        dispatch({
          type: 'UPDATE_ASSET',
          id: action.id,
          patch: { tags: a.tags.filter((t) => t !== action.tag) },
        });
      }
      return;
    }
    if (action.type === 'BATCH_TOGGLE_FAVORITE') {
      for (const id of action.ids) {
        const a = state.assets.find((x) => x.id === id);
        if (a) {
          dispatch({
            type: 'UPDATE_ASSET',
            id,
            patch: { favorite: !a.favorite },
          });
        }
      }
      return;
    }
    if (action.type === 'BATCH_ADD_TAG') {
      for (const id of action.ids) {
        const a = state.assets.find((x) => x.id === id);
        if (a && !a.tags.includes(action.tag)) {
          dispatch({
            type: 'UPDATE_ASSET',
            id,
            patch: { tags: [...a.tags, action.tag] },
          });
        }
      }
      return;
    }
    if (action.type === 'BATCH_REMOVE_TAG') {
      for (const id of action.ids) {
        const a = state.assets.find((x) => x.id === id);
        if (a) {
          dispatch({
            type: 'UPDATE_ASSET',
            id,
            patch: { tags: a.tags.filter((t) => t !== action.tag) },
          });
        }
      }
      return;
    }
    dispatch(action);
  }, [state, dispatch]);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!hydrated) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <StoreContext.Provider value={{ state, dispatch: wrappedDispatch }}>
      {children}
    </StoreContext.Provider>
  );
}
