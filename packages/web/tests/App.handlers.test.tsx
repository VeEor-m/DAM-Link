import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the API layer so the store can hydrate with a fake asset. The
// DetailPanel handlers all call the API through these modules — mocking
// at this boundary lets us assert the call shape (orgId, id, patch body)
// without an HTTP server.
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
vi.mock('../src/api/share-links.js', () => ({ createShareLink: vi.fn() }));

import App from '../src/App';
import { StoreProvider } from '../src/state/store';
import { ToastProvider } from '../src/components/common/ToastProvider';
import { me } from '../src/api/auth.js';
import { listMyOrgs } from '../src/api/orgs.js';
import {
  listAssets,
  sidebarCounts,
  updateAsset,
  softDelete,
  restore,
} from '../src/api/assets.js';
import { ApiError } from '../src/api/client.js';
import type { Asset } from '@dam-link/contracts';

/** Build an Asset that satisfies the contracts `AssetSchema` (status,
 *  visibility, mimeType, orgId, objectKey are required by the API). The
 *  frontend `Asset` type is a subset; the API layer returns the full
 *  shape. */
function makeApiAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    orgId: 'org-1',
    name: 'original.png',
    type: 'image',
    format: 'PNG',
    size: 1024,
    mimeType: 'image/png',
    uploadedAt: '2026-06-06T00:00:00.000Z',
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
    ...overrides,
  };
}

/** Mount <App /> with the bootstrapping API calls mocked, and wait for the
 *  asset card to render so we know the store is hydrated. */
async function mountAppWithAsset(asset: Asset) {
  vi.mocked(me).mockResolvedValue({
    user: {
      id: 'u1',
      email: 'a@b.c',
      displayName: 'A',
      createdAt: '2026-06-06T00:00:00.000Z',
    },
    orgs: [],
  });
  vi.mocked(listMyOrgs).mockResolvedValue([
    {
      org: {
        id: 'org-1',
        name: 'O',
        slug: 'o',
        createdAt: '2026-06-06T00:00:00.000Z',
      },
      role: 'owner',
    },
  ]);
  vi.mocked(listAssets).mockResolvedValue({ items: [asset], nextCursor: null });
  vi.mocked(sidebarCounts).mockResolvedValue({
    byType: { image: 0, video: 0, document: 0, audio: 0 },
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
  // wait for hydration + asset card
  await screen.findByText(asset.name);
  return utils;
}

/** Click the asset card to open the DetailPanel. */
async function selectAsset(user: ReturnType<typeof userEvent.setup>, name: string) {
  // The card has aria-label "${name}，${size}" so a regex on the name works.
  const card = screen.getByRole('button', { name: new RegExp(name, 'i') });
  await user.click(card);
}

describe('App — BatchActionBar handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  /** Mount <App /> with TWO assets so we can multi-select both and exercise
   *  the BatchActionBar. Returns the two asset shapes for assertions. */
  async function mountWithTwoAssets() {
    const a = makeApiAsset({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'a.png',
    });
    const b = makeApiAsset({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'b.png',
    });
    vi.mocked(me).mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.c',
        displayName: 'A',
        createdAt: '2026-06-06T00:00:00.000Z',
      },
      orgs: [],
    });
    vi.mocked(listMyOrgs).mockResolvedValue([
      {
        org: {
          id: 'org-1',
          name: 'O',
          slug: 'o',
          createdAt: '2026-06-06T00:00:00.000Z',
        },
        role: 'owner',
      },
    ]);
    vi.mocked(listAssets).mockResolvedValue({ items: [a, b], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({
      byType: { image: 0, video: 0, document: 0, audio: 0 },
      byTag: [],
      favorites: 0,
      trash: 0,
    });
    vi.mocked(updateAsset).mockImplementation(async (_o, id, patch) =>
      makeApiAsset({ id, ...patch }) as Asset,
    );
    vi.mocked(softDelete).mockImplementation(async (_o, id) =>
      makeApiAsset({ id, deletedAt: '2026-06-06T10:00:00.000Z' }) as Asset,
    );

    const utils = render(
      <StoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StoreProvider>,
    );
    await screen.findByText('a.png');
    return { a, b, utils };
  }

  it('batch favorite toggles both assets via PATCH', async () => {
    const user = userEvent.setup();
    await mountWithTwoAssets();

    // Multi-select checkboxes on the two asset cards (role="checkbox",
    // aria-label "选择" or "取消选择").
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[1]!);

    // BatchActionBar renders the "收藏" button (all-favorites=false).
    await user.click(screen.getByRole('button', { name: /^收藏/ }));
    await waitFor(() => {
      expect(updateAsset).toHaveBeenCalledWith('org-1', expect.any(String), { favorite: true });
    });
    // Both ids should appear in the PATCH calls.
    const ids = vi.mocked(updateAsset).mock.calls.map((c) => c[1]);
    expect(ids).toContain('11111111-1111-4111-8111-111111111111');
    expect(ids).toContain('22222222-2222-4222-8222-222222222222');
  });

  it('batch delete calls POST /soft-delete for each selected asset', async () => {
    const user = userEvent.setup();
    await mountWithTwoAssets();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[1]!);

    // The BatchActionBar delete button has aria-label "移到回收站".
    await user.click(screen.getByRole('button', { name: /移到回收站/ }));
    // Confirm dialog — the BatchActionBar button and the confirm button
    // share the same label ("移到回收站"). The confirm button is the
    // one rendered after the dialog opens, so pick the last match.
    const moveToTrashButtons = await screen.findAllByRole('button', { name: /^移到回收站$/ });
    expect(moveToTrashButtons.length).toBeGreaterThanOrEqual(2);
    await user.click(moveToTrashButtons[moveToTrashButtons.length - 1]!);

    await waitFor(() => {
      const ids = vi.mocked(softDelete).mock.calls.map((c) => c[1]);
      expect(ids).toContain('11111111-1111-4111-8111-111111111111');
      expect(ids).toContain('22222222-2222-4222-8222-222222222222');
    });
  });
});

describe('App DetailPanel handlers — API wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rename calls PATCH /assets/:id with the new name', async () => {
    const user = userEvent.setup();
    const updated = makeApiAsset({ name: 'renamed.png' });
    vi.mocked(updateAsset).mockResolvedValue(updated);

    await mountAppWithAsset(makeApiAsset({ name: 'original.png' }));
    await selectAsset(user, 'original.png');

    // The DetailPanel's name is a button with title="点击重命名" when not in
    // trash — disambiguates it from the AssetCard (which has aria-label
    // "${name}，${size}" instead).
    await user.click(screen.getByTitle('点击重命名'));
    // The DetailPanel also has the TagEditor input (placeholder "+ 添加标签"),
    // so disambiguate by the initial value the rename input is seeded with.
    const input = screen.getByDisplayValue('original.png');
    await user.clear(input);
    await user.type(input, 'renamed.png');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(updateAsset).toHaveBeenCalledWith('org-1', 'a1', { name: 'renamed.png' });
    });
  });

  it('rename rolls back + shows error toast when PATCH fails', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAsset).mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));

    await mountAppWithAsset(makeApiAsset({ name: 'original.png' }));
    await selectAsset(user, 'original.png');

    await user.click(screen.getByTitle('点击重命名'));
    const input = screen.getByDisplayValue('original.png');
    await user.clear(input);
    await user.type(input, 'will-fail.png');
    await user.keyboard('{Enter}');

    // Rollback restores the original name in the DetailPanel. The asset card
    // in the grid also shows the name, so query through the rename button
    // (its title stays "点击重命名" regardless of the name) to target the
    // panel only.
    await waitFor(() => {
      expect(screen.getByTitle('点击重命名')).toHaveTextContent('original.png');
    });
    // The error toast surfaces the failure message.
    expect(screen.getByText('重命名失败')).toBeInTheDocument();
  });

  it('favorite calls PATCH /assets/:id with the flipped value', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAsset).mockResolvedValue(makeApiAsset({ favorite: true }));

    await mountAppWithAsset(makeApiAsset({ name: 'x.png' }));
    await selectAsset(user, 'x.png');

    // The DetailPanel's favorite button label is "收藏" when not yet favorited.
    await user.click(screen.getByRole('button', { name: /^收藏/ }));
    await waitFor(() => {
      expect(updateAsset).toHaveBeenCalledWith('org-1', 'a1', { favorite: true });
    });
  });

  it('soft-delete calls POST /assets/:id/soft-delete', async () => {
    const user = userEvent.setup();
    const deletedAsset = makeApiAsset({
      name: 'x.png',
      deletedAt: '2026-06-06T10:00:00.000Z',
    });
    vi.mocked(softDelete).mockResolvedValue(deletedAsset);

    await mountAppWithAsset(makeApiAsset({ name: 'x.png' }));
    await selectAsset(user, 'x.png');

    await user.click(screen.getByRole('button', { name: /移到回收站/ }));
    await waitFor(() => {
      expect(softDelete).toHaveBeenCalledWith('org-1', 'a1');
    });
  });

  it('undo (撤销) of soft-delete calls apiRestore to keep server in sync', async () => {
    // Regression test: pre-ce0a087 the undo was local-only but harmless
    // because the soft-delete itself was also local-only. Now that the
    // soft-delete hits the API, a local-only undo would silently revert
    // on next hydration (server still has deletedAt set).
    const user = userEvent.setup();
    vi.mocked(softDelete).mockResolvedValue(makeApiAsset({
      name: 'undo-me.png',
      deletedAt: '2026-06-06T10:00:00.000Z',
    }));
    vi.mocked(restore).mockResolvedValue(makeApiAsset({
      name: 'undo-me.png',
      deletedAt: null,
    }));

    await mountAppWithAsset(makeApiAsset({ name: 'undo-me.png' }));
    await selectAsset(user, 'undo-me.png');

    // Trigger soft-delete (no confirm dialog for soft delete — confirm is
    // only for permanent delete).
    await user.click(screen.getByRole('button', { name: /移到回收站/ }));
    // Wait for the toast to appear.
    await screen.findByText('已移到回收站');
    // Click the toast's 撤销 action button.
    await user.click(screen.getByRole('button', { name: /^撤销$/ }));

    await waitFor(() => {
      expect(restore).toHaveBeenCalledWith('org-1', 'a1');
    });
  });
});
