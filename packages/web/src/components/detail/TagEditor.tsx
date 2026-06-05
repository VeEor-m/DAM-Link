import { useState, type KeyboardEvent } from 'react';
import styles from './TagEditor.module.css';

interface TagEditorProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  readOnly?: boolean;
}

export function TagEditor({ tags, onAdd, onRemove, readOnly }: TagEditorProps) {
  const [value, setValue] = useState('');

  function commit() {
    const v = value.trim();
    if (!v || tags.includes(v)) {
      setValue('');
      return;
    }
    onAdd(v);
    setValue('');
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setValue('');
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.list}>
        {tags.map((t) => (
          <span key={t} className={styles.tag}>
            {t}
            {!readOnly && (
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => onRemove(t)}
                aria-label={`移除标签 ${t}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <input
          type="text"
          className={styles.input}
          placeholder="+ 添加标签"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
        />
      )}
    </div>
  );
}
