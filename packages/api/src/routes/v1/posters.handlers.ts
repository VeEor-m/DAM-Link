import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { findAssetById } from '../../repositories/assets.repo.js';
import { generatePosterForAsset } from '../../services/posters.service.js';
import { getAsset, type AssetWithThumbnail } from '../../services/assets.service.js';
import { AppError } from '../../plugins/error-handler.js';

const ParamsSchema = z.object({
  orgId: z.string().uuid(),
  id: z.string().uuid(),
});

/**
 * POST /api/v1/orgs/:orgId/assets/:id/regenerate-poster
 * Editor+ role. Re-extracts the first-frame poster for a video asset.
 *
 * Returns the freshly-updated asset (with the new posterKey + posterUrl).
 */
export async function regeneratePosterHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<{ data: AssetWithThumbnail }> {
  const { orgId, id } = ParamsSchema.parse(req.params);

  const asset = await findAssetById(orgId, id);
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (asset.type !== 'video') {
    throw new AppError(400, 'NOT_A_VIDEO', 'Only video assets can have a poster');
  }

  try {
    await generatePosterForAsset(asset);
  } catch (err) {
    if (err instanceof AppError && err.code === 'FFMPEG_UNAVAILABLE') throw err;
    throw new AppError(500, 'POSTER_GENERATION_FAILED', 'Failed to generate poster');
  }

  // Re-read the asset via the read path so the response has the new
  // posterKey + a fresh presigned posterUrl.
  const out = await getAsset(orgId, id);
  reply.code(200);
  return { data: out };
}
