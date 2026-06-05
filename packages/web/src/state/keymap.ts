export type KeymapScope = 'global' | 'editing' | 'modal';

export interface KeymapEntry {
  key: string; // case-insensitive single char or named key (Enter, Esc, Delete, Backspace, ?, ArrowUp, ArrowDown)
  scope: KeymapScope;
  description: string;
  handler: (e: KeyboardEvent) => void;
  /**
   * Optional modifier requirement. When set, the entry only matches if
   * the corresponding modifier is held. 'ctrl' matches either Ctrl or
   * Meta (Cmd) so the same binding works on Windows and Mac.
   */
  mod?: 'ctrl';
}

export function matchKey(
  entries: KeymapEntry[],
  e: KeyboardEvent,
  scope: KeymapScope,
): KeymapEntry | null {
  for (const entry of entries) {
    if (entry.scope !== scope) continue;
    if (entry.mod === 'ctrl' && !(e.ctrlKey || e.metaKey)) continue;
    if (entry.key.length === 1 ? entry.key.toLowerCase() === e.key.toLowerCase() : entry.key === e.key) return entry;
  }
  return null;
}
