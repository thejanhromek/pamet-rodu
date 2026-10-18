// Validates a dataset and its companion files against schema/kronika.schema.json.
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RKSchema = require('../../src/schema-lite.js');
const schemaPath = fileURLToPath(new URL('../../schema/kronika.schema.json', import.meta.url));

let cachedSchema = null;
export async function loadSchema() {
  cachedSchema ||= JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  return cachedSchema;
}

export async function validateWithSchema(data) {
  return RKSchema.validate(await loadSchema(), data);
}

// companions: { gazetteer, historyLocal, registers, mediaNotes } as read by load-dataset.mjs.
export async function validateCompanions(companions = {}) {
  const schema = await loadSchema();
  const errors = [];
  for (const [key, value] of Object.entries(companions)) {
    const part = schema.$defs.companions[key];
    if (!value || !part) continue;
    for (const error of RKSchema.validate(part, value, { root: schema })) errors.push({ ...error, path: `${key}: ${error.path}` });
  }
  return errors;
}

export const formatSchemaErrors = (errors, limit) => RKSchema.formatErrors(errors, limit);
