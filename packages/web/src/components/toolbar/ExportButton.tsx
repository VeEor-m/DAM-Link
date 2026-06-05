import { useState } from 'react';
import type { Asset } from '../../state/types.js';

/**
 * Export the current asset list as a JSON manifest + thumbnail files.
 * The user downloads a zip-style folder layout (we use a simple download
 * of the manifest as JSON; thumbnails can be added in v2).
 */
export function ExportButton({ assets }: { assets: Asset[] }) {
  const [busy, setBusy] = useState(false);

  const onClick = () => {
    setBusy(true);
    try {
      const manifest = {
        schemaVersion: 1,
        source: 'dam-link-localstorage',
        exportedAt: new Date().toISOString(),
        assets: assets
          .filter((a) => !a.deletedAt)
          .map((a) => ({
            clientId: a.id,
            name: a.name,
            type: a.type,
            format: a.format,
            size: a.size,
            tags: a.tags,
            favorite: a.favorite,
            uploadedAt: a.uploadedAt,
            uploadedBy: a.uploadedBy,
            width: a.width,
            height: a.height,
            duration: a.duration,
          })),
      };
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dam-link-export-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={onClick} disabled={busy} aria-label="Export library as JSON">
      {busy ? 'Exporting…' : 'Export JSON'}
    </button>
  );
}
