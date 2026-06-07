import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../src/api/uploads.js', () => ({
  initiateUpload: vi.fn(),
  directPut: vi.fn(),
  finalizeUpload: vi.fn(),
}));

import { useUpload } from '../src/hooks/useUpload';
import { initiateUpload, directPut, finalizeUpload } from '../src/api/uploads.js';

const baseInit = {
  assetId: 'srv-1',
  uploadUrl: 'https://s3/put?sig=abc',
  objectKey: 'originals/org-1/srv-1',
  expiresInSec: 300,
};

describe('useUpload — onUploaded callback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fires onUploaded with the server id after a successful upload', async () => {
    vi.mocked(initiateUpload).mockResolvedValue(baseInit);
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockResolvedValue({ id: 'srv-1', status: 'ready' });

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await act(async () => {
      await result.current.uploadMany([file]);
    });

    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith('srv-1');
    expect(result.current.items[0]?.status).toBe('done');
  });

  it('does NOT fire onUploaded when directPut throws', async () => {
    vi.mocked(initiateUpload).mockResolvedValue(baseInit);
    vi.mocked(directPut).mockRejectedValue(new Error('network'));
    vi.mocked(finalizeUpload).mockResolvedValue({ id: 'srv-1', status: 'ready' });

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await act(async () => {
      await result.current.uploadMany([file]);
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(result.current.items[0]?.status).toBe('error');
  });

  it('does NOT fire onUploaded when finalizeUpload throws', async () => {
    vi.mocked(initiateUpload).mockResolvedValue(baseInit);
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockRejectedValue(new Error('500'));

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await act(async () => {
      await result.current.uploadMany([file]);
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(result.current.items[0]?.status).toBe('error');
  });

  it('fires onUploaded once per file when uploading multiple files sequentially', async () => {
    let counter = 0;
    vi.mocked(initiateUpload).mockImplementation(async () => ({
      ...baseInit,
      assetId: `srv-${++counter}`,
    }));
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockImplementation(async (_org, id) => ({
      id,
      status: 'ready' as const,
    }));

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.png', { type: 'image/png' }),
    ];
    await act(async () => {
      await result.current.uploadMany(files);
    });

    expect(onUploaded).toHaveBeenCalledTimes(3);
    expect(result.current.items.every((i) => i.status === 'done')).toBe(true);
  });

  it('swallows errors thrown by onUploaded (upload state still reaches "done")', async () => {
    vi.mocked(initiateUpload).mockResolvedValue(baseInit);
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockResolvedValue({ id: 'srv-1', status: 'ready' });

    const onUploaded = vi.fn(() => {
      throw new Error('consumer crashed');
    });
    const { result } = renderHook(() => useUpload('org-1', { onUploaded }));

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await act(async () => {
      await result.current.uploadMany([file]);
    });

    // Upload succeeded; consumer crashed but the hook didn't propagate.
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(result.current.items[0]?.status).toBe('done');
  });
});
