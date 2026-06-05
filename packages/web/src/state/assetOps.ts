import type { AppState, Asset } from './types';

export interface OpResult {
  nextState: AppState;
  undo?: { asset: Asset };
}

export function deleteAsset(state: AppState, id: string, when: Date): OpResult {
  const target = state.assets.find((a) => a.id === id);
  if (!target) return { nextState: state };
  const undoAsset = { ...target };
  return {
    nextState: {
      ...state,
      assets: state.assets.map((a) =>
        a.id === id ? { ...a, deletedAt: when.toISOString().replace(/\.\d{3}Z$/, 'Z') } : a,
      ),
    },
    undo: { asset: undoAsset },
  };
}

export function restoreAsset(state: AppState, id: string): OpResult {
  const target = state.assets.find((a) => a.id === id);
  if (!target) return { nextState: state };
  // Note: `restoreAsset` deliberately does NOT touch `ui`. Unlike
  // `permanentDelete` and `emptyTrash` (which can remove the currently
  // selected asset and must clear `selectedAssetId`), restoring an asset
  // never removes it from state, so the existing selection stays valid.
  return {
    nextState: {
      ...state,
      assets: state.assets.map((a) =>
        a.id === id ? { ...a, deletedAt: null } : a,
      ),
    },
  };
}

export function permanentDelete(state: AppState, id: string): OpResult {
  return {
    nextState: {
      ...state,
      assets: state.assets.filter((a) => a.id !== id),
      ui: {
        ...state.ui,
        selectedAssetId:
          state.ui.selectedAssetId === id ? null : state.ui.selectedAssetId,
      },
    },
  };
}

export function emptyTrash(state: AppState): OpResult {
  return {
    nextState: {
      ...state,
      assets: state.assets.filter((a) => a.deletedAt === null),
      ui: { ...state.ui, selectedAssetId: null },
    },
  };
}
