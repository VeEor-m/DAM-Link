import { Modal } from './Modal';
import type { KeymapEntry } from '../../state/keymap';

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  entries: KeymapEntry[];
}

export function ShortcutsHelp({ open, onClose, entries }: ShortcutsHelpProps) {
  return (
    <Modal open={open} title="键盘快捷键" onClose={onClose}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td
                style={{
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 8px',
                  background: 'var(--color-background-tertiary)',
                  borderRadius: 'var(--border-radius-sm)',
                  fontSize: 12,
                  width: 80,
                  textAlign: 'center',
                }}
              >
                {e.key === ' ' ? 'Space' : e.key}
              </td>
              <td style={{ padding: '4px 12px', fontSize: 13 }}>{e.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
