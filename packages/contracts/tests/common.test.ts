import { describe, it, expect } from 'vitest';
import {
  IdSchema,
  RoleSchema,
  AssetTypeSchema,
  VisibilitySchema,
  PageSchema,
  ErrorBodySchema,
  SidebarSelectionSchema,
  PaginationInputSchema,
} from '../src/common.js';

describe('IdSchema', () => {
  it('accepts a uuid', () => {
    expect(IdSchema.parse('11111111-1111-4111-8111-111111111111')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('rejects non-uuid', () => {
    expect(() => IdSchema.parse('not-a-uuid')).toThrow();
  });
});

describe('RoleSchema', () => {
  it('accepts the three roles', () => {
    expect(RoleSchema.parse('owner')).toBe('owner');
    expect(RoleSchema.parse('editor')).toBe('editor');
    expect(RoleSchema.parse('viewer')).toBe('viewer');
  });

  it('rejects unknown roles', () => {
    expect(() => RoleSchema.parse('admin')).toThrow();
  });
});

describe('AssetTypeSchema', () => {
  it.each(['image', 'video', 'document', 'audio'] as const)('accepts %s', (v) => {
    expect(AssetTypeSchema.parse(v)).toBe(v);
  });
});

describe('VisibilitySchema', () => {
  it('accepts the three visibilities', () => {
    expect(VisibilitySchema.parse('private')).toBe('private');
    expect(VisibilitySchema.parse('org')).toBe('org');
    expect(VisibilitySchema.parse('link')).toBe('link');
  });
});

describe('PageSchema', () => {
  const StringPage = PageSchema(IdSchema);
  it('parses an empty page', () => {
    const parsed = StringPage.parse({ items: [], nextCursor: null });
    expect(parsed.items).toEqual([]);
    expect(parsed.nextCursor).toBeNull();
  });

  it('parses a page with items', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const parsed = StringPage.parse({ items: [id], nextCursor: 'abc' });
    expect(parsed.items).toEqual([id]);
    expect(parsed.nextCursor).toBe('abc');
  });
});

describe('ErrorBodySchema', () => {
  it('parses a standard error body', () => {
    const body = {
      error: { code: 'NOT_FOUND', message: 'Asset not found' },
    };
    expect(ErrorBodySchema.parse(body)).toEqual(body);
  });

  it('accepts details', () => {
    const body = {
      error: { code: 'VALIDATION', message: 'bad', details: { field: 'name' } },
    };
    expect(ErrorBodySchema.parse(body).error.details).toEqual({ field: 'name' });
  });
});

describe('SidebarSelectionSchema', () => {
  it('parses kind=all', () => {
    expect(SidebarSelectionSchema.parse({ kind: 'all' })).toEqual({
      kind: 'all',
    });
  });

  it('parses kind=type', () => {
    expect(SidebarSelectionSchema.parse({ kind: 'type', type: 'image' })).toEqual({
      kind: 'type',
      type: 'image',
    });
  });

  it('rejects kind=type with invalid type', () => {
    expect(() =>
      SidebarSelectionSchema.parse({ kind: 'type', type: 'spreadsheet' }),
    ).toThrow();
  });

  it('parses kind=smart', () => {
    expect(
      SidebarSelectionSchema.parse({ kind: 'smart', smart: 'favorites' }),
    ).toEqual({ kind: 'smart', smart: 'favorites' });
  });
});

describe('PaginationInputSchema', () => {
  it('defaults limit to 50', () => {
    const parsed = PaginationInputSchema.parse({});
    expect(parsed.limit).toBe(50);
  });

  it('clamps limit to 200', () => {
    expect(() => PaginationInputSchema.parse({ limit: 1000 })).toThrow();
  });
});
