// Cuts the audio clips listed in src/data/genealogy.json (media with
// kind "audio-clip") from an interview recording. Each clip names its
// interview folder, start and end in seconds of the whole interview; the
// recording may be split into several parts (audio/cast-N.m4a).
//
//   node scripts/make-clips.mjs [--force]
//
// Clips are Opus in WebM (24 kbit/s mono, loudness-normalised): small enough
// to embed in the family HTML and clear enough for speech.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

export async function partsOf(interviewDir) {
  const audioDir = path.join(interviewDir, 'audio');
  const names = (await fs.readdir(audioDir)).filter((name) => /^cast-\d+\.m4a$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return names.map((name) => path.resolve(audioDir, name));
}

async function durationOf(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

export async function makeClip(media, { assetsRoot = 'assets', force = false } = {}) {
  const output = path.join(assetsRoot, media.file);
  if (!force) {
    try { if ((await fs.stat(output)).size > 0) return { output, skipped: true }; } catch (_) { /* Not cut yet. */ }
  }
  if (!(media.end > media.start)) throw new Error(`${media.id}: konec musí být po začátku.`);
  const parts = await partsOf(path.join(assetsRoot, 'interviews', media.interview));
  const encode = ['-af', 'highpass=f=70,loudnorm=I=-18:TP=-2:LRA=11,afade=t=in:d=0.3', '-ac', '1', '-c:a', 'libopus', '-b:a', '24k', output];
  await fs.mkdir(path.dirname(output), { recursive: true });
  // Within one part: seek straight into that file (fast).
  let offset = 0;
  for (const part of parts) {
    const duration = await durationOf(part);
    if (media.start >= offset && media.end <= offset + duration) {
      await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-ss', String(media.start - offset), '-i', part, '-t', String(media.end - media.start), ...encode]);
      return { output, skipped: false };
    }
    offset += duration;
  }
  // Across a part boundary: the concat demuxer joins the recordings.
  const list = path.join(os.tmpdir(), `rk-clip-${process.pid}-${media.id}.txt`);
  await fs.writeFile(list, parts.map((part) => `file '${part.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`).join('\n'));
  try {
    await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-ss', String(media.start), '-to', String(media.end), ...encode]);
  } finally {
    await fs.rm(list, { force: true });
  }
  return { output, skipped: false };
}

async function main() {
  const data = JSON.parse(await fs.readFile('src/data/genealogy.json', 'utf8'));
  const clips = (data.media || []).filter((media) => media.kind === 'audio-clip');
  for (const clip of clips) {
    const { output, skipped } = await makeClip(clip, { force: process.argv.includes('--force') });
    console.log(`${skipped ? 'beze změny' : 'vytvořeno'}: ${output}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
