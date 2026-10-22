'use strict';

// The SKILL.md drafts are manuals read by an LLM node, but their shape is checkable:
// frontmatter, size, the JSON they show, and the boundary that keeps them out of agent mode.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, existsSync } = require('node:fs');
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

  test(`${name}: declares itself a draft and states that it runs as a single node without tools`, () => {
    const { body } = parse(name);
    assert.match(body, /RASCUNHO \(PROPOSED\)/);
    assert.match(body, /sem ferramentas/i);
  });
}
