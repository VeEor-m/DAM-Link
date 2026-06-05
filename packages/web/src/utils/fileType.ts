import type { AssetType } from '../state/types';

/** Map a MIME type or filename to a coarse AssetType. */
export function inferAssetType(mime: string, name?: string): AssetType {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  // document — fall through to extension check
  if (mime === 'application/pdf') return 'document';
  if (
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed'
  )
    return 'document';
  if (
    mime.includes('officedocument') ||
    mime.includes('msword') ||
    mime.includes('ms-excel') ||
    mime.includes('ms-powerpoint') ||
    mime === 'text/plain' ||
    mime === 'text/markdown'
  )
    return 'document';
  if (name) {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext))
      return 'image';
    if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio';
    if (
      ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'zip']
        .includes(ext)
    )
      return 'document';
  }
  return 'document';
}

export function extractFormat(name: string): string {
  const ext = name.split('.').pop() ?? '';
  return ext.toUpperCase();
}

/** A emoji used as the card thumbnail when no preview image is available. */
export function thumbnailEmoji(type: AssetType, format: string): string {
  if (type === 'image') {
    if (format === 'SVG') return '🎨';
    return '🖼️';
  }
  if (type === 'video') return '🎬';
  if (type === 'audio') return '🎵';
  // document
  if (format === 'PDF') return '📕';
  if (format === 'ZIP') return '🗜️';
  if (['DOC', 'DOCX'].includes(format)) return '📝';
  if (['XLS', 'XLSX'].includes(format)) return '📊';
  if (['PPT', 'PPTX'].includes(format)) return '📊';
  return '📄';
}
