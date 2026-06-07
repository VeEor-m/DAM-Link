import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../src/api/orgs.js', () => ({
  listMyOrgs: vi.fn(),
  createOrg: vi.fn(),
}));
vi.mock('../src/api/assets.js', () => ({
  getAsset: vi.fn(),
}));
vi.mock('../src/api/uploads.js', () => ({
  initiateUpload: vi.fn(),
  directPut: vi.fn(),
  finalizeUpload: vi.fn(),
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

import { UploadDialog } from '../src/components/upload/UploadDialog';
import { StoreProvider } from '../src/state/store';
import { ToastProvider } from '../src/components/common/ToastProvider';
import { listMyOrgs } from '../src/api/orgs.js';
import { getAsset } from '../src/api/assets.js';
import { initiateUpload, directPut, finalizeUpload } from '../src/api/uploads.js';
import { useStore } from '../src/hooks/useStore';

const freshAsset = {
  id: 'srv-1',
  orgId: 'org-1',
  name: 'hello.png',
  type: 'image' as const,
  format: 'PNG',
  size: 1024,
  mimeType: 'image/png',
  uploadedAt: '2026-06-07T08:00:00.000Z',
  uploadedBy: 'u1',
  tags: [],
  favorite: false,
  deletedAt: null,
  width: 800,
  height: 600,
  duration: null,
  objectKey: 'originals/org-1/srv-1',
  thumbnailKey: null,
  thumbnailUrl: 'https://cdn/hello.png?sig=abc',
  status: 'ready' as const,
  visibility: 'private' as const,
};

function GridConsumer({ testId = 'grid' }: { testId?: string }) {
  const { state } = useStore();
  return <ul data-testid={testId}>{state.assets.map((a) => <li key={a.id}>{a.name}</li>)}</ul>;
}

// Build a FileList-like with .item() method (jsdom's FileList is a plain array,
// which causes userEvent.upload to crash with "_input_files.item is not a function").
function makeFileList(file: File): FileList {
  const arr = [file];
  return Object.assign(arr, {
    item: (i: number) => arr[i] ?? null,
    length: arr.length,
  }) as unknown as FileList;
}

function dispatchFileChange(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: makeFileList(file), configurable: true });
  fireEvent.change(input);
}

describe('<UploadDialog> — ADD_ASSET after upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the full asset and the new card appears in the grid without a page reload', async () => {
    vi.mocked(listMyOrgs).mockResolvedValue([
      {
        org: {
          id: 'org-1',
          name: 'O',
          slug: 'o',
          createdAt: '2026-06-07T00:00:00.000Z',
        },
        role: 'owner',
      },
    ]);
    vi.mocked(initiateUpload).mockResolvedValue({
      assetId: 'srv-1',
      uploadUrl: 'https://s3/put',
      objectKey: 'originals/org-1/srv-1',
      expiresInSec: 300,
    });
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockResolvedValue({ id: 'srv-1', status: 'ready' });
    vi.mocked(getAsset).mockResolvedValue(freshAsset);

    render(
      <StoreProvider>
        <ToastProvider>
          <UploadDialog open onClose={() => {}} />
          <GridConsumer />
        </ToastProvider>
      </StoreProvider>,
    );

    // Wait for the body to render the DropZone.
    await waitFor(() => {
      expect(screen.getByText(/拖拽文件到此处/)).toBeInTheDocument();
    });

    // The grid is initially empty.
    expect(screen.getByTestId('grid').children.length).toBe(0);

    // Trigger file input change with a synthetic file.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    // Sanity-check: the input must be inside a zone (i.e. DropZone is mounted).
    expect(fileInput.closest('div')).toBeTruthy();
    dispatchFileChange(fileInput, file);

    // Wait for getAsset to be called with the server id.
    await waitFor(() => {
      expect(getAsset).toHaveBeenCalledWith('org-1', 'srv-1');
    });

    // Wait for the new card to appear in the grid (no reload).
    await waitFor(() => {
      expect(screen.getByTestId('grid')).toHaveTextContent('hello.png');
    });
    expect(screen.getByTestId('grid').children.length).toBe(1);
  });

  it('shows an error toast when getAsset fails (upload still succeeded on the server)', async () => {
    vi.mocked(listMyOrgs).mockResolvedValue([
      {
        org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-07T00:00:00.000Z' },
        role: 'owner',
      },
    ]);
    vi.mocked(initiateUpload).mockResolvedValue({
      assetId: 'srv-2',
      uploadUrl: 'https://s3/put',
      objectKey: 'k',
      expiresInSec: 300,
    });
    vi.mocked(directPut).mockResolvedValue(undefined);
    vi.mocked(finalizeUpload).mockResolvedValue({ id: 'srv-2', status: 'ready' });
    vi.mocked(getAsset).mockRejectedValue(new Error('500 boom'));

    render(
      <StoreProvider>
        <ToastProvider>
          <UploadDialog open onClose={() => {}} />
          <GridConsumer />
        </ToastProvider>
      </StoreProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/拖拽文件到此处/)).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    dispatchFileChange(fileInput, file);

    await waitFor(() => {
      expect(getAsset).toHaveBeenCalled();
    });

    // Error toast appears.
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/未能自动刷新/);
    });

    // Grid is still empty (caller couldn't fetch the full asset).
    expect(screen.getByTestId('grid').children.length).toBe(0);
  });
});
