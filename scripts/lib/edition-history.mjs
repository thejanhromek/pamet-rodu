// "Co je nového": compares the current data with the dataset of the last
// released edition (local git tag vydani-<version>, see scripts/release.mjs).
// Without git or without a release tag the overview simply has no such section.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const RKEditionDiff = require('../../src/edition-diff.js');

export const TAG_PREFIX = 'vydani-';

export async function latestReleaseTag({ cwd = process.cwd() } = {}) {
  try {
    const { stdout } = await run('git', ['tag', '--list', `${TAG_PREFIX}*`, '--sort=-creatordate'], { cwd });
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
  } catch (_) {
    return null;
  }
}

export async function datasetAtTag(tag, dataPath, { cwd = process.cwd() } = {}) {
  try {
    const { stdout } = await run('git', ['show', `${tag}:${dataPath.split('\\').join('/')}`], { cwd, maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (_) {
    return null;
  }
}

export async function previousEditionDiff(current, { dataPath = 'src/data/genealogy.json', cwd = process.cwd() } = {}) {
  const tag = await latestReleaseTag({ cwd });
  if (!tag) return null;
  const previous = await datasetAtTag(tag, dataPath, { cwd });
  if (!previous) return null;
  const diff = RKEditionDiff.diffEditions(previous, current);
  return { ...diff, sinceTag: tag, sinceVersion: previous.meta?.version || tag.slice(TAG_PREFIX.length), sinceDate: previous.meta?.updatedAt || null };
}
