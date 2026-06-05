import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_SIZE_BYTES,
  MimeTypeSchema,
  InitiateUploadInputSchema,
  InitiateUploadResponseSchema,
  FinalizeUploadInputSchema,
} from '../src/uploads.js';

const validInitiateInput = {
  filename: 'sunset.jpg',
  mimeType: 'image/jpeg',
  size: 102400,
  type: 'image' as const,
  format: 'jpg',
};

describe('MAX_FILE_SIZE_BYTES', () => {
  it('equals 5 * 1024 * 1024 * 1024 (~5GB)', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024 * 1024);
  });
});

describe('MimeTypeSchema', () => {
  it.each(['image/png', 'video/mp4', 'application/pdf', 'text/plain'] as const)(
    'accepts allowed mime type: %s',
    (mimeType) => {
      expect(MimeTypeSchema.parse(mimeType)).toBe(mimeType);
    },
  );

  it('rejects mime types not in the allow-list', () => {
    expect(() => MimeTypeSchema.parse('application/x-msdownload')).toThrow();
    expect(() => MimeTypeSchema.parse('text/html')).toThrow();
  });
});

describe('InitiateUploadInputSchema', () => {
  it('accepts a valid input', () => {
    expect(InitiateUploadInputSchema.parse(validInitiateInput)).toEqual(validInitiateInput);
  });

  it('rejects size greater than MAX_FILE_SIZE_BYTES', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, size: MAX_FILE_SIZE_BYTES + 1 }),
    ).toThrow();
  });

  it('rejects size = 0', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, size: 0 }),
    ).toThrow();
  });

  it('rejects mimeType not in the allow-list', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, mimeType: 'application/x-msdownload' }),
    ).toThrow();
  });

  it('rejects unknown asset type', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, type: 'spreadsheet' }),
    ).toThrow();
  });

  it('rejects empty filename', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, filename: '' }),
    ).toThrow();
  });

  it('rejects filename longer than 255 chars', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, filename: 'a'.repeat(256) }),
    ).toThrow();
  });

  it('accepts size at the MAX_FILE_SIZE_BYTES cap', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, size: MAX_FILE_SIZE_BYTES }),
    ).not.toThrow();
  });

  it('rejects empty format', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, format: '' }),
    ).toThrow();
  });

  it('rejects format longer than 16 chars', () => {
    expect(() =>
      InitiateUploadInputSchema.parse({ ...validInitiateInput, format: 'a'.repeat(17) }),
    ).toThrow();
  });
});

describe('InitiateUploadResponseSchema', () => {
  const validResponse = {
    assetId: '11111111-1111-4111-8111-111111111111',
    uploadUrl: 'https://minio.example.com/bucket/originals/org/asset/file.jpg?X-Amz-Signature=abc',
    objectKey: 'originals/22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111/sunset.jpg',
    expiresInSec: 300,
  };

  it('accepts a valid response', () => {
    expect(InitiateUploadResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('rejects non-URL uploadUrl', () => {
    expect(() =>
      InitiateUploadResponseSchema.parse({ ...validResponse, uploadUrl: 'not-a-url' }),
    ).toThrow();
  });
});

describe('FinalizeUploadInputSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(FinalizeUploadInputSchema.parse({})).toEqual({});
  });

  it('accepts width, height, and duration', () => {
    const input = { width: 1920, height: 1080, duration: 12.5 };
    expect(FinalizeUploadInputSchema.parse(input)).toEqual(input);
  });

  it('rejects negative width', () => {
    expect(() => FinalizeUploadInputSchema.parse({ width: -1 })).toThrow();
  });

  it('rejects negative height', () => {
    expect(() => FinalizeUploadInputSchema.parse({ height: -1 })).toThrow();
  });

  it('rejects negative duration', () => {
    expect(() => FinalizeUploadInputSchema.parse({ duration: -1 })).toThrow();
  });
});
