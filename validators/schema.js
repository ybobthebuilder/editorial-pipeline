'use strict';

// Minimal JSON Schema validator: a subset of draft 2020-12. Pure JS with no
// module imports, so it runs unchanged in the n8n Cloud Code node, which
// allows only a fixed set of built-in modules.
//
// Fail-closed. A keyword outside KEYWORDS, or any $ref, throws SchemaError.
// A validator that skips a rule it does not understand reports data as valid
// without checking it, which is the failure this module exists to prevent.
//
// Supported: type (one name), enum, const, required, properties,
// additionalProperties (true or false), items (one schema), minItems,
// maxItems, minLength and maxLength (code points), pattern (unanchored search,
// as in JSON Schema, applied to strings only), minimum and maximum (inclusive).
// Annotations accepted and ignored: $schema, $id, title, description.

const ANNOTATIONS = ['$schema', '$id', 'title', 'description'];
const KEYWORDS = [
  'type', 'enum', 'const', 'required', 'properties', 'additionalProperties',
  'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern',
  'minimum', 'maximum',
];
const TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

class SchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function jsonKind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// Returns null when value is JSON, otherwise a short reason.
function jsonProblem(value, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `non-finite number ${value}`;
  if (typeof value !== 'object') return `value of type ${typeof value}`;
  if (ancestors.has(value)) return 'cyclic reference';
  ancestors.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const problem = jsonProblem(child, ancestors);
    if (problem) return problem;
  }
  ancestors.delete(value);
  return null;
}

// Structural check of the schema itself, run before any data is read.
function checkSchema(schema, where) {
  if (!isPlainObject(schema)) {
    throw new SchemaError(`${where}: schema must be an object; boolean schemas are not supported`);
  }
  for (const key of Object.keys(schema)) {
    if (!ANNOTATIONS.includes(key) && !KEYWORDS.includes(key)) {
      throw new SchemaError(`${where}: unsupported keyword "${key}"`);
    }
  }
  if (hasOwn(schema, 'type') && !TYPES.includes(schema.type)) {
    throw new SchemaError(`${where}: type must be one of ${TYPES.join(', ')}`);
  }
  if (hasOwn(schema, 'enum') && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    throw new SchemaError(`${where}: enum must be a non-empty array`);
  }
  if (hasOwn(schema, 'const')) {
    const problem = jsonProblem(schema.const, new Set());
    if (problem) throw new SchemaError(`${where}: const is not JSON (${problem})`);
  }
  if (hasOwn(schema, 'required')
    && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== 'string'))) {
    throw new SchemaError(`${where}: required must be an array of strings`);
  }
  if (hasOwn(schema, 'properties')) {
    if (!isPlainObject(schema.properties)) throw new SchemaError(`${where}: properties must be an object`);
    for (const key of Object.keys(schema.properties)) {
      checkSchema(schema.properties[key], `${where}/properties/${key}`);
    }
  }
  if (hasOwn(schema, 'additionalProperties') && typeof schema.additionalProperties !== 'boolean') {
    throw new SchemaError(`${where}: additionalProperties must be true or false`);
  }
  if (hasOwn(schema, 'items')) checkSchema(schema.items, `${where}/items`);
  for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength']) {
    if (hasOwn(schema, key) && !(Number.isInteger(schema[key]) && schema[key] >= 0)) {
      throw new SchemaError(`${where}: ${key} must be a non-negative integer`);
    }
  }
  if (hasOwn(schema, 'pattern')) {
    if (typeof schema.pattern !== 'string') throw new SchemaError(`${where}: pattern must be a string`);
    try {
      void new RegExp(schema.pattern, 'u');
    } catch (error) {
      throw new SchemaError(`${where}: pattern does not compile: ${error.message}`);
    }
  }
  for (const key of ['minimum', 'maximum']) {
    if (hasOwn(schema, key) && !Number.isFinite(schema[key])) {
      throw new SchemaError(`${where}: ${key} must be a finite number`);
    }
  }
}

// Path format: $.name for identifier keys, $["x-y"] otherwise, $[i] for items.
function childPath(path, key) {
  return IDENTIFIER.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length
      && keys.every((key) => hasOwn(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

function typeMatches(value, type) {
  switch (type) {
    case 'object': return isPlainObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: throw new SchemaError(`unknown type ${type}`);
  }
}

// Collects every failure; does not stop at the first one.
function walk(schema, value, path, errors) {
  const fail = (message) => errors.push({ path, message });

  if (hasOwn(schema, 'type') && !typeMatches(value, schema.type)) {
    fail(`expected ${schema.type}, received ${jsonKind(value)}`);
    return;
  }
  if (hasOwn(schema, 'enum') && !schema.enum.some((member) => deepEqual(member, value))) {
    fail('value is not one of the allowed enum members');
  }
  if (hasOwn(schema, 'const') && !deepEqual(schema.const, value)) {
    fail('value does not equal const');
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (hasOwn(schema, 'minLength') && length < schema.minLength) {
      fail(`length ${length} is below minLength ${schema.minLength}`);
    }
    if (hasOwn(schema, 'maxLength') && length > schema.maxLength) {
      fail(`length ${length} is above maxLength ${schema.maxLength}`);
    }
    if (hasOwn(schema, 'pattern') && !new RegExp(schema.pattern, 'u').test(value)) {
      fail(`does not match pattern ${schema.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (hasOwn(schema, 'minimum') && value < schema.minimum) fail(`is below minimum ${schema.minimum}`);
    if (hasOwn(schema, 'maximum') && value > schema.maximum) fail(`is above maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (hasOwn(schema, 'minItems') && value.length < schema.minItems) {
      fail(`has ${value.length} items, below minItems ${schema.minItems}`);
    }
    if (hasOwn(schema, 'maxItems') && value.length > schema.maxItems) {
      fail(`has ${value.length} items, above maxItems ${schema.maxItems}`);
    }
    if (hasOwn(schema, 'items')) {
      value.forEach((item, index) => walk(schema.items, item, `${path}[${index}]`, errors));
    }
  }
  if (isPlainObject(value)) {
    const declared = hasOwn(schema, 'properties') ? schema.properties : {};
    const required = hasOwn(schema, 'required') ? schema.required : [];
    for (const key of required) {
      if (!hasOwn(value, key)) errors.push({ path: childPath(path, key), message: 'missing required property' });
    }
    for (const key of Object.keys(declared)) {
      if (hasOwn(value, key)) walk(declared[key], value[key], childPath(path, key), errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!hasOwn(declared, key)) errors.push({ path: childPath(path, key), message: 'property is not allowed' });
      }
    }
  }
}

// Returns { passed, errors: [{ path, message }] }. Throws SchemaError for a
// malformed or unsupported schema, and TypeError for data that is not JSON.
function validate(schema, data) {
  checkSchema(schema, 'schema');
  const problem = jsonProblem(data, new Set());
  if (problem) throw new TypeError(`data is not JSON: ${problem}`);
  const errors = [];
  walk(schema, data, '$', errors);
  return { passed: errors.length === 0, errors };
}

module.exports = { validate, SchemaError };
