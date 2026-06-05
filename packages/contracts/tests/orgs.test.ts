import { describe, it, expect } from 'vitest';
import { IdSchema } from '../src/common.js';
import {
  OrgSchema,
  MembershipSchema,
  CreateOrgInputSchema,
  UpdateOrgInputSchema,
  InviteMemberInputSchema,
  UpdateMemberRoleInputSchema,
  OrgContextSchema,
  ListUserOrgsResponseSchema,
  AssetPageSchema,
} from '../src/orgs.js';

const validOrg = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Acme',
  slug: 'acme',
  createdAt: '2026-06-05T12:00:00.000Z',
};

describe('OrgSchema', () => {
  it('accepts a valid org', () => {
    expect(OrgSchema.parse(validOrg)).toEqual(validOrg);
  });

  it('rejects missing fields', () => {
    expect(() => OrgSchema.parse({ id: validOrg.id })).toThrow();
    expect(() => OrgSchema.parse({ ...validOrg, name: '' })).toThrow();
    expect(() => OrgSchema.parse({ ...validOrg, slug: '' })).toThrow();
  });
});

describe('MembershipSchema', () => {
  const validMembership = {
    userId: '11111111-1111-4111-8111-111111111111',
    orgId: '22222222-2222-4222-8222-222222222222',
    role: 'editor' as const,
    createdAt: '2026-06-05T12:00:00.000Z',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'alice@example.com',
      displayName: 'Alice',
    },
  };

  it('accepts a valid membership with joined user', () => {
    expect(MembershipSchema.parse(validMembership)).toEqual(validMembership);
  });

  it('rejects when joined user is missing', () => {
    const { user, ...withoutUser } = validMembership;
    expect(() => MembershipSchema.parse(withoutUser)).toThrow();
    void user;
  });

  it('rejects bad email in joined user', () => {
    expect(() =>
      MembershipSchema.parse({ ...validMembership, user: { ...validMembership.user, email: 'nope' } }),
    ).toThrow();
  });
});

describe('CreateOrgInputSchema', () => {
  it('accepts { name: "Foo" }', () => {
    expect(CreateOrgInputSchema.parse({ name: 'Foo' })).toEqual({ name: 'Foo' });
  });

  it('rejects {}', () => {
    expect(() => CreateOrgInputSchema.parse({})).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => CreateOrgInputSchema.parse({ name: '' })).toThrow();
  });
});

describe('UpdateOrgInputSchema', () => {
  it('accepts an empty body (no-op update)', () => {
    expect(UpdateOrgInputSchema.parse({})).toEqual({});
  });

  it('accepts a name', () => {
    expect(UpdateOrgInputSchema.parse({ name: 'New' })).toEqual({ name: 'New' });
  });
});

describe('InviteMemberInputSchema', () => {
  it('accepts editor role', () => {
    expect(
      InviteMemberInputSchema.parse({ email: 'bob@example.com', role: 'editor' }),
    ).toEqual({ email: 'bob@example.com', role: 'editor' });
  });

  it('accepts viewer role', () => {
    expect(
      InviteMemberInputSchema.parse({ email: 'bob@example.com', role: 'viewer' }),
    ).toEqual({ email: 'bob@example.com', role: 'viewer' });
  });

  it('rejects role: "owner" (invite cannot promote to owner)', () => {
    expect(() =>
      InviteMemberInputSchema.parse({ email: 'bob@example.com', role: 'owner' }),
    ).toThrow();
  });

  it('rejects bad email', () => {
    expect(() =>
      InviteMemberInputSchema.parse({ email: 'nope', role: 'editor' }),
    ).toThrow();
  });
});

describe('UpdateMemberRoleInputSchema', () => {
  it.each(['owner', 'editor', 'viewer'] as const)('accepts role: %s', (role) => {
    expect(UpdateMemberRoleInputSchema.parse({ role })).toEqual({ role });
  });

  it('rejects unknown role', () => {
    expect(() => UpdateMemberRoleInputSchema.parse({ role: 'admin' })).toThrow();
  });
});

describe('OrgContextSchema', () => {
  it('accepts a valid context', () => {
    const ctx = {
      org: validOrg,
      role: 'owner' as const,
      memberCount: 3,
      assetCount: 42,
    };
    expect(OrgContextSchema.parse(ctx)).toEqual(ctx);
  });

  it('requires memberCount and assetCount', () => {
    const { memberCount, ...withoutMemberCount } = {
      org: validOrg,
      role: 'owner' as const,
      memberCount: 1,
      assetCount: 0,
    };
    expect(() => OrgContextSchema.parse(withoutMemberCount)).toThrow();
    void memberCount;

    expect(() =>
      OrgContextSchema.parse({
        org: validOrg,
        role: 'owner',
        memberCount: 1,
      }),
    ).toThrow();
  });

  it('rejects negative counts', () => {
    expect(() =>
      OrgContextSchema.parse({
        org: validOrg,
        role: 'owner',
        memberCount: -1,
        assetCount: 0,
      }),
    ).toThrow();
  });
});

describe('ListUserOrgsResponseSchema', () => {
  it('parses an empty data array', () => {
    expect(ListUserOrgsResponseSchema.parse({ data: [] })).toEqual({ data: [] });
  });

  it('parses data with org+role pairs', () => {
    const payload = {
      data: [
        { org: validOrg, role: 'owner' as const },
        {
          org: { ...validOrg, id: '22222222-2222-4222-8222-222222222222', slug: 'beta' },
          role: 'editor' as const,
        },
      ],
    };
    expect(ListUserOrgsResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an unknown role in data', () => {
    expect(() =>
      ListUserOrgsResponseSchema.parse({ data: [{ org: validOrg, role: 'admin' }] }),
    ).toThrow();
  });
});

describe('AssetPageSchema (re-export from orgs)', () => {
  const StringAssetPage = AssetPageSchema(IdSchema);

  it('parses an empty asset page', () => {
    const parsed = StringAssetPage.parse({ items: [], nextCursor: null });
    expect(parsed.items).toEqual([]);
    expect(parsed.nextCursor).toBeNull();
  });
});
