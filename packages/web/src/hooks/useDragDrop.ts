import { useState, useCallback, type DragEvent } from 'react';

interface UseDragDropOptions {
  onDrop: (files: File[]) => void;
}

export function useDragDrop({ onDrop }: UseDragDropOptions) {
  const [dragActive, setDragActive] = useState(false);
  const [, setCounter] = useState(0);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setCounter((c) => c + 1);
      setDragActive(true);
    }
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCounter((c) => {
      const next = c - 1;
      if (next <= 0) {
        setDragActive(false);
        return 0;
      }
      return next;
    });
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      setCounter(0);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onDrop(files);
    },
    [onDrop],
  );

  return {
    dragActive,
    dropHandlers: {
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop: handleDrop,
    },
  };
}
