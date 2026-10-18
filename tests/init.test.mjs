import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createEmptyDataset, initProject, slugify } from '../scripts/init.mjs';

const require = createRequire(import.meta.url);
const RKModel = require('../src/model.js');
const RKViews = require('../src/views.js');

test('a new chronicle starts with one valid person and a first research task', () => {
  const data = createEmptyDataset({ name: 'Jana Nováková', sex: 'female', birthYear: '1985', email: 'jana@example.com', today: new Date('2026-10-18') });
  assert.deepEqual(RKModel.validateDataset(data), []);
  assert.equal(data.meta.defaultPersonId, 'novakova-jana-1985');
  assert.equal(data.people[0].lineage, 'self');
  assert.equal(data.meta.feedback.email, 'jana@example.com');
  assert.equal(data.researchTasks[0].status, 'open');
  assert.match(RKViews.renderOverview(data), /Rodová kronika/);
  assert.match(RKViews.renderPersonDetail(data, 'novakova-jana-1985'), /Jana Nováková/);
  assert.throws(() => createEmptyDataset({ name: 'Jana' }), /jméno i příjmení/);
  assert.throws(() => createEmptyDataset({ name: 'Jana Nováková', birthYear: '85' }), /čtyřmi číslicemi/);
  assert.equal(slugify('Šťastná Žofie'), 'stastna-zofie');
});

test('init writes own data, refuses to overwrite it and can restore the sample', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rodova-kronika-init-'));
  try {
    await initProject({ root, mode: 'ukazka' });
    const sample = JSON.parse(await fs.readFile(path.join(root, 'src/data/genealogy.json'), 'utf8'));
    assert.equal(sample.meta.sample, true);
    await initProject({ root, mode: 'vlastni', name: 'Karel Dvořák' });
    const own = JSON.parse(await fs.readFile(path.join(root, 'src/data/genealogy.json'), 'utf8'));
    assert.equal(own.people[0].displayName, 'Karel Dvořák');
    await assert.rejects(initProject({ root, mode: 'ukazka' }), /--force/);
    await initProject({ root, mode: 'ukazka', force: true });
    await fs.access(path.join(root, 'assets/interviews'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
