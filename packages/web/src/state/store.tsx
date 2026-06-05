import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  type ReactNode,
} from 'react';
import type { AppState } from './types';
import { MOCK_ASSETS } from './mockData';
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
  const persisted = loadState();
  if (persisted) return persisted;
  return { assets: MOCK_ASSETS, ui: initialUI };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  // persist on every state change (debounced inside saveState)
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

  return (
    <StoreContext.Provider value={{ state, dispatch: wrappedDispatch }}>
      {children}
    </StoreContext.Provider>
  );
}
