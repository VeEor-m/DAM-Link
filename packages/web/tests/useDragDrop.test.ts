import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDragDrop } from '../src/hooks/useDragDrop';

function makeDt(files: File[] = []) {
  const dt = {
    files,
    types: files.length > 0 ? ['Files'] : [],
  } as unknown as DataTransfer;
  return dt;
}

describe('useDragDrop', () => {
  it('starts inactive', () => {
    const { result } = renderHook(() => useDragDrop({ onDrop: () => {} }));
    expect(result.current.dragActive).toBe(false);
  });

  it('activates on dragenter with files', () => {
    const { result } = renderHook(() => useDragDrop({ onDrop: () => {} }));
    const ev = new Event('dragenter', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: makeDt([new File([''], 'a.png')]) });
    act(() => result.current.dropHandlers.onDragEnter(ev as unknown as React.DragEvent));
    expect(result.current.dragActive).toBe(true);
  });

  it('calls onDrop with files on drop', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop }));
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: makeDt([file]) });
    act(() => result.current.dropHandlers.onDrop(ev as unknown as React.DragEvent));
    expect(onDrop).toHaveBeenCalledWith([file]);
  });

  it('deactivates on dragleave', () => {
    const { result } = renderHook(() => useDragDrop({ onDrop: () => {} }));
    const ev = new Event('dragleave', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: makeDt() });
    act(() => result.current.dropHandlers.onDragEnter(ev as unknown as React.DragEvent));
    act(() => result.current.dropHandlers.onDragLeave(ev as unknown as React.DragEvent));
    expect(result.current.dragActive).toBe(false);
  });
});
