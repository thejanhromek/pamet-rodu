import test from 'node:test';
import assert from 'node:assert/strict';
import { clipWords, attachClipWords } from '../scripts/lib/interview-words.mjs';

const transcript = {
  segments: [
    { part: 1, start: 0, interviewStart: 0, words: [{ start: 0, word: ' Dobrý' }, { start: 0.5, word: ' den.' }] },
    { part: 2, start: 0, interviewStart: 100, words: [{ start: 1.2, word: ' Narodil' }, { start: 1.8, word: ' jsem' }, { start: 2.3, word: ' se' }, { start: 9, word: ' konec' }] },
  ],
};

test('clip words use interview time and are relative to the clip start', () => {
  assert.deepEqual(clipWords(transcript, { start: 101, end: 103 }), [[0.2, 'Narodil'], [0.8, 'jsem'], [1.3, 'se']]);
  assert.deepEqual(clipWords(transcript, { start: 0, end: 1 }), [[0, 'Dobrý'], [0.5, 'den.']]);
});

test('clips keep existing words and skip interviews without a transcript', async () => {
  const media = [
    { id: 'a', kind: 'audio-clip', interview: 'neexistuje', start: 0, end: 5 },
    { id: 'b', kind: 'audio-clip', interview: 'x', start: 0, end: 5, words: [[0, 'hotovo']] },
    { id: 'c', kind: 'family-photo' },
  ];
  await attachClipWords(media, { interviewsDirectory: 'tests/fixtures/none' });
  assert.equal(media[0].words, undefined);
  assert.deepEqual(media[1].words, [[0, 'hotovo']]);
});
