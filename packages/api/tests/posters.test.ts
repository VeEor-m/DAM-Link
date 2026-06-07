import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';
import { s3, BUCKET } from '../src/lib/s3.js';
import { generatePosterForAsset, posterKeyFor } from '../src/services/posters.service.js';
import { getAsset } from '../src/services/assets.service.js';
import { insertAsset, findAssetById } from '../src/repositories/assets.repo.js';
import { isFfmpegAvailable } from '../src/lib/ffmpeg.js';

const COOKIE = 'dam_session_test';
const execFileP = promisify(execFile);

async function makeSampleVideo(dir: string): Promise<string> {
  const out = path.join(dir, 'sample.mp4');
  await execFileP('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out,
  ], { timeout: 30_000 });
  return out;
}

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { email, password: 'hunter2pass', displayName: email },
  });
  if (res.statusCode !== 200) throw new Error(`register failed: ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  return raw.match(new RegExp(`${COOKIE}=([^;]+)`))![1]!;
}

async function getUserId(app: FastifyInstance, session: string): Promise<string> {
  const res = await app.inject({
    method: 'GET', url: '/api/v1/auth/me',
    headers: { cookie: `${COOKIE}=${session}` },
  });
  if (res.statusCode !== 200) throw new Error(`me failed: ${res.body}`);
  return res.json().data.user.id;
}

async function createOrgViaApi(
  app: FastifyInstance,
  session: string,
  name: string,
): Promise<{ orgId: string; userId: string }> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/orgs',
    headers: { cookie: `${COOKIE}=${session}` },
    payload: { name },
  });
  if (res.statusCode !== 200) {
    throw new Error(`createOrg failed: ${res.statusCode} ${res.body}`);
  }
  const userId = await getUserId(app, session);
  return { orgId: res.json().data.org.id, userId };
}

async function uploadToS3(key: string, body: Buffer): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: body, ContentType: 'video/mp4',
  }));
}

let app: FastifyInstance;
let videoPath: string | undefined;
let videoDir: string | undefined;
let ffmpegOk = false;

beforeAll(async () => {
  // The regenerate-poster route is already registered by the server
  // (registerAssetRoutes → postersRoutes) with the editor+ preHandler
  // chain. The test helper's buildApp() finalizes with app.ready()
  // so the route is reachable via app.inject.
  app = await buildApp();
  ffmpegOk = await isFfmpegAvailable();
  if (ffmpegOk) {
    videoDir = await mkdir(
      `${os.tmpdir()}/posters-test-${Date.now()}-${Math.random()}`,
      { recursive: true },
    );
    videoPath = await makeSampleVideo(videoDir);
  } else {
    console.warn('ffmpeg not available — video poster tests will be skipped');
  }
}, 60_000);

afterAll(async () => {
  if (videoDir) await rm(videoDir, { recursive: true, force: true });
  await app.close();
  await closeDb();
  await closeS3();
});

beforeEach(async () => {
  await truncateAllTables();
  await flushTestBucket();
});

describe('generatePosterForAsset', () => {
  it.skipIf(!ffmpegOk)('writes a poster to S3 and updates assets.posterKey', async () => {
    const session = await login(app, 'p@p.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'P');
    const asset = await insertAsset({
      orgId,
      uploadedBy: userId,
      name: 'v.mp4',
      type: 'video',
      format: 'MP4',
      mimeType: 'video/mp4',
      size: 1024,
      objectKey: `originals/${orgId}/v.mp4`,
      width: 320,
      height: 240,
      status: 'ready',
      tags: [],
      favorite: false,
    });
    const videoBytes = await readFile(videoPath!);
    await uploadToS3(asset.objectKey, videoBytes);

    await generatePosterForAsset(asset);

    const fresh = await findAssetById(orgId, asset.id);
    expect(fresh?.posterKey).toBe(posterKeyFor(orgId, asset.id));
    // The poster object exists in S3.
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: fresh!.posterKey! }),
    );
    expect(head.ContentLength).toBeGreaterThan(0);
  }, 60_000);
});

describe('getAsset (poster URL behavior)', () => {
  it('returns a presigned posterUrl when posterKey is set', async () => {
    const session = await login(app, 'p@p.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'P');
    const asset = await insertAsset({
      orgId,
      uploadedBy: userId,
      name: 'i.png',
      type: 'image',
      format: 'PNG',
      mimeType: 'image/png',
      size: 100,
      objectKey: `originals/${orgId}/i.png`,
      status: 'ready',
      posterKey: 'previews/x/y-poster.jpg',
      tags: [],
      favorite: false,
    });
    const out = await getAsset(orgId, asset.id);
    expect(out.posterUrl).toMatch(/^https?:\/\//);
  });

  it('returns null for audio assets with no posterKey', async () => {
    const session = await login(app, 'p@p.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'P');
    const asset = await insertAsset({
      orgId,
      uploadedBy: userId,
      name: 'a.mp3',
      type: 'audio',
      format: 'MP3',
      mimeType: 'audio/mpeg',
      size: 100,
      objectKey: `originals/${orgId}/a.mp3`,
      status: 'ready',
      tags: [],
      favorite: false,
    });
    const out = await getAsset(orgId, asset.id);
    expect(out.posterUrl).toBeNull();
  });

  it('re-uses thumbnailUrl for image assets with no posterKey', async () => {
    const session = await login(app, 'p@p.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'P');
    const asset = await insertAsset({
      orgId,
      uploadedBy: userId,
      name: 'i.png',
      type: 'image',
      format: 'PNG',
      mimeType: 'image/png',
      size: 100,
      objectKey: `originals/${orgId}/i.png`,
      status: 'ready',
      thumbnailKey: 'thumbnails/x/y.webp',
      tags: [],
      favorite: false,
    });
    const out = await getAsset(orgId, asset.id);
    expect(out.posterUrl).toBe(out.thumbnailUrl);
  });
});

describe('regeneratePosterHandler', () => {
  it.skipIf(!ffmpegOk)('returns the asset with the new posterUrl on success', async () => {
    const session = await login(app, 'p@p.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'P');
    const asset = await insertAsset({
      orgId,
      uploadedBy: userId,
      name: 'v.mp4',
      type: 'video',
      format: 'MP4',
      mimeType: 'video/mp4',
      size: 1024,
      objectKey: `originals/${orgId}/v.mp4`,
      status: 'ready',
      width: 320,
      height: 240,
      tags: [],
      favorite: false,
    });
    const videoBytes = await readFile(videoPath!);
    await uploadToS3(asset.objectKey, videoBytes);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/assets/${asset.id}/regenerate-poster`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.posterUrl).toMatch(/^https?:\/\//);
    expect(body.data.id).toBe(asset.id);
  }, 60_000);

  it('returns 400 NOT_A_VIDEO for non-video assets', async () => {
    const session = await login(app, 'p@p.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'P');
    const asset = await insertAsset({
      orgId,
      uploadedBy: userId,
      name: 'i.png',
      type: 'image',
      format: 'PNG',
      mimeType: 'image/png',
      size: 100,
      objectKey: `originals/${orgId}/i.png`,
      status: 'ready',
      tags: [],
      favorite: false,
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/assets/${asset.id}/regenerate-poster`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('NOT_A_VIDEO');
  });
});
