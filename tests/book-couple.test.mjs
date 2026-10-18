import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBook } from '../scripts/build-book.mjs';

const data = JSON.parse(fs.readFileSync('tests/fixtures/sample-family/data.json', 'utf8'));
const issued = new Date(2026, 9, 18);

test('a couple book numbers both spouses and their ancestors', () => {
  const html = buildBook(data, { egoId: 'petr-kadlec-1960', partnerId: 'jana-kadlecova-fialova-1962', issued });
  assert.match(html, /Předkové manželů<br><strong>Petr Kadlec<\/strong>/);
  assert.match(html, /<span class="number">2<\/span> Petr Kadlec/);
  assert.match(html, /<span class="number">3<\/span> Jana Kadlecová, roz\. Fialová/);
  assert.match(html, /<span class="number">4<\/span> Josef Kadlec<\/h3>\s*<p class="relation">otec · z pohledu: Petr Kadlec<\/p>/);
  assert.match(html, /<span class="number">6<\/span> Karel Fiala<\/h3>\s*<p class="relation">otec · z pohledu: Jana Kadlecová, roz\. Fialová<\/p>/);
  assert.match(html, /<h2>Manželé<\/h2>[\s\S]*<h2>Rodiče manželů<\/h2>/);
  assert.doesNotMatch(html, /<span class="number">1<\/span>/, 'the shared root is not printed');
  assert.doesNotMatch(html, /__manzele__/);
  assert.match(html, /Vývodová tabulka 1<\/h2><p>Petr Kadlec a jeho předci\./);
  assert.match(html, /Vývodová tabulka 2<\/h2><p>Jana Kadlecová, roz\. Fialová a její předci\./);
});

test('a single-person book stays as it was', () => {
  const html = buildBook(data, { egoId: 'petr-kadlec-1960', issued });
  assert.match(html, /Předkové osoby<br><strong>Petr Kadlec<\/strong>/);
  assert.match(html, /<span class="number">1<\/span> Petr Kadlec/);
  assert.throws(() => buildBook(data, { egoId: 'petr-kadlec-1960', partnerId: 'nikdo' }), /nikdo neexistuje/);
});
