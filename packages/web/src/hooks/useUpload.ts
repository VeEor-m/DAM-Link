import { useCallback, useState } from 'react';
import { initiateUpload, finalizeUpload, directPut } from '../api/uploads.js';
import { ApiError } from '../api/client.js';

export interface UploadItem {
  id: string; // local temp id
  file: File;
  status: 'queued' | 'uploading' | 'finalizing' | 'done' | 'error';
  serverId?: string;
  error?: string;
  /** Optional metadata to attach (e.g. width/height for images). */
  meta?: { width?: number; height?: number; duration?: number };
}

export function useUpload(orgId: string) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const uploadOne = useCallback(
    async (item: UploadItem) => {
      try {
        const init = await initiateUpload(orgId, {
          filename: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          size: item.file.size,
          type: item.meta?.duration ? 'video' : (item.file.type.startsWith('image/') ? 'image' : (item.file.type.startsWith('video/') ? 'video' : (item.file.type.startsWith('audio/') ? 'audio' : 'document'))),
          format: (item.file.name.split('.').pop() ?? 'bin').toUpperCase(),
        });
        updateItem(item.id, { status: 'uploading', serverId: init.assetId });
        await directPut(init.uploadUrl, item.file);
        updateItem(item.id, { status: 'finalizing' });
        await finalizeUpload(orgId, init.assetId, item.meta ?? {});
        updateItem(item.id, { status: 'done' });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Unknown error';
        updateItem(item.id, { status: 'error', error: message });
      }
    },
    [orgId],
  );

  const uploadMany = useCallback(
    async (files: File[]) => {
      const newItems: UploadItem[] = files.map((f, idx) => ({
        id: `local-${Date.now()}-${idx}`,
        file: f,
        status: 'queued',
      }));
      setItems((cur) => [...cur, ...newItems]);
      // Sequential for now; parallel is fine too but uses more bandwidth.
      for (const item of newItems) {
        await uploadOne(item);
      }
    },
    [uploadOne],
  );

  return { items, uploadMany };
}
