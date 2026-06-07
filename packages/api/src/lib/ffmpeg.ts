import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface ExtractFrameOpts {
  /** Seek to this offset (seconds) before extracting. Defaults to 1.0 to
   *  skip the black/fade-in frames common at the very start of a recording. */
  seekSeconds?: number;
  /** Cap the output width in pixels. Defaults to 1280. The height is
   *  computed by ffmpeg to preserve aspect ratio. */
  maxWidth?: number;
  /** JPEG quality (1 = best, 31 = worst; 2 is visually lossless). */
  quality?: number;
}

/**
 * Extract a single frame from a video file as a JPEG.
 * Pure passthrough to `ffmpeg`; throws if ffmpeg is missing or fails.
 */
export async function extractFrame(
  input: string,
  output: string,
  opts: ExtractFrameOpts = {},
): Promise<void> {
  const seek = String(opts.seekSeconds ?? 1.0);
  const maxW = String(opts.maxWidth ?? 1280);
  const q = String(opts.quality ?? 2);
  await execFileP(
    'ffmpeg',
    [
      '-y',
      '-ss', seek,
      '-i', input,
      '-frames:v', '1',
      '-q:v', q,
      '-vf', `scale='min(${maxW},iw)':-2`,
      output,
    ],
    { timeout: 30_000 },
  );
}

/** Probe ffmpeg availability without invoking it. Returns true iff the
 *  binary is on PATH and runs `ffmpeg -version` successfully. */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileP('ffmpeg', ['-version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
