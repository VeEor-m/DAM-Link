import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';
import { buildApp } from './helpers/build-app.js';
import { createUser } from '../src/repositories/users.repo.js';
import { createOrg } from '../src/repositories/orgs.repo.js';
import { createMembership } from '../src/repositories/memberships.repo.js';
import { insertAsset, updateAsset } from '../src/repositories/assets.repo.js';
import { listAssetsForOrg, getAsset } from '../src/services/assets.service.js';

let app: FastifyInstance;
let orgId: string;
let userId: string;

beforeAll(async () => {
  app = await buildApp();
}, 30_000);

afterAll(async () => {
  await app.close();
  await closeDb();
  await closeS3();
});

beforeEach(async () => {
  await truncateAllTables();
  await flushTestBucket();
  const user = await createUser({ email: 'a@a.com', passwordHash: 'x', displayName: 'A' });
  userId = user.id;
  const org = await createOrg({ name: 'A', slug: `a-${Date.now()}` });
  orgId = org.id;
  await createMembership({ userId, orgId, role: 'editor' });
});

describe('Asset responses include posterUrl', () => {
  it('listAssetsForOrg returns posterUrl=null for assets with no posterKey', async () => {
    await insertAsset({
      orgId,
      uploadedBy: userId,
      name: 'a.png',
      type: 'image',
      format: 'PNG',
      mimeType: 'image/png',
      size: 1,
      objectKey: 'k',
      status: 'ready',
      tags: [],
      favorite: false,
    });
    const { items } = await listAssetsForOrg(orgId, {});
    expect(items[0]!.posterUrl).toBeNull();
  });

  it('getAsset returns posterUrl=<presigned> when posterKey is set', async () => {
    const a = await insertAsset({
      orgId,
      uploadedBy: userId,
      name: 'v.mp4',
      type: 'video',
      format: 'MP4',
      mimeType: 'video/mp4',
      size: 1,
      objectKey: 'k',
      status: 'ready',
      tags: [],
      favorite: false,
    });
    await updateAsset(orgId, a.id, { posterKey: 'previews/x/y-poster.jpg' });
    const out = await getAsset(orgId, a.id);
    expect(out.posterUrl).toMatch(/^https?:\/\//);
  });
});
