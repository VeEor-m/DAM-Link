import { api } from './client.js';
import type { InitiateUploadResponse } from '@dam-link/contracts';

export async function initiateUpload(
  orgId: string,
  input: { filename: string; mimeType: string; size: number; type: 'image' | 'video' | 'document' | 'audio'; format: string },
): Promise<InitiateUploadResponse> {
  return api(`/orgs/${orgId}/uploads`, { method: 'POST', body: input });
}

export async function finalizeUpload(
  orgId: string,
  assetId: string,
  meta: { width?: number; height?: number; duration?: number } = {},
): Promise<{ id: string; status: 'ready' }> {
  return api(`/orgs/${orgId}/assets/${assetId}/finalize`, { method: 'POST', body: meta });
}

/** Direct PUT to the presigned S3 URL. */
export async function directPut(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': file.type },
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
}
