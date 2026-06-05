import { useEffect, useRef } from 'react';
import { matchKey, type KeymapEntry, type KeymapScope } from '../state/keymap';

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(
  entries: KeymapEntry[],
  scope: KeymapScope = 'global',
) {
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const activeScope: KeymapScope = isEditableTarget(e) ? 'editing' : scope;
      const entry = matchKey(entriesRef.current, e, activeScope);
      if (entry) {
        e.preventDefault();
        entry.handler(e);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [scope]);
}
