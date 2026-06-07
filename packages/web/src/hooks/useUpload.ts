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

export interface UseUploadOptions {
  /**
   * Called with the server-side asset id when an upload + finalize succeeds.
   * The hook does NOT throw if the callback throws — failures are swallowed
   * (the upload itself has already succeeded on the server). The caller is
   * expected to handle the asset-id (e.g. fetch full Asset via getAsset and
   * dispatch ADD_ASSET).
   */
  onUploaded?: (serverId: string) => void;
}

export function useUpload(orgId: string, options: UseUploadOptions = {}) {
  const { onUploaded } = options;
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
          type: item.meta?.duration
            ? 'video'
            : item.file.type.startsWith('image/')
              ? 'image'
              : item.file.type.startsWith('video/')
                ? 'video'
                : item.file.type.startsWith('audio/')
                  ? 'audio'
                  : 'document',
          format: (item.file.name.split('.').pop() ?? 'bin').toUpperCase(),
        });
        updateItem(item.id, { status: 'uploading', serverId: init.assetId });
        await directPut(init.uploadUrl, item.file);
        updateItem(item.id, { status: 'finalizing' });
        await finalizeUpload(orgId, init.assetId, item.meta ?? {});
        updateItem(item.id, { status: 'done' });
        // Fire callback after the local state is updated so consumers that
        // re-render immediately see the 'done' row.
        try {
          onUploaded?.(init.assetId);
        } catch {
          // swallow — see UseUploadOptions.onUploaded doc
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unknown error';
        updateItem(item.id, { status: 'error', error: message });
      }
    },
    [orgId, onUploaded],
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
