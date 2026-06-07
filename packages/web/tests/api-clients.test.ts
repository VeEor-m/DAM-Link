import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getDownloadUrl } from '../src/api/assets.js';
import { createShareLink } from '../src/api/share-links.js';

describe('getDownloadUrl', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches and returns the download URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { downloadUrl: 'https://cdn/x?sig=abc' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await getDownloadUrl('org-1', 'asset-1');
    expect(res.downloadUrl).toBe('https://cdn/x?sig=abc');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/orgs/org-1/assets/asset-1/download-url',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('throws ApiError on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'gone' } }), { status: 404 }),
    );
    await expect(getDownloadUrl('o', 'a')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('createShareLink', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts and returns the share link', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 'l1', assetId: 'a1', orgId: 'o1', token: 'tok1234567890abcdef',
            createdBy: 'u1', createdAt: '2026-06-06T00:00:00.000Z',
            expiresAt: null, revokedAt: null, hasPassword: false,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const link = await createShareLink('o1', 'a1', {});
    expect(link.token).toBe('tok1234567890abcdef');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/orgs/o1/assets/a1/share-links',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });
});
