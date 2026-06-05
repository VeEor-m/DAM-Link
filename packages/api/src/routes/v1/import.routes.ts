import type { App } from '../../types.js';
import multipart from '@fastify/multipart';
import { processImport, type ImportedFile } from '../../services/import.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';
import { AppError } from '../../plugins/error-handler.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // per thumbnail
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // per import call

// JSON-schema response objects (Zod fails on Fastify response schema serialisation).
// See memory/gotchas.md.
const ImportResultJsonSchema = {
  type: 'object' as const,
  properties: {
    imported: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          clientId: { type: 'string' as const },
          serverId: { type: 'string' as const, format: 'uuid' },
          name: { type: 'string' as const },
        },
        required: ['clientId', 'serverId', 'name'],
      },
    },
    skipped: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          clientId: { type: 'string' as const },
          reason: { type: 'string' as const },
        },
        required: ['clientId', 'reason'],
      },
    },
  },
  required: ['imported', 'skipped'],
} as const;

const ImportResultEnvelopeJsonSchema = {
  type: 'object' as const,
  properties: { data: ImportResultJsonSchema },
  required: ['data'],
} as const;

export async function registerImportRoutes(app: App): Promise<void> {
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1100 },
  });

  app.post(
    '/api/v1/orgs/:orgId/import',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 200: ImportResultEnvelopeJsonSchema },
        tags: ['import'],
        summary: 'Import assets from a localStorage export bundle (manifest.json + thumbnail files).',
        // Multipart routes cannot have a JSON body schema.
        consumes: ['multipart/form-data'],
      },
    },
    async (req) => {
      // Single-pass over the multipart stream. The manifest field and the
      // thumb_* file fields may arrive in any order, so we must not grab
      // the manifest with `req.file()` first.
      const files: ImportedFile[] = [];
      let manifestStr: string | null = null;
      let totalBytes = 0;

      for await (const part of req.parts()) {
        if (part.type === 'field' && part.fieldname === 'manifest') {
          // First wins; ignore duplicates (a client bug, but we still need
          // to drain the rest of the stream).
          if (manifestStr === null) {
            manifestStr = String(part.value);
            totalBytes += Buffer.byteLength(manifestStr, 'utf8');
            if (totalBytes > MAX_TOTAL_BYTES) {
              throw new AppError(413, 'IMPORT_TOO_LARGE', 'Total import size exceeds 50MB');
            }
          }
        } else if (part.type === 'file' && part.fieldname.startsWith('thumb_')) {
          const buf = await part.toBuffer();
          totalBytes += buf.length;
          if (totalBytes > MAX_TOTAL_BYTES) {
            throw new AppError(413, 'IMPORT_TOO_LARGE', 'Total import size exceeds 50MB');
          }
          files.push({
            fieldName: part.fieldname,
            filename: part.filename,
            mimeType: part.mimetype,
            buffer: buf,
          });
        }
      }

      if (manifestStr === null) {
        throw new AppError(400, 'MANIFEST_MISSING', 'multipart field "manifest" (JSON) is required');
      }
      let manifest: unknown;
      try {
        manifest = JSON.parse(manifestStr);
      } catch {
        throw new AppError(400, 'MANIFEST_INVALID_JSON', 'manifest field is not valid JSON');
      }

      const result = await processImport(req.orgContext!.org.id, req.user!.id, manifest, files);
      return { data: result };
    },
  );
}
