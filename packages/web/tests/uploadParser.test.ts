import { describe, it, expect } from 'vitest';
import { parseFile, MAX_THUMB_DIM } from '../src/utils/uploadParser';

function makeImageFile(name = 'test.png', size = 100): File {
  // Create a small 4x4 PNG via a Uint8Array of known bytes
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  // pad to requested size
  const padded = new Uint8Array(Math.max(size, bytes.length));
  padded.set(bytes);
  return new File([padded], name, { type: 'image/png' });
}

function makeDocFile(): File {
  return new File([new Uint8Array(50)], 'notes.pdf', { type: 'application/pdf' });
}

describe('parseFile', () => {
  it('infers type from mime', async () => {
    const a = await parseFile(makeImageFile(), '我', new Date('2026-06-04'));
    expect(a.type).toBe('image');
    expect(a.format).toBe('PNG');
  });

  it('reads file size', async () => {
    const a = await parseFile(makeDocFile(), '我', new Date('2026-06-04'));
    expect(a.size).toBe(50);
  });

  it('uses the given uploader and date', async () => {
    const when = new Date('2026-06-04T00:00:00Z');
    const a = await parseFile(makeDocFile(), '张三', when);
    expect(a.uploadedBy).toBe('张三');
    expect(a.uploadedAt).toBe('2026-06-04T00:00:00.000Z');
  });

  it('starts with no tags, not favorited, not deleted', async () => {
    const a = await parseFile(makeDocFile(), '我', new Date());
    expect(a.tags).toEqual([]);
    expect(a.favorite).toBe(false);
    expect(a.deletedAt).toBeNull();
  });

  it('uppercases the format', async () => {
    const a = await parseFile(new File([new Uint8Array(10)], 'foo.JPG', { type: 'image/jpeg' }), '我', new Date());
    expect(a.format).toBe('JPG');
  });
});

describe('MAX_THUMB_DIM', () => {
  it('is exported', () => {
    expect(typeof MAX_THUMB_DIM).toBe('number');
  });
});
