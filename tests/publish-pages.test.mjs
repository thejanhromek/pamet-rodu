import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePages, checkPublicFiles, decryptPayload, MIN_PASSWORD_LENGTH } from '../scripts/publish-pages.mjs';

const data = JSON.parse(fs.readFileSync('tests/fixtures/sample-family/data.json', 'utf8'));
const html = `<!doctype html><title>Kronika</title><script>window.RK_DATA=${JSON.stringify(data)}</script>`;
const PASSWORD = 'zkusebni heslo pro test stranky';

test('the public page holds only the encrypted chronicle and opens with the password', async () => {
  const files = await preparePages(html, PASSWORD, { domain: 'rodokmen.example.cz', iterations: 1000 });
  assert.deepEqual(Object.keys(files).sort(), ['.nojekyll', 'CNAME', 'README.md', 'index.html', 'robots.txt']);
  assert.equal(files.CNAME, 'rodokmen.example.cz\n');
  assert.match(files['robots.txt'], /Disallow: \//);
  assert.match(files['index.html'], /<meta name="robots" content="noindex">/);
  assert.ok(!files['index.html'].includes('Kadlec'), 'no clear text from the chronicle');
  const payload = JSON.parse(files['index.html'].match(/const PAYLOAD = (\{.*\});/)[1]);
  assert.equal(await decryptPayload(payload, PASSWORD), html);
  await assert.rejects(decryptPayload(payload, `${PASSWORD}x`));
  assert.deepEqual(checkPublicFiles(files, data), [], 'privacy check passes');
});

test('short passwords and odd domains are refused', async () => {
  await assert.rejects(preparePages(html, 'kratke-heslo', { iterations: 1000 }), new RegExp(`aspoň ${MIN_PASSWORD_LENGTH} znaků`));
  await assert.rejects(preparePages(html, PASSWORD, { domain: 'http://x', iterations: 1000 }), /Neplatná doména/);
});

test('the privacy check catches family data written in clear text', () => {
  const findings = checkPublicFiles({ 'README.md': 'Rodokmen rodu Josef Kadlec' }, data);
  assert.ok(findings.length > 0);
});
