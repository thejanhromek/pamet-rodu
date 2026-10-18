// Smaller images for the light edition: at most 1000 px wide WebP, made once
// by the local ffmpeg and cached in assets/light/ (not committed). Without
// ffmpeg the original preview is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CACHE = 'assets/light';
let ffmpegMissing = false;

export async function lightImage(file, { width = 1000, quality = 60 } = {}) {
  if (ffmpegMissing) return file;
  const target = path.join(CACHE, `${path.basename(file, path.extname(file))}.webp`);
  try {
    const [source, cached] = await Promise.all([fs.stat(file), fs.stat(target).catch(() => null)]);
    if (cached && cached.mtimeMs >= source.mtimeMs) return target;
    await fs.mkdir(CACHE, { recursive: true });
    await run(process.env.RK_FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `scale='min(${width},iw)':-2`, '-c:v', 'libwebp', '-quality', String(quality), target]);
    return target;
  } catch (error) {
    if (error.code === 'ENOENT' && /ffmpeg/.test(String(error.path || error.cmd || ''))) {
      ffmpegMissing = true;
      console.warn('ffmpeg nebyl nalezen; lehké vydání použije původní náhledy.');
    } else {
      console.warn(`Zmenšení ${file} se nepovedlo (${error.message.split('\n')[0]}); použije se původní náhled.`);
    }
    return file;
  }
}
