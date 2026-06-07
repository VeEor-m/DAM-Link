import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { extractFrame, isFfmpegAvailable } from '../src/lib/ffmpeg.js';

const execFileP = promisify(execFile);

async function makeSampleVideo(): Promise<string> {
  // 2-second test pattern video at 320x240, 25fps
  const dir = await mkdtemp();
  const out = path.join(dir, 'sample.mp4');
  await execFileP('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out,
  ], { timeout: 30_000 });
  return out;
}

let ffmpegAvailable = false;
let inputPath: string | undefined;
let workDir: string | undefined;

beforeAll(async () => {
  ffmpegAvailable = await isFfmpegAvailable();
  if (!ffmpegAvailable) return; // tests below will be skipped
  inputPath = await makeSampleVideo();
  workDir = await mkdtemp();
}, 60_000);

afterAll(async () => {
  if (inputPath) await rm(path.dirname(inputPath), { recursive: true, force: true });
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

async function mkdtemp() {
  return await mkdir(`${os.tmpdir()}/ffmpeg-test-${Date.now()}-${Math.random()}`, { recursive: true });
}

describe('extractFrame', () => {
  it.skipIf(!ffmpegAvailable)('writes a JPEG to the output path', async () => {
    const out = path.join(workDir!, 'frame.jpg');
    await extractFrame(inputPath!, out, { seekSeconds: 0.5 });
    const { stat } = await import('node:fs/promises').then(m => m.stat(out));
    expect(stat.size).toBeGreaterThan(100);
  });

  it('rejects when ffmpeg fails (invalid input)', async () => {
    // This one doesn't need ffmpeg to be available; execFile will fail with ENOENT for the input path
    const out = path.join(os.tmpdir(), `bad-${Date.now()}.jpg`);
    await expect(extractFrame('/nonexistent.mp4', out, { seekSeconds: 0 })).rejects.toThrow();
  });
});
