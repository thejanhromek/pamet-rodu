(function registerSchema(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKSchema = api;
})(globalThis, function createSchema() {
  'use strict';

  // A small JSON Schema (2020-12) validator covering the keywords used by
  // schema/kronika.schema.json: type, enum, const, required, properties,
  // additionalProperties, items, minItems, minLength, pattern, minimum,
  // maximum, anyOf and local $ref (#/$defs/...). Unknown keywords are ignored.

  function typeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (Number.isInteger(value)) return 'integer';
    return typeof value;
  }

  function matchesType(value, type) {
    const actual = typeOf(value);
    if (type === 'number') return actual === 'number' || actual === 'integer';
    return actual === type;
  }

  function resolve(rootSchema, ref) {
    if (!ref.startsWith('#/')) throw new Error(`Nepodporovaný $ref: ${ref}`);
    return ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], rootSchema);
  }

  const pointer = (path) => path.length ? path.map((part) => (typeof part === 'number' ? `[${part}]` : `.${part}`)).join('').replace(/^\./, '') : '(kořen)';

  function validateNode(schema, value, path, rootSchema, errors) {
    if (schema === true || schema === undefined) return;
    if (schema === false) { errors.push({ path: pointer(path), message: 'hodnota zde nesmí být' }); return; }
    if (schema.$ref) { validateNode(resolve(rootSchema, schema.$ref), value, path, rootSchema, errors); }
    if (schema.anyOf) {
      const ok = schema.anyOf.some((option) => { const local = []; validateNode(option, value, path, rootSchema, local); return local.length === 0; });
      if (!ok) errors.push({ path: pointer(path), message: 'neodpovídá žádné z povolených podob' });
    }
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((type) => matchesType(value, type))) {
        errors.push({ path: pointer(path), message: `očekáván typ ${types.join(' nebo ')}, je ${typeOf(value)}` });
        return;
      }
    }
    if (schema.const !== undefined && value !== schema.const) errors.push({ path: pointer(path), message: `musí být ${JSON.stringify(schema.const)}` });
    if (schema.enum && !schema.enum.includes(value)) errors.push({ path: pointer(path), message: `${JSON.stringify(value)} není povolená hodnota (${schema.enum.join(', ')})` });
    if (typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path: pointer(path), message: 'text je příliš krátký' });
      if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push({ path: pointer(path), message: `${JSON.stringify(value)} neodpovídá vzoru ${schema.pattern}` });
    }
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path: pointer(path), message: `menší než ${schema.minimum}` });
      if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path: pointer(path), message: `větší než ${schema.maximum}` });
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path: pointer(path), message: `potřeba alespoň ${schema.minItems} položek` });
      if (schema.items) value.forEach((item, index) => validateNode(schema.items, item, [...path, index], rootSchema, errors));
    }
    if (typeOf(value) === 'object') {
      for (const key of schema.required || []) {
        if (value[key] === undefined) errors.push({ path: pointer([...path, key]), message: 'chybí povinná položka' });
      }
      for (const [key, child] of Object.entries(value)) {
        if (schema.properties && Object.hasOwn(schema.properties, key)) validateNode(schema.properties[key], child, [...path, key], rootSchema, errors);
        else if (schema.additionalProperties !== undefined) validateNode(schema.additionalProperties, child, [...path, key], rootSchema, errors);
      }
    }
  }

  function validate(schema, value, { root = schema } = {}) {
    const errors = [];
    validateNode(schema, value, [], root, errors);
    return errors;
  }

  // Validates one item of a collection, e.g. a person drafted in the editor.
  function validateItem(schema, collection, item) {
    const itemSchema = schema?.properties?.[collection]?.items;
    return itemSchema ? validate(itemSchema, item, { root: schema }) : [];
  }

  function formatErrors(errors, limit = 30) {
    const lines = errors.slice(0, limit).map((error) => `  ${error.path}: ${error.message}`);
    if (errors.length > limit) lines.push(`  … a dalších ${errors.length - limit}`);
    return lines.join('\n');
  }

  return { validate, validateItem, formatErrors, typeOf };
});
