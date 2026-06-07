import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const assetTypeEnum = pgEnum('asset_type', [
  'image',
  'video',
  'document',
  'audio',
]);
export const roleEnum = pgEnum('role', ['owner', 'editor', 'viewer']);
export const visibilityEnum = pgEnum('visibility', [
  'private',
  'org',
  'link',
]);
export const assetStatusEnum = pgEnum('asset_status', [
  'pending',
  'ready',
  'failed',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // 32 random bytes, base64url
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
  }),
);

export const orgs = pgTable(
  'orgs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('orgs_slug_unique').on(t.slug),
  }),
);

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.orgId] }),
    orgIdx: index('memberships_org_idx').on(t.orgId),
  }),
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: assetTypeEnum('type').notNull(),
    format: text('format').notNull(),
    size: integer('size').notNull(),
    mimeType: text('mime_type').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    favorite: boolean('favorite').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    width: integer('width'),
    height: integer('height'),
    duration: integer('duration'),

    objectKey: text('object_key').notNull(),
    thumbnailKey: text('thumbnail_key'),
    posterKey: text('poster_key'),
    status: assetStatusEnum('status').notNull().default('pending'),
    visibility: visibilityEnum('visibility').notNull().default('org'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => ({
    orgDeletedIdx: index('assets_org_deleted_idx').on(t.orgId, t.deletedAt),
    orgTypeIdx: index('assets_org_type_idx').on(t.orgId, t.type),
    orgFormatIdx: index('assets_org_format_idx').on(t.orgId, t.format),
    orgUploadedAtIdx: index('assets_org_uploaded_at_idx').on(
      t.orgId,
      t.uploadedAt,
    ),
    orgUploaderIdx: index('assets_org_uploader_idx').on(
      t.orgId,
      t.uploadedBy,
    ),
    // GIN trigram + tags indexes are added in a follow-up migration
    // (see Task 8) because they require the pg_trgm extension and
    // a separate raw SQL migration.
  }),
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
  },
  (t) => ({
    tokenUnique: uniqueIndex('share_links_token_unique').on(t.token),
    assetIdx: index('share_links_asset_idx').on(t.assetId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
