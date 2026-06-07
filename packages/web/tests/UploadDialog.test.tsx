import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadDialog } from '../src/components/upload/UploadDialog';
import { StoreProvider } from '../src/state/store';
import { ToastProvider } from '../src/components/common/ToastProvider';

// Mock the orgs API before importing the component (LoginScreen.test pattern).
vi.mock('../src/api/orgs.js', () => ({
  listMyOrgs: vi.fn(),
  createOrg: vi.fn(),
}));

// Stub out useUpload's transitive deps so the body doesn't try to network.
vi.mock('../src/hooks/useUpload.js', () => ({
  useUpload: () => ({ items: [], uploadMany: vi.fn() }),
}));

// Mock persistence so StoreProvider's loadState() doesn't try to hit the
// real network. We only need a non-null state so the dialog body mounts.
vi.mock('../src/state/persistence.js', () => ({
  loadState: vi.fn(async () => ({
    assets: [],
    ui: {
      searchQuery: '',
      selection: { kind: 'all' },
      viewMode: 'grid',
      selectedAssetId: null,
      filterPanelOpen: false,
      uploadDialogOpen: false,
      filter: { typeFilter: [], formatFilter: [], sizeBucket: null, dateBucket: 'all', uploaderFilter: [] },
      selectedIds: [],
      sortKey: 'date',
      sortDir: 'desc',
      activeOrgId: 'org-1',
    },
  })),
  saveState: vi.fn(),
}));

import { listMyOrgs, createOrg } from '../src/api/orgs.js';

describe('UploadDialog — empty orgs (regression: stuck on "正在准备…")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty-state with a create-org CTA when the user has no orgs', async () => {
    vi.mocked(listMyOrgs).mockResolvedValue([]);

    render(
      <StoreProvider>
        <ToastProvider>
          <UploadDialog open onClose={() => {}} />
        </ToastProvider>
      </StoreProvider>,
    );

    // Wait for the fetch to settle. The bug: this never resolves with a
    // useful UI — the dialog was stuck on "正在准备…" forever.
    await waitFor(() => {
      expect(listMyOrgs).toHaveBeenCalled();
    });

    // The old "正在准备…" string is gone.
    expect(screen.queryByText(/正在准备/)).not.toBeInTheDocument();

    // A heading explaining the situation is present.
    expect(screen.getByRole('heading', { name: /需要先创建组织/ })).toBeInTheDocument();

    // A name input + a create button.
    expect(screen.getByLabelText(/组织名称/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /创建/ })).toBeInTheDocument();
  });

  it('after creating an org, renders the upload body (DropZone)', async () => {
    vi.mocked(listMyOrgs).mockResolvedValue([]);
    vi.mocked(createOrg).mockResolvedValue({
      org: {
        id: 'org-123',
        name: 'My Library',
        slug: 'my-library',
        createdAt: '2026-06-06T10:00:00.000Z',
      },
      role: 'owner',
    });

    const user = userEvent.setup();
    render(
      <StoreProvider>
        <ToastProvider>
          <UploadDialog open onClose={() => {}} />
        </ToastProvider>
      </StoreProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/组织名称/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/组织名称/), 'My Library');
    await user.click(screen.getByRole('button', { name: /创建/ }));

    // The body now renders — the no-orgs CTA is gone.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /需要先创建组织/ })).not.toBeInTheDocument();
    });
    expect(createOrg).toHaveBeenCalledWith({ name: 'My Library' });
  });
});
