'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validate, SchemaError } = require('./schema.js');

const pathsOf = (result) => result.errors.map((error) => error.path);

test('type string accepts a string and reports a number at the root', () => {
  assert.deepEqual(validate({ type: 'string' }, 'a'), { passed: true, errors: [] });
  assert.deepEqual(validate({ type: 'string' }, 1), {
    passed: false,
    errors: [{ path: '$', message: 'expected string, received number' }],
  });
});

test('integer rejects fractions, number accepts them', () => {
  assert.equal(validate({ type: 'integer' }, 2).passed, true);
  assert.equal(validate({ type: 'integer' }, 2.5).passed, false);
  assert.equal(validate({ type: 'number' }, 2.5).passed, true);
});

test('null, array and object are distinct types', () => {
  assert.equal(validate({ type: 'null' }, null).passed, true);
  assert.equal(validate({ type: 'object' }, null).passed, false);
  assert.equal(validate({ type: 'object' }, []).passed, false);
  assert.equal(validate({ type: 'array' }, []).passed, true);
  assert.equal(validate({ type: 'boolean' }, 0).passed, false);
});

test('enum compares members by deep equality, not identity', () => {
  const schema = { enum: ['draft', { code: 'X' }, [1, 2]] };
  assert.equal(validate(schema, { code: 'X' }).passed, true);
  assert.equal(validate(schema, [1, 2]).passed, true);
  assert.equal(validate(schema, { code: 'Y' }).passed, false);
  assert.equal(validate(schema, '1').passed, false);
});

test('const accepts only an equal value, including null', () => {
  assert.equal(validate({ const: null }, null).passed, true);
  assert.equal(validate({ const: { a: [1] } }, { a: [1] }).passed, true);
  assert.equal(validate({ const: 0 }, false).passed, false);
});

test('required reports every missing property, not only the first', () => {
  const result = validate({ type: 'object', required: ['a', 'b', 'c'] }, { b: 1 });
  assert.deepEqual(pathsOf(result), ['$.a', '$.c']);
});

test('nested errors carry the full path, with brackets for non-identifier keys', () => {
  const schema = {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        properties: {
          slides: { type: 'array', items: { type: 'object', properties: { body: { type: 'string' } } } },
          'x-meta': { type: 'integer' },
        },
      },
    },
  };
  const data = { payload: { slides: [{ body: 'ok' }, { body: 3 }], 'x-meta': 1.5 } };
  assert.deepEqual(pathsOf(validate(schema, data)), ['$.payload.slides[1].body', '$.payload["x-meta"]']);
});

test('additionalProperties false rejects undeclared keys; when absent, extra keys pass', () => {
  const strict = { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false };
  assert.deepEqual(pathsOf(validate(strict, { id: 'a', extra: 1 })), ['$.extra']);
  const open = { type: 'object', properties: { id: { type: 'string' } } };
  assert.equal(validate(open, { id: 'a', extra: 1 }).passed, true);
});

test('items validates every element and reports each index', () => {
  const result = validate({ type: 'array', items: { type: 'integer' } }, [1, 'x', 2, 2.5]);
  assert.deepEqual(pathsOf(result), ['$[1]', '$[3]']);
});

test('minItems and maxItems bound array length, inclusively', () => {
  const schema = { type: 'array', minItems: 2, maxItems: 3 };
  assert.equal(validate(schema, [1, 2]).passed, true);
  assert.equal(validate(schema, [1, 2, 3]).passed, true);
  assert.equal(validate(schema, [1]).passed, false);
  assert.equal(validate(schema, [1, 2, 3, 4]).passed, false);
});

test('minLength and maxLength count code points, not UTF-16 units', () => {
  const schema = { type: 'string', minLength: 1, maxLength: 1 };
  assert.equal(validate(schema, '🙂').passed, true); // one code point, two UTF-16 units
  assert.equal(validate(schema, '').passed, false);
  assert.equal(validate(schema, 'ab').passed, false);
});

test('pattern is an unanchored search as in JSON Schema, and applies to strings only', () => {
  assert.equal(validate({ pattern: 'b' }, 'abc').passed, true);
  assert.equal(validate({ pattern: '^b$' }, 'abc').passed, false);
  assert.equal(validate({ pattern: 'x' }, 5).passed, true);
  const jobId = '^NX-\\d{4}-\\d{2}-\\d{2}-\\d{3}$';
  assert.equal(validate({ pattern: jobId }, 'NX-2026-10-22-001').passed, true);
  assert.equal(validate({ pattern: jobId }, 'NX-2026-10-22-0010').passed, false);
});

test('minimum and maximum are inclusive bounds', () => {
  const schema = { type: 'number', minimum: 0, maximum: 10 };
  assert.equal(validate(schema, 0).passed, true);
  assert.equal(validate(schema, 10).passed, true);
  assert.equal(validate(schema, -0.001).passed, false);
  assert.equal(validate(schema, 10.001).passed, false);
});

test('all errors are collected in one pass', () => {
  const schema = {
    type: 'object',
    required: ['a'],
    properties: { b: { type: 'integer' }, c: { type: 'string', maxLength: 2 } },
    additionalProperties: false,
  };
  const result = validate(schema, { b: 1.5, c: 'abc', d: true });
  assert.deepEqual(pathsOf(result), ['$.a', '$.b', '$.c', '$.d']);
  assert.equal(result.passed, false);
});

test('annotations are accepted and ignored', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'nature-exe/example/0.1.0',
    title: 'example',
    description: 'example',
    type: 'string',
  };
  assert.equal(validate(schema, 'a').passed, true);
});

test('an empty schema accepts any JSON value', () => {
  for (const value of [null, 0, 'a', [], {}, { a: [1, { b: null }] }]) {
    assert.equal(validate({}, value).passed, true);
  }
});

test('unsupported keywords fail closed instead of being ignored', () => {
  for (const keyword of ['format', 'oneOf', 'anyOf', 'not', 'uniqueItems', 'multipleOf', 'exclusiveMinimum']) {
    assert.throws(() => validate({ [keyword]: 1 }, 'x'), SchemaError, keyword);
  }
});

test('$ref is refused, because resolving references is outside this subset', () => {
  assert.throws(() => validate({ $ref: '#/$defs/x' }, 1), SchemaError);
});

test('an unsupported keyword deep in the schema is refused even when the data never reaches it', () => {
  const schema = { type: 'object', properties: { a: { type: 'array', items: { oneOf: [] } } } };
  assert.throws(() => validate(schema, { a: [] }), SchemaError);
});

test('malformed schemas are refused before any data is read', () => {
  const malformed = [
    true,
    [],
    { type: 'any' },
    { type: ['string', 'null'] },
    { enum: [] },
    { required: [1] },
    { properties: [] },
    { properties: { a: true } },
    { additionalProperties: {} },
    { items: [{ type: 'string' }] },
    { minLength: -1 },
    { maxItems: 1.5 },
    { pattern: '[' },
    { pattern: 5 },
    { minimum: Infinity },
    { const: undefined },
  ];
  for (const schema of malformed) {
    assert.throws(() => validate(schema, 'x'), SchemaError, JSON.stringify(schema));
  }
});

test('data that is not JSON is refused with TypeError', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const notJson = [undefined, NaN, Infinity, () => 1, 10n, Symbol('s'), cyclic, { a: undefined }, [undefined]];
  for (const value of notJson) {
    assert.throws(() => validate({}, value), TypeError);
  }
});

// Synthetic envelope-shaped fixture. It is not the NATURE.exe contract: that
// contract is UNKNOWN (U2) and not written. It shows what the subset can express.
const SYNTHETIC_ENVELOPE = {
  type: 'object',
  required: ['contract', 'job_id', 'state', 'payload'],
  properties: {
    contract: {
      type: 'object',
      required: ['name', 'version'],
      properties: {
        name: { type: 'string' },
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
      },
      additionalProperties: false,
    },
    job_id: { type: 'string', pattern: '^NX-\\d{4}-\\d{2}-\\d{2}-\\d{3}$' },
    state: { type: 'string', enum: ['request_received', 'brief_approved'] },
    payload: { type: 'object' },
    gates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string' },
          status: { enum: ['pending', 'pass', 'fail', 'waived'] },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const VALID_ENVELOPE = {
  contract: { name: 'request', version: '0.1.0' },
  job_id: 'NX-2026-10-22-001',
  state: 'request_received',
  payload: { topic: 'x' },
  gates: [{ id: 'G-H-BRIEF', status: 'pending' }],
};

test('synthetic envelope: a valid document passes', () => {
  assert.deepEqual(validate(SYNTHETIC_ENVELOPE, VALID_ENVELOPE), { passed: true, errors: [] });
});

test('synthetic envelope: bad job_id, version and state are each reported at their path', () => {
  const result = validate(SYNTHETIC_ENVELOPE, {
    ...VALID_ENVELOPE,
    job_id: 'NX-2026-10-22-1',
    contract: { name: 'request', version: '0.1' },
    state: 'unknown_state',
  });
  // Errors follow the declaration order of `properties`: contract, then job_id, then state.
  assert.deepEqual(pathsOf(result), ['$.contract.version', '$.job_id', '$.state']);
});

test('synthetic envelope: an undeclared top-level key is reported', () => {
  assert.deepEqual(pathsOf(validate(SYNTHETIC_ENVELOPE, { ...VALID_ENVELOPE, extra: true })), ['$.extra']);
});

test('synthetic envelope: the schema alone accepts status waived, so cross-field CFM rules must live elsewhere', () => {
  const withWaived = { ...VALID_ENVELOPE, gates: [{ id: 'G-CFM-01', status: 'waived' }] };
  assert.equal(validate(SYNTHETIC_ENVELOPE, withWaived).passed, true);
  const withSkipped = { ...VALID_ENVELOPE, gates: [{ id: 'G-CFM-01', status: 'skipped' }] };
  assert.deepEqual(pathsOf(validate(SYNTHETIC_ENVELOPE, withSkipped)), ['$.gates[0].status']);
});

test('the validator has no module imports, so it runs in the n8n Cloud Code node', () => {
  const source = readFileSync(join(__dirname, 'schema.js'), 'utf8');
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/^\s*import\s/m.test(source), false);
});
