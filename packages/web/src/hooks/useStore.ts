import { useContext } from 'react';
import { StoreContext } from '../state/store';

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
