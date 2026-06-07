import { getDownloadUrl } from '../api/assets.js';
import type { Asset } from '../state/types';

/**
 * Triggers a browser download for an asset.
 *
 * Flow:
 *  1. Ask the API for a presigned GET URL (15-minute TTL).
 *  2. Create a hidden <a download="<name>" href="<url>"> and click it.
 *  3. The browser follows the presigned URL and saves the file.
 *
 * Throws on API failure (the caller is responsible for surfacing the error).
 */
export async function downloadAsset(asset: Asset, orgId: string): Promise<void> {
  const { downloadUrl } = await getDownloadUrl(orgId, asset.id);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = asset.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
