import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { observeSql } from '../db/observe.js';
import { shareLinks, type ShareLink, type NewShareLink } from '../db/schema.js';

export async function findShareLinkById(id: string): Promise<ShareLink | null> {
  return await observeSql('share-links.findShareLinkById', async () => {
    const db = getDb();
    const rows = await db.select().from(shareLinks).where(eq(shareLinks.id, id)).limit(1);
    return rows[0] ?? null;
  });
}

export async function findShareLinkByToken(token: string): Promise<ShareLink | null> {
  return await observeSql('share-links.findShareLinkByToken', async () => {
    const db = getDb();
    const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
    return rows[0] ?? null;
  });
}

export async function listShareLinksForAsset(assetId: string): Promise<ShareLink[]> {
  return await observeSql('share-links.listShareLinksForAsset', async () => {
    const db = getDb();
    return db.select().from(shareLinks).where(eq(shareLinks.assetId, assetId));
  });
}

export async function createShareLink(input: NewShareLink): Promise<ShareLink> {
  return await observeSql('share-links.createShareLink', async () => {
    const db = getDb();
    const [row] = await db.insert(shareLinks).values(input).returning();
    if (!row) throw new Error('createShareLink: insert returned no rows');
    return row;
  });
}

export async function revokeShareLink(id: string): Promise<void> {
  return await observeSql('share-links.revokeShareLink', async () => {
    const db = getDb();
    await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, id));
  });
}

export async function deleteShareLink(id: string): Promise<void> {
  return await observeSql('share-links.deleteShareLink', async () => {
    const db = getDb();
    await db.delete(shareLinks).where(eq(shareLinks.id, id));
  });
}
