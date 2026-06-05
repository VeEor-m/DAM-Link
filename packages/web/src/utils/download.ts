import type { Asset } from '../state/types';

export function downloadAsset(asset: Asset): void {
  if (asset.previewDataUrl) {
    const a = document.createElement('a');
    a.href = asset.previewDataUrl;
    a.download = asset.name;
    a.click();
    return;
  }
  // No data available (seed assets have no blob). Show a synthetic placeholder.
  const blob = new Blob(
    [`This is a placeholder for ${asset.name}.\nIn a real app, the file bytes would be downloaded here.`],
    { type: 'text/plain' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = asset.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
