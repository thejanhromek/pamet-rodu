// Prepares a recorded family interview for transcription: extracts the sound
// of each video (in recording order) into assets/interviews/<id>/audio/cast-N.m4a.
//
//   node scripts/import-interview.mjs 2026-11-02-jmeno-pametnika video1.MP4 video2.MP4 ...
//
// Next steps: python scripts/transcribe.py assets/interviews/<id>
// (see docs/navod.md, section "Rozhovory s pamětníky").
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

export async function importInterview(id, videos, { root = 'assets/interviews' } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id || '')) throw new Error('ID rozhovoru má tvar RRRR-MM-DD-jmeno, např. 2026-11-02-jmeno-pametnika.');
  if (!videos.length) throw new Error('Zadej alespoň jedno video.');
  const audioDir = path.join(root, id, 'audio');
  await fs.mkdir(audioDir, { recursive: true });
  const outputs = [];
  for (const [index, video] of videos.entries()) {
    const output = path.join(audioDir, `cast-${index + 1}.m4a`);
    await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', video, '-map', '0:a:0', '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', output]);
    outputs.push(output);
    console.log(`${path.basename(video)} → ${output}`);
  }
  await fs.writeFile(path.join(root, id, 'sources.json'), `${JSON.stringify({ id, videos: videos.map((video) => path.resolve(video)), parts: outputs.map((output) => path.basename(output)) }, null, 2)}\n`);
  return outputs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [id, ...videos] = process.argv.slice(2);
  importInterview(id, videos).catch((error) => { console.error(error.message); process.exit(1); });
}
