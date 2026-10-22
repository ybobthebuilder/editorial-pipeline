'use strict';

// Tests of contracts/{visual_spec,cover_spec,qa_result,image_assets}.schema.json with validators/schema.js
// (checkpoints CP-VL3.2 and CP-VL3.3). The fixtures are synthetic; see fixtures/synthetic/contracts.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { validate } = require('./schema.js');

const ROOT = join(__dirname, '..');
const CONTRACTS = ['visual_spec', 'cover_spec', 'qa_result', 'image_assets'];
const PROVENANCE = ['job_id', 'stage', 'config_source', 'config_version', 'model', 'execution_id', 'created_at'];
const STAGE = { visual_spec: '06_VISUAL', cover_spec: '07_COVERS', qa_result: '09_QA', image_assets: '01_INGEST' };
const OPTIONAL = { visual_spec: ['rationale'], cover_spec: [], qa_result: ['semantic'], image_assets: [] };

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const schemaOf = (name) => readJson(join(ROOT, 'contracts', `${name}.schema.json`));
const fixtureDir = (name) => join(ROOT, 'fixtures', 'synthetic', 'contracts', name);
const fixture = (name, file) => readJson(join(fixtureDir(name), `${file}.json`));
const validOf = (name) => fixture(name, 'valid-01');
const clone = (value) => JSON.parse(JSON.stringify(value));
const errorsOf = (name, data) => validate(schemaOf(name), data).errors.map((e) => `${e.path}: ${e.message}`);
const paths = (name, data) => validate(schemaOf(name), data).errors.map((e) => e.path);

test('each schema stays inside the subset schema.js supports (it does not throw) and is closed', () => {
  for (const name of CONTRACTS) {
    const schema = schemaOf(name);
    assert.doesNotThrow(() => validate(schema, {}), name);
    assert.equal(schema.type, 'object', name);
    assert.equal(schema.additionalProperties, false, name);
    assert.deepEqual(Object.keys(schema.properties).slice(0, PROVENANCE.length), PROVENANCE, `${name}: provenance block comes first`);
  }
});

test('required lists every property except the documented optional ones', () => {
  for (const name of CONTRACTS) {
    const schema = schemaOf(name);
    const expected = Object.keys(schema.properties).filter((k) => !OPTIONAL[name].includes(k)).sort();
    assert.deepEqual([...schema.required].sort(), expected, name);
  }
});

test('the provenance block is identical in the four schemas, except for the stage constant', () => {
  const block = (name) => {
    const properties = clone(schemaOf(name).properties);
    const out = {};
    for (const key of PROVENANCE) out[key] = properties[key];
    delete out.stage;
    return out;
  };
  assert.deepEqual(block('cover_spec'), block('visual_spec'));
  assert.deepEqual(block('qa_result'), block('visual_spec'));
  assert.deepEqual(block('image_assets'), block('visual_spec'));
  for (const name of CONTRACTS) assert.equal(schemaOf(name).properties.stage.const, STAGE[name], name);
});

test('fixtures: two valid and two invalid per contract, and nothing else in the folders', () => {
  for (const name of CONTRACTS) {
    const files = readdirSync(fixtureDir(name)).sort();
    assert.equal(files.filter((f) => f.startsWith('valid-')).length, 2, name);
    assert.equal(files.filter((f) => f.startsWith('invalid-')).length, 2, name);
    assert.equal(files.length, 4, name);
  }
});

test('the valid fixtures pass', () => {
  for (const name of CONTRACTS) {
    for (const file of ['valid-01', 'valid-02']) {
      assert.deepEqual(errorsOf(name, fixture(name, file)), [], `${name}/${file}`);
    }
  }
});

test('each invalid fixture fails for its stated cause and for no other', () => {
  const expected = {
    visual_spec: {
      'invalid-01-missing-execution_id': ['$.execution_id: missing required property'],
      'invalid-02-missing-evidence_ids': ['$.evidence_ids: missing required property'],
    },
    cover_spec: {
      'invalid-01-template_id-out-of-enum': ['$.template_id: value is not one of the allowed enum members'],
      'invalid-02-missing-evidence_ids': ['$.evidence_ids: missing required property'],
    },
    qa_result: {
      'invalid-01-gate_id-out-of-enum': ['$.gates[0].gate_id: value is not one of the allowed enum members'],
      'invalid-02-missing-config_version': ['$.config_version: missing required property'],
    },
    image_assets: {
      'invalid-01-owned_photo-in-images': ['$.images[0].provenance: value is not one of the allowed enum members'],
      'invalid-02-exception-without-approval_id': ['$.exceptions[0].approval_id: missing required property'],
    },
  };
  for (const name of CONTRACTS) {
    for (const [file, errors] of Object.entries(expected[name])) {
      assert.deepEqual(errorsOf(name, fixture(name, file)), errors, `${name}/${file}`);
    }
  }
});

test('CP-VL3.3: each of the seven provenance fields is required in every contract', () => {
  for (const name of CONTRACTS) {
    for (const key of PROVENANCE) {
      const data = validOf(name);
      delete data[key];
      assert.deepEqual(errorsOf(name, data), [`$.${key}: missing required property`], `${name} without ${key}`);
    }
  }
});

test('CP-VL3.3: every other required field is required too', () => {
  const extra = { visual_spec: ['insight_id', 'evidence_ids', 'grammar_id'], cover_spec: ['visual_spec_id', 'template_id', 'evidence_ids', 'slots', 'alt_text'], qa_result: ['cover_spec_id', 'gates', 'passed'], image_assets: ['images', 'exceptions'] };
  for (const name of CONTRACTS) {
    for (const key of extra[name]) {
      const data = validOf(name);
      delete data[key];
      assert.deepEqual(errorsOf(name, data), [`$.${key}: missing required property`], `${name} without ${key}`);
    }
  }
});

test('CP-VL3.3: evidence_ids must be present, non-empty and made of non-empty strings', () => {
  for (const name of ['visual_spec', 'cover_spec']) {
    for (const [value, path] of [[[], '$.evidence_ids'], [[''], '$.evidence_ids[0]'], [[7], '$.evidence_ids[0]'], ['ev-0001', '$.evidence_ids'], [null, '$.evidence_ids']]) {
      const data = validOf(name);
      data.evidence_ids = value;
      assert.deepEqual(paths(name, data), [path], `${name} evidence_ids=${JSON.stringify(value)}`);
    }
  }
  assert.equal(Object.hasOwn(schemaOf('qa_result').properties, 'evidence_ids'), false);
});

test('CP-VL3.2: closed enums reject a value that is not listed', () => {
  const cases = [
    ['visual_spec', (d) => { d.config_source = 'internal'; }, '$.config_source'],
    ['cover_spec', (d) => { d.config_source = 'Public'; }, '$.config_source'],
    ['cover_spec', (d) => { d.template_id = 'post-03-novo'; }, '$.template_id'],
    ['cover_spec', (d) => { d.template_id = 'POST-01-MANIFESTO'; }, '$.template_id'],
    ['cover_spec', (d) => { d.slots[0].kind = 'decor'; }, '$.slots[0].kind'],
    ['qa_result', (d) => { d.gates[2].gate_id = 'QA-CFM '; }, '$.gates[2].gate_id'],
    ['qa_result', (d) => { d.gates[0].status = 'skipped'; }, '$.gates[0].status'],
    ['qa_result', (d) => { d.semantic.verdict = 'maybe'; }, '$.semantic.verdict'],
    ['qa_result', (d) => { d.semantic.reasons = ['tom_ruim']; }, '$.semantic.reasons[0]'],
  ];
  for (const [name, mutate, path] of cases) {
    const data = validOf(name);
    mutate(data);
    assert.deepEqual(paths(name, data), [path], `${name} ${path}`);
  }
});

test('every listed enum member is accepted and the lists are exactly the proposal', () => {
  const cover = schemaOf('cover_spec').properties;
  assert.deepEqual(cover.template_id.enum, ['post-01-manifesto', 'post-02-metrica', 'carousel-01-capa', 'story-01-convite', 'reel-01-capa', 'reel-02-overlay']);
  assert.deepEqual(cover.slots.items.properties.kind.enum, ['claim', 'chrome']);
  const gate = schemaOf('qa_result').properties.gates.items.properties;
  assert.deepEqual(gate.gate_id.enum, ['QA-DIM', 'QA-OVF', 'QA-SAFE', 'QA-CTR', 'QA-TOK', 'QA-TYPE', 'QA-GRID', 'QA-NUM', 'QA-ENUM', 'QA-CFM']);
  assert.deepEqual(gate.status.enum, ['passed', 'failed', 'waived']);
  const semantic = schemaOf('qa_result').properties.semantic.properties;
  assert.deepEqual(semantic.verdict.enum, ['pass', 'fail']);
  assert.deepEqual(semantic.reasons.items.enum, ['afirmacao_sem_evidencia', 'exagero_de_forca', 'causalidade_indevida', 'alt_text_inconsistente', 'tom_promocional', 'entrada_insuficiente']);
  for (const template of cover.template_id.enum) {
    const data = validOf('cover_spec');
    data.template_id = template;
    assert.deepEqual(errorsOf('cover_spec', data), [], template);
  }
  for (const reason of semantic.reasons.items.enum) {
    const data = validOf('qa_result');
    data.semantic = { verdict: 'fail', reasons: [reason] };
    assert.deepEqual(errorsOf('qa_result', data), [], reason);
  }
  for (const id of gate.gate_id.enum) {
    const data = validOf('qa_result');
    data.gates[0].gate_id = id;
    assert.deepEqual(errorsOf('qa_result', data), [], id);
  }
});

test('the stage constant ties each contract to its own stage', () => {
  for (const name of CONTRACTS) {
    for (const other of CONTRACTS.filter((n) => n !== name)) {
      const data = validOf(name);
      data.stage = STAGE[other];
      assert.deepEqual(paths(name, data), ['$.stage'], `${name} with stage ${STAGE[other]}`);
    }
    const data = validOf(name);
    data.stage = '';
    assert.deepEqual(paths(name, data), ['$.stage'], name);
  }
});

test('objects are closed: an unknown field fails at the root, in a slot, in a gate and in semantic', () => {
  for (const name of CONTRACTS) {
    const data = validOf(name);
    data.template_ref = 'x';
    assert.deepEqual(paths(name, data), ['$.template_ref'], name);
  }
  const cover = validOf('cover_spec');
  cover.slots[1].font_size = 12;
  assert.deepEqual(paths('cover_spec', cover), ['$.slots[1].font_size']);
  const qa = validOf('qa_result');
  qa.gates[0].score = 1;
  qa.semantic.confidence = 0.9;
  assert.deepEqual(paths('qa_result', qa).sort(), ['$.gates[0].score', '$.semantic.confidence']);
});

test('provenance formats: uuid in lowercase, UTC timestamp with Z, non-empty text', () => {
  const bad = {
    job_id: ['00000000-0000-4000-8000-00000000000G', '00000000-0000-4000-8000-0000000000001', 'A0000000-0000-4000-8000-000000000001', '0000000000004000800000000001', '', 5],
    created_at: ['2026-10-22', '2026-10-22T12:00:00', '2026-10-22T12:00:00-03:00', '2026-10-22T12:00:00+00:00', '2026-10-22 12:00:00Z', '2026-10-22T12:00:00Z ', ' 2026-10-22T12:00:00Z', 1761134400],
    model: ['', 7],
    execution_id: ['', null],
    config_version: ['', 1],
  };
  for (const name of CONTRACTS) {
    for (const [key, values] of Object.entries(bad)) {
      for (const value of values) {
        const data = validOf(name);
        data[key] = value;
        assert.deepEqual(paths(name, data), [`$.${key}`], `${name} ${key}=${JSON.stringify(value)}`);
      }
    }
    for (const good of ['2026-10-22T12:00:00Z', '2026-10-22T12:00:00.123Z']) {
      const data = validOf(name);
      data.created_at = good;
      assert.deepEqual(errorsOf(name, data), [], `${name} ${good}`);
    }
  }
});

test('not_reported is a plain string: accepted for model and for grammar_id (code decides what to do)', () => {
  assert.deepEqual(errorsOf('visual_spec', fixture('visual_spec', 'valid-02')), []);
  assert.equal(fixture('visual_spec', 'valid-02').grammar_id, 'not_reported');
  assert.equal(fixture('visual_spec', 'valid-02').model, 'not_reported');
});

test('visual_spec: rationale is optional and at most 280 characters', () => {
  const data = validOf('visual_spec');
  data.rationale = 'x'.repeat(280);
  assert.deepEqual(errorsOf('visual_spec', data), []);
  data.rationale = 'x'.repeat(281);
  assert.deepEqual(paths('visual_spec', data), ['$.rationale']);
  data.rationale = '\u{1F600}'.repeat(280);
  assert.deepEqual(errorsOf('visual_spec', data), [], 'length counts code points');
  data.rationale = 5;
  assert.deepEqual(paths('visual_spec', data), ['$.rationale']);
  delete data.rationale;
  assert.deepEqual(errorsOf('visual_spec', data), []);
  for (const key of ['insight_id', 'grammar_id']) {
    const empty = validOf('visual_spec');
    empty[key] = '';
    assert.deepEqual(paths('visual_spec', empty), [`$.${key}`], key);
  }
});

test('cover_spec: slots and lines need at least one non-empty entry, and alt_text is mandatory text', () => {
  const cases = [
    [(d) => { d.slots = []; }, '$.slots'],
    [(d) => { d.slots[0].lines = []; }, '$.slots[0].lines'],
    [(d) => { d.slots[0].lines = ['']; }, '$.slots[0].lines[0]'],
    [(d) => { d.slots[0].lines = 'De 84%'; }, '$.slots[0].lines'],
    [(d) => { d.slots[1].slot_id = ''; }, '$.slots[1].slot_id'],
    [(d) => { delete d.slots[0].kind; }, '$.slots[0].kind'],
    [(d) => { delete d.slots[0].lines; }, '$.slots[0].lines'],
    [(d) => { d.alt_text = ''; }, '$.alt_text'],
    [(d) => { d.alt_text = null; }, '$.alt_text'],
    [(d) => { d.visual_spec_id = ''; }, '$.visual_spec_id'],
  ];
  for (const [mutate, path] of cases) {
    const data = validOf('cover_spec');
    mutate(data);
    assert.deepEqual(paths('cover_spec', data), [path], path);
  }
});

test('qa_result: gates need entries with a detail, semantic is optional, passed is a boolean', () => {
  const cases = [
    [(d) => { d.gates = []; }, '$.gates'],
    [(d) => { d.gates[0].detail = ''; }, '$.gates[0].detail'],
    [(d) => { delete d.gates[0].detail; }, '$.gates[0].detail'],
    [(d) => { delete d.gates[3].status; }, '$.gates[3].status'],
    [(d) => { d.passed = 'true'; }, '$.passed'],
    [(d) => { d.passed = 1; }, '$.passed'],
    [(d) => { delete d.semantic.verdict; }, '$.semantic.verdict'],
    [(d) => { delete d.semantic.reasons; }, '$.semantic.reasons'],
    [(d) => { d.semantic.reasons = 'tom_promocional'; }, '$.semantic.reasons'],
    [(d) => { d.cover_spec_id = ''; }, '$.cover_spec_id'],
  ];
  for (const [mutate, path] of cases) {
    const data = validOf('qa_result');
    mutate(data);
    assert.deepEqual(paths('qa_result', data), [path], path);
  }
  const noSemantic = validOf('qa_result');
  delete noSemantic.semantic;
  assert.deepEqual(errorsOf('qa_result', noSemantic), []);
  assert.deepEqual(errorsOf('qa_result', fixture('qa_result', 'valid-02')), []);
  assert.equal(Object.hasOwn(fixture('qa_result', 'valid-02'), 'semantic'), false);
});

test('the smallest valid documents are accepted: one-character strings, one slot, one gate', () => {
  const provenance = { job_id: '00000000-0000-4000-8000-000000000001', config_source: 'public', config_version: 'v', model: 'm', execution_id: 'e', created_at: '2026-10-22T12:00:00Z' };
  const minimal = {
    visual_spec: { ...provenance, stage: '06_VISUAL', insight_id: 'i', evidence_ids: ['e'], grammar_id: 'g' },
    cover_spec: { ...provenance, stage: '07_COVERS', visual_spec_id: 'v', template_id: 'post-01-manifesto', evidence_ids: ['e'], slots: [{ slot_id: 's', kind: 'chrome', lines: ['l'] }], alt_text: 'a' },
    qa_result: { ...provenance, stage: '09_QA', cover_spec_id: 'c', gates: [{ gate_id: 'QA-DIM', status: 'passed', detail: 'd' }], passed: true },
    image_assets: { ...provenance, stage: '01_INGEST', images: [], exceptions: [] },
  };
  for (const name of CONTRACTS) assert.deepEqual(errorsOf(name, minimal[name]), [], name);
});

test('a wrong JSON type is refused for every top-level property and for every nested one', () => {
  // The wrong value comes from the kind of the valid fixture, not from the schema under test.
  const wrongFor = (value) => (typeof value === 'string' ? 5 : typeof value === 'boolean' ? 'true' : Array.isArray(value) ? 'x' : 5);
  for (const name of CONTRACTS) {
    for (const [key, value] of Object.entries(validOf(name))) {
      const data = validOf(name);
      data[key] = wrongFor(value);
      assert.deepEqual(paths(name, data), [`$.${key}`], `${name}.${key}`);
    }
  }
  const nested = [
    ['cover_spec', (d) => { d.slots = 'x'; }, '$.slots'],
    ['cover_spec', (d) => { d.slots[0] = 5; }, '$.slots[0]'],
    ['cover_spec', (d) => { d.slots[0].slot_id = 5; }, '$.slots[0].slot_id'],
    ['cover_spec', (d) => { d.slots[0].lines[0] = 5; }, '$.slots[0].lines[0]'],
    ['qa_result', (d) => { d.gates[0] = 5; }, '$.gates[0]'],
    ['qa_result', (d) => { d.gates[0].detail = 5; }, '$.gates[0].detail'],
    ['qa_result', (d) => { d.semantic = 5; }, '$.semantic'],
    ['qa_result', (d) => { d.semantic.reasons = 5; }, '$.semantic.reasons'],
    ['qa_result', (d) => { d.semantic.reasons = [5]; }, '$.semantic.reasons[0]'],
  ];
  for (const [name, mutate, path] of nested) {
    const data = validOf(name);
    mutate(data);
    assert.deepEqual(paths(name, data), [path], path);
  }
});

test('nested required fields: slot_id, kind and lines of a slot; gate_id, status and detail of a gate', () => {
  for (const key of ['slot_id', 'kind', 'lines']) {
    const data = validOf('cover_spec');
    delete data.slots[1][key];
    assert.deepEqual(errorsOf('cover_spec', data), [`$.slots[1].${key}: missing required property`], key);
  }
  for (const key of ['gate_id', 'status', 'detail']) {
    const data = validOf('qa_result');
    delete data.gates[2][key];
    assert.deepEqual(errorsOf('qa_result', data), [`$.gates[2].${key}: missing required property`], key);
  }
});

test('rules that the schema cannot express are NOT enforced by it (they belong to code validators)', () => {
  // Documented limits, proven here so nobody mistakes the schema for the whole contract.
  const qa = validOf('qa_result');
  qa.gates[5].status = 'waived'; // waived QA-CFM must be refused by code
  qa.gates.push(clone(qa.gates[0])); // duplicate gate_id
  qa.passed = false; // inconsistent with every gate passed
  assert.deepEqual(errorsOf('qa_result', qa), []);
  const cover = validOf('cover_spec');
  cover.slots.push(clone(cover.slots[0])); // duplicate slot_id
  cover.slots[0].slot_id = 'slot_inexistente'; // id outside the slot map
  assert.deepEqual(errorsOf('cover_spec', cover), []);
});

test('fixture text is NFC, so widths and blocklist matching see the same characters everywhere', () => {
  for (const name of CONTRACTS) {
    for (const file of readdirSync(fixtureDir(name))) {
      const text = readFileSync(join(fixtureDir(name), file), 'utf8');
      assert.equal(text, text.normalize('NFC'), `${name}/${file}`);
    }
  }
});

test('fixtures are synthetic: fixed all-zero job ids, and no model names or private markers', () => {
  for (const name of CONTRACTS) {
    for (const file of readdirSync(fixtureDir(name))) {
      const text = readFileSync(join(fixtureDir(name), file), 'utf8');
      assert.match(text, /"job_id": "00000000-0000-4000-8000-0000000000\d\d"/, `${name}/${file}`);
      assert.doesNotMatch(text, /claude|gpt|gemini|llama|opus|sonnet|haiku/i, `${name}/${file}`);
      assert.doesNotMatch(text, /"config_source": "private"/, `${name}/${file}`);
    }
  }
});
