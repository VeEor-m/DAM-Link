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
});
