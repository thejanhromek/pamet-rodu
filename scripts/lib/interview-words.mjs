// Word timings for interview clips: each audio clip (media kind "audio-clip"
// with `interview`, `start`, `end` in seconds of the whole interview) gets
// `words: [[secondsFromClipStart, "word"], ...]` cut from
// assets/interviews/<interview>/transcript.json, so the player can highlight
// the spoken word. Clips that already carry words, or whose interview has no
// transcript, are left as they are.
import fs from 'node:fs/promises';
import path from 'node:path';

async function readTranscript(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// segments: [{ start, interviewStart, words: [{ start, word }] }]
export function clipWords(transcript, clip) {
  const words = [];
  for (const segment of transcript?.segments || []) {
    const offset = Number(segment.interviewStart ?? segment.start) - Number(segment.start || 0);
    for (const word of segment.words || []) {
      const at = Number(word.start) + offset;
      if (!(at >= clip.start - 0.05 && at < clip.end)) continue;
      const text = String(word.word || '').trim();
      if (text) words.push([Math.max(0, Math.round((at - clip.start) * 100) / 100), text]);
    }
  }
  return words.sort((a, b) => a[0] - b[0]);
}

export async function attachClipWords(mediaList, { interviewsDirectory = 'assets/interviews' } = {}) {
  const cache = new Map();
  for (const media of mediaList) {
    if (media.kind !== 'audio-clip' || !media.interview || media.words || !Number.isFinite(media.start) || !Number.isFinite(media.end)) continue;
    if (!cache.has(media.interview)) cache.set(media.interview, await readTranscript(path.join(interviewsDirectory, media.interview, 'transcript.json')));
    const transcript = cache.get(media.interview);
    if (!transcript) continue;
    const words = clipWords(transcript, media);
    if (words.length) media.words = words;
  }
  return mediaList;
}
