import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
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

  // Ref-mirror of `state` so the dispatch callback below can read the
  // latest `state.assets` (for TOGGLE_FAVORITE / ADD_TAG / REMOVE_TAG
  // / BATCH_* computed patches) WITHOUT making itself depend on
  // `state`. Without the ref, the useCallback's dep array would have
  // to include `state`, which means every reducer action would
  // recreate wrappedDispatch — which in turn makes every consumer
  // effect that puts `dispatch` in its dep array re-run on every
  // state change (see App.tsx's sidebar-counts refetch for the
  // canonical offender: the feedback loop produced ~2 fetches/sec).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // STABLE across all state changes (deps: [dispatch] only — the raw
  // useReducer dispatch is guaranteed stable by React). The callback
  // reads current state via `stateRef.current`, not via the closure.
  const wrappedDispatch = useCallback<React.Dispatch<Action>>((action) => {
    if (action.type === 'TOGGLE_FAVORITE') {
      const a = stateRef.current.assets.find((x) => x.id === action.id);
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
      const a = stateRef.current.assets.find((x) => x.id === action.id);
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
      const a = stateRef.current.assets.find((x) => x.id === action.id);
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
        const a = stateRef.current.assets.find((x) => x.id === id);
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
        const a = stateRef.current.assets.find((x) => x.id === id);
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
        const a = stateRef.current.assets.find((x) => x.id === id);
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
  }, [dispatch]);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!hydrated) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <StoreContext.Provider value={{ state, dispatch: wrappedDispatch }}>
      {children}
    </StoreContext.Provider>
  );
}
