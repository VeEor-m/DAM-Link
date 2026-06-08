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
  getPlaybackUrl: vi.fn(),
  emptyTrash: vi.fn(),
}));
vi.mock('../src/api/share-links.js', () => ({ createShareLink: vi.fn(), listShareLinks: vi.fn(), revokeShareLink: vi.fn() }));

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
  getDownloadUrl,
  getPlaybackUrl,
  emptyTrash,
} from '../src/api/assets.js';
import { ApiError } from '../src/api/client.js';
import { createShareLink } from '../src/api/share-links.js';
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
  // The Lightbox opens on card click (Plan 17). Default playback URL
  // succeeds so the MediaStage doesn't throw; individual tests that need
  // a specific behavior override this.
  vi.mocked(getPlaybackUrl).mockResolvedValue({ downloadUrl: 'https://cdn/full.png' });

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

/** Click the asset card to open the DetailPanel.
 *
 *  Since Plan 21, single-click only opens the DetailPanel — the Lightbox is
 *  now opened by double-click. So no floating-✕ close is needed here.
 */
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

  // ── Lightbox open / close / navigate (Task 20) ──────────────────────
  //
  // The reducer's OPEN/CLOSE/NAVIGATE cases are unit-tested in
  // `reducer.lightbox.test.ts` (Task 12). These 3 cases are integration
  // tests: they prove that App.tsx wires the card click → OPEN_LIGHTBOX,
  // the Escape key → CLOSE_LIGHTBOX, and a sidebar selection change →
  // CLOSE_LIGHTBOX. Assertions are on observable UI state (the Lightbox
  // dialog's presence in the DOM), not on dispatched actions — the file
  // doesn't have a dispatched-actions tracker.

  it('double-clicking a card opens the Lightbox dialog', async () => {
    const user = userEvent.setup();
    await mountAppWithAsset(makeApiAsset({ name: 'lightbox-open.png' }));

    expect(screen.queryByTestId('lightbox')).toBeNull();

    const card = screen.getByRole('button', { name: /lightbox-open\.png/i });
    await user.dblClick(card);

    expect(await screen.findByTestId('lightbox')).toBeInTheDocument();

    // Cleanup — close the lightbox so the test ends in a sane state.
    await user.click(screen.getByTestId('lightbox-floating-close'));
  });

  it('pressing Escape while the Lightbox is open closes it', async () => {
    const user = userEvent.setup();
    await mountAppWithAsset(makeApiAsset({ name: 'lightbox-esc.png' }));

    // Open the lightbox.
    const card = screen.getByRole('button', { name: /lightbox-esc\.png/i });
    await user.dblClick(card);
    await screen.findByTestId('lightbox');

    // The Lightbox auto-focuses its dialog (tabIndex={-1} + useEffect on
    // open, Lightbox.tsx:36-48) and attaches a window-level keydown
    // listener (Lightbox.tsx:51-77). useLightbox's onKeyDown maps Escape
    // to onClose → dispatch CLOSE_LIGHTBOX (useLightbox.ts:46).
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByTestId('lightbox')).toBeNull();
    });

    // The page didn't navigate — the asset card is still visible. Also
    // the floating ✕ is gone, which proves the lightbox actually
    // unmounted (not just re-rendered).
    expect(screen.getByText('lightbox-esc.png')).toBeInTheDocument();
    expect(screen.queryByTestId('lightbox-floating-close')).toBeNull();
  });

  it('changing the sidebar selection while the Lightbox is open closes it', async () => {
    const user = userEvent.setup();
    await mountAppWithAsset(makeApiAsset({ name: 'lightbox-nav.png' }));

    // Open the lightbox.
    const card = screen.getByRole('button', { name: /lightbox-nav\.png/i });
    await user.dblClick(card);
    await screen.findByTestId('lightbox');

    // Click the 图片 sidebar entry (Sidebar.tsx:104-110 — IconPhoto +
    // span with text "图片", aria-hidden icon so the accessible name is
    // exactly "图片"). Its onClick calls onSelect({ kind: 'type', type:
    // 'image' }), which updates state.ui.selection. The useEffect in
    // App.tsx:233-238 watches selection/searchQuery/filter and dispatches
    // CLOSE_LIGHTBOX whenever the visible list changes underneath the
    // open lightbox.
    await user.click(screen.getByRole('button', { name: /^图片$/ }));

    await waitFor(() => {
      expect(screen.queryByTestId('lightbox')).toBeNull();
    });
  });

  it('clicking a card does NOT open the Lightbox; it only selects the asset', async () => {
    const user = userEvent.setup();
    await mountAppWithAsset(makeApiAsset({ name: 'single-click.png' }));

    expect(screen.queryByTestId('lightbox')).toBeNull();

    const card = screen.getByRole('button', { name: /single-click\.png/i });
    await user.click(card);

    // Wait a tick to be sure no lightbox sneaks in.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('lightbox')).toBeNull();

    // The asset IS selected (DetailPanel renders the rename button).
    expect(screen.getByTitle('点击重命名')).toHaveTextContent('single-click.png');
  });

  // ── Lightbox is image/video only (audio/document → DetailPanel only)
  //
  // The Lightbox can only usefully preview image and video assets; for
  // audio/document it would show a broken/non-applicable preview. Clicking
  // those cards should SELECT_ASSET (open the DetailPanel) but NOT open
  // the Lightbox dialog.

  it('clicking an audio card opens the DetailPanel without opening the Lightbox', async () => {
    const user = userEvent.setup();
    const audio = makeApiAsset({
      id: 'a1',
      name: 'song.mp3',
      type: 'audio',
      format: 'MP3',
      mimeType: 'audio/mpeg',
    });
    await mountAppWithAsset(audio);

    // No lightbox in the DOM until a card is clicked.
    expect(screen.queryByTestId('lightbox')).toBeNull();

    // Click the audio card. The AssetCard has role="button" and
    // aria-label "${name}，${size}".
    const card = screen.getByRole('button', { name: /song\.mp3/i });
    await user.click(card);

    // Lightbox MUST NOT open for audio. Wait a tick to be sure.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('lightbox')).toBeNull();

    // DetailPanel IS showing the asset (rename button shows the name and
    // has title="点击重命名" when not in trash).
    expect(screen.getByTitle('点击重命名')).toHaveTextContent('song.mp3');
  });

  it('clicking a document card opens the DetailPanel without opening the Lightbox', async () => {
    const user = userEvent.setup();
    const doc = makeApiAsset({
      id: 'd1',
      name: 'spec.pdf',
      type: 'document',
      format: 'PDF',
      mimeType: 'application/pdf',
    });
    await mountAppWithAsset(doc);

    // No lightbox in the DOM until a card is clicked.
    expect(screen.queryByTestId('lightbox')).toBeNull();

    // Click the document card.
    const card = screen.getByRole('button', { name: /spec\.pdf/i });
    await user.click(card);

    // Lightbox MUST NOT open for documents.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('lightbox')).toBeNull();

    // DetailPanel IS showing the asset.
    expect(screen.getByTitle('点击重命名')).toHaveTextContent('spec.pdf');
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

describe('App — download handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('download fetches the presigned URL and triggers an <a download> click', async () => {
    const user = userEvent.setup();
    vi.mocked(getDownloadUrl).mockResolvedValue({ downloadUrl: 'https://cdn/x.png?sig=abc' });

    await mountAppWithAsset(makeApiAsset({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'pic.png',
    }));
    await selectAsset(user, 'pic.png');

    // Spy on the createElement('a') click. Set up AFTER mount so the spy
    // only intercepts calls made by the download flow (not by anything
    // the app may have created during initial render).
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') (el as HTMLAnchorElement).click = clickSpy;
      return el;
    });

    await user.click(screen.getByRole('button', { name: /^下载$/ }));
    await waitFor(() => {
      expect(getDownloadUrl).toHaveBeenCalledWith('org-1', '11111111-1111-4111-8111-111111111111');
    });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('download shows error toast when getDownloadUrl fails', async () => {
    const user = userEvent.setup();
    vi.mocked(getDownloadUrl).mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));

    await mountAppWithAsset(makeApiAsset({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'pic.png',
    }));
    await selectAsset(user, 'pic.png');

    await user.click(screen.getByRole('button', { name: /^下载$/ }));
    await waitFor(() => {
      expect(screen.getByText('下载失败')).toBeInTheDocument();
    });
  });
});

describe('App — copy link handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a share link and copies the public URL to clipboard', async () => {
    const user = userEvent.setup();
    // Mock clipboard (navigator.clipboard is not in jsdom; property is a getter
    // so we have to redefine it).
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    vi.mocked(createShareLink).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      assetId: '11111111-1111-4111-8111-111111111111',
      orgId: 'org-1',
      token: 'tok1234567890abcdef',
      createdBy: 'u1',
      createdAt: '2026-06-06T00:00:00.000Z',
      expiresAt: null,
      revokedAt: null,
      hasPassword: false,
    });

    await mountAppWithAsset(makeApiAsset({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'pic.png',
    }));
    // Select the asset so DetailPanel renders
    await selectAsset(user, 'pic.png');

    await user.click(screen.getByRole('button', { name: /复制链接/ }));
    await waitFor(() => {
      expect(createShareLink).toHaveBeenCalledWith('org-1', '11111111-1111-4111-8111-111111111111', {});
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/api/v1/share/tok1234567890abcdef'));
    expect(screen.getByText('链接已复制')).toBeInTheDocument();
  });

  it('shows error toast when share-link creation fails', async () => {
    const user = userEvent.setup();
    vi.mocked(createShareLink).mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));

    await mountAppWithAsset(makeApiAsset({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'pic.png',
    }));
    await selectAsset(user, 'pic.png');

    await user.click(screen.getByRole('button', { name: /复制链接/ }));
    await waitFor(() => {
      expect(screen.getByText('复制失败')).toBeInTheDocument();
    });
  });
});

describe('App — handleEmptyTrash', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiEmptyTrash after the user confirms', async () => {
    const user = userEvent.setup();
    const asset = makeApiAsset({ id: 'a1', name: 'old.png' });
    await mountAppWithAsset(asset);

    // Click the sidebar 回收站 entry (rendered as "回收站 N" where N is the
    // trash count). The empty-trash button only appears once selection is
    // smart:trash.
    await user.click(screen.getByRole('button', { name: /^回收站 \d+$/ }));
    // Trigger the action: this opens the confirm dialog.
    await user.click(screen.getByRole('button', { name: /^清空回收站$/ }));
    // Confirm dialog: click the confirm button (label is the confirmLabel
    // from handleEmptyTrash, "清空").
    await user.click(screen.getByRole('button', { name: /^清空$/ }));

    await waitFor(() => {
      expect(vi.mocked(emptyTrash)).toHaveBeenCalledWith('org-1');
    });
  });

  it('does NOT call apiEmptyTrash when the user cancels', async () => {
    const user = userEvent.setup();
    const asset = makeApiAsset({ id: 'a1', name: 'old.png' });
    await mountAppWithAsset(asset);

    await user.click(screen.getByRole('button', { name: /^回收站 \d+$/ }));
    await user.click(screen.getByRole('button', { name: /^清空回收站$/ }));
    await user.click(screen.getByRole('button', { name: /^取消$/ }));

    // Wait a tick to make sure no API call sneaks in.
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(emptyTrash)).not.toHaveBeenCalled();
  });
});

describe('App — sidebar counts from state.ui.sidebarCounts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('displays the server-provided counts in the sidebar', async () => {
    const asset = makeApiAsset({ id: 'a1', name: 'a.png' });
    // Override the default zero counts.
    vi.mocked(me).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c', displayName: 'A', createdAt: '2026-06-06T00:00:00.000Z' },
      orgs: [],
    });
    vi.mocked(listMyOrgs).mockResolvedValue([
      { org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-06T00:00:00.000Z' }, role: 'owner' },
    ]);
    vi.mocked(listAssets).mockResolvedValue({ items: [asset], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({
      byType: { image: 7, video: 2, document: 0, audio: 0 },
      byTag: [],
      favorites: 1,
      trash: 5,
    });

    render(
      <StoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StoreProvider>,
    );
    await screen.findByText('a.png');

    // 回收站 sidebar count should be 5 (from sidebarCounts mock).
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});
