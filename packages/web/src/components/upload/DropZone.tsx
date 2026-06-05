import { useRef } from 'react';
import { IconUpload } from '@tabler/icons-react';
import { useDragDrop } from '../../hooks/useDragDrop';
import styles from './DropZone.module.css';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
}

export function DropZone({ onFiles, multiple = true }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { dragActive, dropHandlers } = useDragDrop({ onDrop: onFiles });

  return (
    <div
      className={`${styles.zone} ${dragActive ? styles.active : ''}`}
      {...dropHandlers}
    >
      <span className={styles.icon} aria-hidden="true">
        <IconUpload size={32} />
      </span>
      <div className={styles.hint}>
        {dragActive ? '松开以上传文件' : '拖拽文件到此处，或点击下方按钮选择'}
      </div>
      <button
        type="button"
        className={styles.pickBtn}
        onClick={() => inputRef.current?.click()}
      >
        选择文件
      </button>
      <input
        ref={inputRef}
        type="file"
        className={styles.hidden}
        multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
