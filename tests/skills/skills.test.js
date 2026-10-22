'use strict';

// The SKILL.md files are manuals read by an LLM node, but their shape is checkable:
// frontmatter, size, the JSON they show, and the boundary that keeps them out of agent mode.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..', 'skills');
const dirs = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

function parse(name) {
  const text = readFileSync(join(ROOT, name, 'SKILL.md'), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(match, `${name}: frontmatter ausente`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([a-z-]+): (.+)$/.exec(line);
    assert.ok(kv, `${name}: linha de frontmatter inválida: ${line}`);
    meta[kv[1]] = kv[2];
  }
  return { text, meta, body: match[2] };
}

test('there is at least one skill, so the suite cannot pass by being empty', () => {
  assert.ok(dirs.length >= 1);
});

for (const name of dirs) {
  test(`${name}: SKILL.md exists, with name equal to the folder and a description, and nothing else in the frontmatter`, () => {
    assert.ok(existsSync(join(ROOT, name, 'SKILL.md')));
    const { meta } = parse(name);
    assert.deepEqual(Object.keys(meta).sort(), ['description', 'name']);
    assert.equal(meta.name, name);
    assert.match(meta.name, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(meta.description.length >= 40);
  });

  test(`${name}: stays under 500 lines and has balanced code fences`, () => {
    const { text } = parse(name);
    assert.ok(text.split('\n').length < 500);
    assert.equal(text.split('\n').filter((l) => l.startsWith('```')).length % 2, 0);
  });

  test(`${name}: every json block parses, and no block asks for tools or a model`, () => {
    const { body } = parse(name);
    const blocks = [...body.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    assert.ok(blocks.length >= 2, 'esperava ao menos a entrada e a saída em JSON');
    for (const block of blocks) {
      const data = JSON.parse(block);
      assert.equal('tools' in data || 'model' in data, false);
    }
  });

  test(`${name}: the body is the prompt, so it carries no status banner, and it states that it runs as a single node without tools`, () => {
    const { body } = parse(name);
    assert.doesNotMatch(body, /RASCUNHO|PROPOSED|Revisão por digest/);
    assert.match(body, /sem ferramentas/i);
  });

}

const REPO = join(__dirname, '..', '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('skills/.checksums lists every SKILL.md with the sha256 of its bytes, and nothing else', () => {
  const lines = readFileSync(join(ROOT, '.checksums'), 'utf8').trim().split('\n');
  const entries = lines.map((l) => {
    const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(l);
    assert.ok(m, `linha inválida em .checksums: ${l}`);
    return [m[2], m[1]];
  });
  // Object.fromEntries would let a later duplicate silently replace an earlier line.
  assert.equal(new Set(entries.map(([path]) => path)).size, entries.length, '.checksums lista o mesmo arquivo duas vezes');
  const listed = Object.fromEntries(entries);
  assert.deepEqual(Object.keys(listed).sort(), dirs.map((d) => `${d}/SKILL.md`));
  for (const name of dirs) {
    const digest = createHash('sha256').update(readFileSync(join(ROOT, name, 'SKILL.md'))).digest('hex');
    assert.equal(listed[`${name}/SKILL.md`], digest, `${name}: SKILL.md mudou sem atualizar .checksums`);
  }
});

test('the blocklist shown in the copywriter example is exactly config/baseline/cfm_blocklist.json (one source, no drift)', () => {
  const { body } = parse('copywriter-cfm');
  const blocks = [...body.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
  // The format block shows ["string"]; the example block shows the real terms.
  const inputs = blocks.filter((b) => Array.isArray(b.blocklist) && !(b.blocklist.length === 1 && b.blocklist[0] === 'string'));
  assert.equal(inputs.length, 1, 'esperava um exemplo de entrada com blocklist');
  assert.deepEqual(inputs[0].blocklist, readJson(join(REPO, 'config', 'baseline', 'cfm_blocklist.json')));
});

test('no other skill carries a copy of the list: the terms live in the config', () => {
  const terms = readJson(join(REPO, 'config', 'baseline', 'cfm_blocklist.json'));
  for (const name of ['art-director', 'qa-validator']) {
    const { body } = parse(name);
    for (const term of terms) assert.equal(body.toLowerCase().includes(term.toLowerCase()), false, `${name} cita "${term}"`);
  }
});
