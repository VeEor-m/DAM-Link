import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the API layer. We assert ONLY on `sidebarCounts` call counts;
// other endpoints are stubbed so the App can hydrate.
vi.mock('../src/api/auth.js', () => ({ me: vi.fn(), logout: vi.fn() }));
vi.mock('../src/api/orgs.js', () => ({ listMyOrgs: vi.fn(), createOrg: vi.fn() }));
vi.mock('../src/api/assets.js', () => ({
  listAssets: vi.fn(),
  sidebarCounts: vi.fn(),
  updateAsset: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
  permanentDelete: vi.fn(),
  getDownloadUrl: vi.fn(),
  emptyTrash: vi.fn(),
}));
vi.mock('../src/api/share-links.js', () => ({
  createShareLink: vi.fn(),
  listShareLinks: vi.fn(),
  revokeShareLink: vi.fn(),
}));

import App from '../src/App';
import { StoreProvider } from '../src/state/store';
import { ToastProvider } from '../src/components/common/ToastProvider';
import { me } from '../src/api/auth.js';
import { listMyOrgs } from '../src/api/orgs.js';
import { listAssets, sidebarCounts } from '../src/api/assets.js';
import type { Asset } from '@dam-link/contracts';

function makeApiAsset(): Asset {
  return {
    id: 'a1',
    orgId: 'org-1',
    name: 'logo.png',
    type: 'image',
    format: 'PNG',
    size: 1024,
    mimeType: 'image/png',
    uploadedAt: '2026-06-07T00:00:00.000Z',
    uploadedBy: 'u1',
    tags: [],
    favorite: false,
    deletedAt: null,
    objectKey: 'originals/org-1/a1',
    status: 'ready',
    visibility: 'org',
    width: 100,
    height: 100,
    thumbnailKey: null,
    thumbnailUrl: null,
  };
}

/** Mount App with one asset and wait for the card to render (hydration
 *  + first list+counts fetch). */
async function mountApp() {
  vi.mocked(me).mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c', displayName: 'A', createdAt: '2026-06-07T00:00:00.000Z' },
    orgs: [],
  });
  vi.mocked(listMyOrgs).mockResolvedValue([
    {
      org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-07T00:00:00.000Z' },
      role: 'owner',
    },
  ]);
  vi.mocked(listAssets).mockResolvedValue({ items: [makeApiAsset()], nextCursor: null });
  vi.mocked(sidebarCounts).mockResolvedValue({
    byType: { image: 1, video: 0, document: 0, audio: 0 },
    byTag: [],
    favorites: 0,
    trash: 0,
  });

  const utils = render(
    <StoreProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StoreProvider>,
  );
  await screen.findByText('logo.png');
  return utils;
}

describe('App — sidebar-counts refetch behavior', () => {
  beforeEach(() => {
    vi.mocked(sidebarCounts).mockClear();
  });

  it('does NOT refetch sidebar counts when the user types in the search box', async () => {
    await mountApp();
    // Let the initial mount-time refetch (from App.tsx's debounced
    // effect, 500ms after hydration) complete and stabilize.
    await new Promise((r) => setTimeout(r, 1500));
    vi.mocked(sidebarCounts).mockClear();

    // Type a search query. This dispatches SET_SEARCH on every
    // keystroke. With the bug, each dispatch recreates wrappedDispatch
    // and re-fires the refetch effect, producing a fresh fetch every
    // ~500ms.
    const user = userEvent.setup();
    const search = screen.getByRole('searchbox');
    await user.type(search, 'logo');

    // Wait long enough for any debounced refetch to fire. With the
    // fix, zero calls. With the bug, 2-3 calls in this window.
    await new Promise((r) => setTimeout(r, 1500));

    expect(vi.mocked(sidebarCounts)).not.toHaveBeenCalled();
  });

  it('does NOT refetch sidebar counts when the user toggles view mode', async () => {
    await mountApp();
    await new Promise((r) => setTimeout(r, 1500));
    vi.mocked(sidebarCounts).mockClear();

    // Toggle the view-mode button. The Toolbar exposes a grid/list
    // toggle; clicking it dispatches SET_VIEW_MODE. Same root cause
    // as the search test.
    const user = userEvent.setup();
    const listButton = screen.getByRole('button', { name: /list|列表/i });
    await user.click(listButton);

    await new Promise((r) => setTimeout(r, 1500));

    expect(vi.mocked(sidebarCounts)).not.toHaveBeenCalled();
  });
});
