import type { Asset } from '../state/types';
import { inferAssetType, extractFormat } from './fileType';
import { newId } from './id';

export const MAX_THUMB_DIM = 200;

export async function parseFile(
  file: File,
  uploader: string = '我',
  when: Date = new Date(),
): Promise<Asset> {
  const type = inferAssetType(file.type, file.name);
  const format = extractFormat(file.name);
  const base = {
    id: newId(),
    name: file.name,
    type,
    format,
    size: file.size,
    uploadedAt: when.toISOString(),
    uploadedBy: uploader,
    tags: [] as string[],
    favorite: false,
    deletedAt: null as string | null,
  };

  if (type === 'image') {
    const dims = await readImageDims(file);
    const preview = await generateImageThumbnail(file, MAX_THUMB_DIM);
    return { ...base, ...dims, previewDataUrl: preview };
  }
  if (type === 'video') {
    const meta = await readVideoMeta(file);
    return { ...base, ...meta };
  }
  if (type === 'audio') {
    const duration = await readAudioDuration(file);
    return { ...base, duration };
  }
  return base;
}

function readImageDims(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;
    const finish = (dims: { width: number; height: number }) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onload = () => finish({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => finish({ width: 0, height: 0 });
    // jsdom may silently swallow load errors for invalid images — fall back after a timeout.
    setTimeout(() => finish({ width: 0, height: 0 }), 2000);
    img.src = url;
  });
}

function generateImageThumbnail(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;
    const finish = (dataUrl: string) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };
    img.onload = () => {
      const ratio = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      const w = Math.max(1, Math.round(img.naturalWidth * ratio));
      const h = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish('');
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      finish(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => finish('');
    // jsdom fallback for invalid images.
    setTimeout(() => finish(''), 2000);
    img.src = url;
  });
}

function readVideoMeta(
  file: File,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0, duration: 0 });
    };
    v.src = url;
  });
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      resolve(a.duration);
      URL.revokeObjectURL(url);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    a.src = url;
  });
}
