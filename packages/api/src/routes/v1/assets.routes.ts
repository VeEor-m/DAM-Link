import type { App } from '../../types.js';
import {
  AssetListQuerySchema,
  CreateAssetInputSchema,
  FinalizeUploadInputSchema,
  UpdateAssetInputSchema,
} from '@dam-link/contracts';
import {
  listAssetsForOrg,
  getAsset,
  createDraftAsset,
  updateAssetMeta,
  softDelete,
  restore,
  permanentDelete,
  emptyTrashForOrg,
  getSidebarCounts,
  getDownloadUrl,
} from '../../services/assets.service.js';
import { finalizeUpload } from '../../services/uploads.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';

// JSON-schema response objects (Zod fails on Fastify response schema serialisation).
// See memory/gotchas.md.
const AssetTypeEnum = { type: 'string' as const, enum: ['image', 'video', 'document', 'audio'] };
const AssetStatusEnum = { type: 'string' as const, enum: ['pending', 'ready', 'failed'] };
const VisibilityEnum = { type: 'string' as const, enum: ['private', 'org', 'link'] };

const AssetJsonSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' },
    orgId: { type: 'string' as const, format: 'uuid' },
    name: { type: 'string' as const },
    type: AssetTypeEnum,
    format: { type: 'string' as const },
    size: { type: 'integer' as const, minimum: 0 },
    mimeType: { type: 'string' as const },
    uploadedAt: { type: 'string' as const, format: 'date-time' },
    uploadedBy: { type: 'string' as const, format: 'uuid' },
    tags: { type: 'array' as const, items: { type: 'string' as const } },
    favorite: { type: 'boolean' as const },
    deletedAt: { type: ['string', 'null'] as const, format: 'date-time' },
    width: { type: ['integer', 'null'] as const, minimum: 1 },
    height: { type: ['integer', 'null'] as const, minimum: 1 },
    duration: { type: ['number', 'null'] as const, minimum: 0 },
    objectKey: { type: 'string' as const },
    thumbnailKey: { type: ['string', 'null'] as const },
    status: AssetStatusEnum,
    visibility: VisibilityEnum,
  },
  required: [
    'id',
    'orgId',
    'name',
    'type',
    'format',
    'size',
    'mimeType',
    'uploadedAt',
    'uploadedBy',
    'tags',
    'favorite',
    'deletedAt',
    'objectKey',
    'status',
    'visibility',
  ],
} as const;

const AssetWithThumbnailJsonSchema = {
  ...AssetJsonSchema,
  properties: {
    ...AssetJsonSchema.properties,
    thumbnailUrl: { type: ['string', 'null'] as const, format: 'uri' },
  },
  required: [...AssetJsonSchema.required, 'thumbnailUrl'],
} as const;

const AssetListResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: {
        items: { type: 'array' as const, items: AssetWithThumbnailJsonSchema },
        nextCursor: { type: ['string', 'null'] as const },
      },
      required: ['items', 'nextCursor'],
    },
  },
  required: ['data'],
} as const;

const SidebarCountsJsonSchema = {
  type: 'object' as const,
  properties: {
    byType: {
      type: 'object' as const,
      properties: {
        image: { type: 'integer' as const, minimum: 0 },
        video: { type: 'integer' as const, minimum: 0 },
        document: { type: 'integer' as const, minimum: 0 },
        audio: { type: 'integer' as const, minimum: 0 },
      },
      required: ['image', 'video', 'document', 'audio'],
    },
    byTag: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          tag: { type: 'string' as const },
          count: { type: 'integer' as const, minimum: 0 },
        },
        required: ['tag', 'count'],
      },
    },
    favorites: { type: 'integer' as const, minimum: 0 },
    trash: { type: 'integer' as const, minimum: 0 },
  },
  required: ['byType', 'byTag', 'favorites', 'trash'],
} as const;

const SidebarCountsResponseSchema = {
  type: 'object' as const,
  properties: { data: SidebarCountsJsonSchema },
  required: ['data'],
} as const;

const GetAssetResponseSchema = {
  type: 'object' as const,
  properties: { data: AssetWithThumbnailJsonSchema },
  required: ['data'],
} as const;

const CreateOrUpdateAssetResponseSchema = {
  type: 'object' as const,
  properties: { data: AssetJsonSchema },
  required: ['data'],
} as const;

const EmptyTrashResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: { deletedCount: { type: 'integer' as const, minimum: 0 } },
      required: ['deletedCount'],
    },
  },
  required: ['data'],
} as const;

const NullResponseSchema = { type: 'null' as const };

const FinalizeResponseJsonSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const, format: 'uuid' },
        status: { type: 'string' as const, enum: ['ready'] },
      },
      required: ['id', 'status'],
    },
  },
  required: ['data'],
} as const;

export async function registerAssetRoutes(app: App): Promise<void> {
  // GET /api/v1/orgs/:orgId/assets — list with search, filter, sort, cursor pagination
  app.get(
    '/api/v1/orgs/:orgId/assets',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        querystring: AssetListQuerySchema,
        response: { 200: AssetListResponseSchema },
        tags: ['assets'],
        summary: 'List assets with search, filter, sort, and cursor pagination',
      },
    },
    async (req) => {
      const query = AssetListQuerySchema.parse(req.query);
      const result = await listAssetsForOrg(req.orgContext!.org.id, query);
      return { data: result };
    },
  );

  // GET /api/v1/orgs/:orgId/assets/sidebar-counts — registered BEFORE /:id
  app.get(
    '/api/v1/orgs/:orgId/assets/sidebar-counts',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: SidebarCountsResponseSchema },
        tags: ['assets'],
        summary: 'Counts for the sidebar (byType, byTag, favorites, trash)',
      },
    },
    async (req) => {
      const counts = await getSidebarCounts(req.orgContext!.org.id);
      return { data: counts };
    },
  );

  // GET /api/v1/orgs/:orgId/assets/:id
  app.get(
    '/api/v1/orgs/:orgId/assets/:id',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: GetAssetResponseSchema },
        tags: ['assets'],
        summary: 'Get a single asset',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const asset = await getAsset(req.orgContext!.org.id, id);
      return { data: asset };
    },
  );

  // GET /api/v1/orgs/:orgId/assets/:id/download-url — Viewer+
  app.get(
    '/api/v1/orgs/:orgId/assets/:id/download-url',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: {
          200: {
            type: 'object' as const,
            properties: {
              data: {
                type: 'object' as const,
                properties: {
                  downloadUrl: { type: 'string' as const, format: 'uri' },
                },
                required: ['downloadUrl'],
              },
            },
            required: ['data'],
          },
        },
        tags: ['assets'],
        summary: 'Get a presigned download URL for the asset (15-minute TTL)',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const result = await getDownloadUrl(req.orgContext!.org.id, id);
      return { data: result };
    },
  );

  // POST /api/v1/orgs/:orgId/assets — create draft (called by upload finalize in Plan 5)
  app.post(
    '/api/v1/orgs/:orgId/assets',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        body: CreateAssetInputSchema,
        response: { 200: CreateOrUpdateAssetResponseSchema },
        tags: ['assets'],
        summary: 'Create a draft asset (called by the upload finalize step)',
      },
    },
    async (req) => {
      const body = CreateAssetInputSchema.parse(req.body);
      const asset = await createDraftAsset(req.orgContext!.org.id, req.user!.id, body);
      return { data: asset };
    },
  );

  // PATCH /api/v1/orgs/:orgId/assets/:id — Editor+
  app.patch(
    '/api/v1/orgs/:orgId/assets/:id',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        body: UpdateAssetInputSchema,
        response: { 200: CreateOrUpdateAssetResponseSchema },
        tags: ['assets'],
        summary: 'Update asset metadata (rename, tags, favorite, visibility)',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = UpdateAssetInputSchema.parse(req.body);
      const asset = await updateAssetMeta(req.orgContext!.org.id, id, body);
      return { data: asset };
    },
  );

  // POST /api/v1/orgs/:orgId/assets/:id/soft-delete — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/soft-delete',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 200: CreateOrUpdateAssetResponseSchema },
        tags: ['assets'],
        summary: 'Move an asset to trash (soft delete)',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const asset = await softDelete(req.orgContext!.org.id, id);
      return { data: asset };
    },
  );

  // POST /api/v1/orgs/:orgId/assets/:id/finalize — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/finalize',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        body: FinalizeUploadInputSchema,
        response: { 200: FinalizeResponseJsonSchema },
        tags: ['assets'],
        summary: 'Finalize an upload: verifies the S3 object exists and transitions the asset to ready.',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = FinalizeUploadInputSchema.parse(req.body);
      const result = await finalizeUpload(req.orgContext!.org.id, id, body);
      return { data: result };
    },
  );

  // POST /api/v1/orgs/:orgId/assets/:id/restore — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/restore',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 200: CreateOrUpdateAssetResponseSchema },
        tags: ['assets'],
        summary: 'Restore a soft-deleted asset from trash',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const asset = await restore(req.orgContext!.org.id, id);
      return { data: asset };
    },
  );

  // DELETE /api/v1/orgs/:orgId/assets/:id — Editor+ permanent delete
  app.delete(
    '/api/v1/orgs/:orgId/assets/:id',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 204: NullResponseSchema },
        tags: ['assets'],
        summary: 'Permanently delete an asset',
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await permanentDelete(req.orgContext!.org.id, id);
      return reply.status(204).send();
    },
  );

  // POST /api/v1/orgs/:orgId/assets/empty-trash — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/empty-trash',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 200: EmptyTrashResponseSchema },
        tags: ['assets'],
        summary: 'Permanently delete every trashed asset in the org',
      },
    },
    async (req) => {
      const deletedCount = await emptyTrashForOrg(req.orgContext!.org.id);
      return { data: { deletedCount } };
    },
  );
}
