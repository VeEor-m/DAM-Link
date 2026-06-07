import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/auth.js', () => ({ me: vi.fn() }));
vi.mock('../src/api/orgs.js', () => ({ listMyOrgs: vi.fn() }));
vi.mock('../src/api/assets.js', () => ({
  listAssets: vi.fn(),
  sidebarCounts: vi.fn(),
}));

import { me } from '../src/api/auth.js';
import { listMyOrgs } from '../src/api/orgs.js';
import { listAssets, sidebarCounts } from '../src/api/assets.js';
import { loadState } from '../src/state/persistence';

describe('loadState() — activeOrgId hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets activeOrgId from the first org on success', async () => {
    vi.mocked(me).mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.c', displayName: 'A', createdAt: '2026-06-06T00:00:00.000Z' },
      orgs: [],
    });
    vi.mocked(listMyOrgs).mockResolvedValue([
      { org: { id: '22222222-2222-4222-8222-222222222222', name: 'Org', slug: 'org', createdAt: '2026-06-06T00:00:00.000Z' }, role: 'owner' },
    ]);
    vi.mocked(listAssets).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({ byType: { image: 0, video: 0, document: 0, audio: 0 }, byTag: [], favorites: 0, trash: 0 });

    const s = await loadState();
    expect(s).not.toBeNull();
    expect(s!.ui.activeOrgId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('sets activeOrgId to null when the user has no orgs', async () => {
    vi.mocked(me).mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.c', displayName: 'A', createdAt: '2026-06-06T00:00:00.000Z' },
      orgs: [],
    });
    vi.mocked(listMyOrgs).mockResolvedValue([]);

    const s = await loadState();
    expect(s).not.toBeNull();
    expect(s!.ui.activeOrgId).toBeNull();
    expect(s!.assets).toEqual([]);
  });

  it('returns null when me() throws (not logged in)', async () => {
    vi.mocked(me).mockRejectedValue(new Error('401'));
    const s = await loadState();
    expect(s).toBeNull();
  });

  it('fetches both active and trashed assets and includes server counts', async () => {
    const ACTIVE_ID = '11111111-1111-4111-8111-aaaaaaaaaaaa';
    const TRASH_ID = '22222222-2222-4222-8222-bbbbbbbbbbbb';
    const ACTIVE = {
      id: ACTIVE_ID, orgId: 'org-1', name: 'active.png', type: 'image' as const,
      format: 'PNG', size: 1024, mimeType: 'image/png',
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null,
      objectKey: `originals/org-1/${ACTIVE_ID}`, status: 'ready' as const,
      visibility: 'org' as const, width: 100, height: 100,
      thumbnailKey: null, thumbnailUrl: null,
    };
    const TRASHED = { ...ACTIVE, id: TRASH_ID, name: 'old.png', deletedAt: '2026-06-05T00:00:00.000Z' };

    vi.mocked(me).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c', displayName: 'A', createdAt: '2026-06-06T00:00:00.000Z' },
      orgs: [],
    });
    vi.mocked(listMyOrgs).mockResolvedValue([
      { org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-06T00:00:00.000Z' }, role: 'owner' },
    ]);
    // First call → active; second call → trash.
    vi.mocked(listAssets)
      .mockResolvedValueOnce({ items: [ACTIVE], nextCursor: null })
      .mockResolvedValueOnce({ items: [TRASHED], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({
      byType: { image: 1, video: 0, document: 0, audio: 0 },
      byTag: [],
      favorites: 0,
      trash: 1,
    });

    const s = await loadState();
    expect(s).not.toBeNull();
    // Both calls were made with the right args.
    expect(listAssets).toHaveBeenCalledTimes(2);
    // First call: active list (no `inTrash: true` filter). We use
    // `not.objectContaining` because the first call doesn't include an
    // `inTrash` key at all (it's the API default), and Vitest 4's
    // `objectContaining({ key: undefined })` does NOT match an object
    // that simply lacks the key.
    expect(listAssets).toHaveBeenNthCalledWith(
      1, 'org-1', expect.not.objectContaining({ inTrash: true }),
    );
    expect(listAssets).toHaveBeenNthCalledWith(
      2, 'org-1', expect.objectContaining({ inTrash: true }),
    );
    // Both assets are in the returned state.
    expect(s!.assets.map((a) => a.id).sort()).toEqual([ACTIVE_ID, TRASH_ID].sort());
    // The trashed one has deletedAt set.
    const trashAsset = s!.assets.find((a) => a.id === TRASH_ID)!;
    expect(trashAsset.deletedAt).toBe('2026-06-05T00:00:00.000Z');
    // The server counts are stored in ui.
    expect(s!.ui.sidebarCounts).toEqual({
      byType: { image: 1, video: 0, document: 0, audio: 0 },
      byTag: [],
      favorites: 0,
      trash: 1,
    });
  });
});
