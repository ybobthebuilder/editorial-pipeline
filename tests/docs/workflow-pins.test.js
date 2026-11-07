'use strict';

// Every GitHub Action used by a workflow must be pinned to a full commit SHA, with the release in a
// comment ("uses: owner/repo@<40 hex> # v1.2.3"). A tag can be moved after the fact; a SHA cannot.
// The comment keeps the pull requests of .github/dependabot.yml readable.
//
// Exempt: local actions ("./path"). A Docker image must be pinned by digest.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..');
const USES = /^\s*(?:-\s+)?uses:\s*(\S+)\s*(?:#\s*(.*?))?\s*$/;

function checkPins(workflows) {
  const errors = [];
  let count = 0;
  for (const [file, text] of Object.entries(workflows)) {
    text.split('\n').forEach((line, i) => {
      const match = USES.exec(line);
      if (!match) return;
      count++;
      const target = match[1].replace(/^["']|["']$/g, '');
      const where = `${file}:${i + 1}`;
      if (target.startsWith('./')) return;
      if (target.startsWith('docker://')) {
        if (!/@sha256:[0-9a-f]{64}$/.test(target)) errors.push(`${where}: imagem sem digest`);
        return;
      }
      const at = target.lastIndexOf('@');
      if (at < 0 || !/^[0-9a-f]{40}$/.test(target.slice(at + 1))) {
        errors.push(`${where}: ${target} não está fixada por SHA`);
      } else if (!/^v\d+(\.\d+){1,2}$/.test(match[2] || '')) {
        errors.push(`${where}: ${target} sem comentário de versão`);
      }
    });
  }
  return { errors, count };
}

const SHA = '0123456789abcdef0123456789abcdef01234567';
const uses = (target, comment = '', pad = '      - ') => `${pad}uses: ${target}${comment}`;

test('checkPins: SHA de 40 hexadecimais com comentário de versão passa', () => {
  const text = [uses(`actions/checkout@${SHA}`, ' # v4.4.0'), uses(`actions/setup-go@${SHA}`, ' # v7.0.0'), uses(`o/r@${SHA}`, ' # v1.2')].join('\n');
  assert.deepEqual(checkPins({ 'a.yml': text }), { errors: [], count: 3 });
});

test('checkPins: tag, ramo e ausência de ref falham, com o número da linha', () => {
  const text = ['name: x', uses('actions/checkout@v4'), uses('actions/checkout@main'), uses('actions/checkout')].join('\n');
  assert.deepEqual(checkPins({ 'a.yml': text }).errors, [
    'a.yml:2: actions/checkout@v4 não está fixada por SHA',
    'a.yml:3: actions/checkout@main não está fixada por SHA',
    'a.yml:4: actions/checkout não está fixada por SHA',
  ]);
});

test('checkPins: SHA curto, longo, com maiúscula ou com sufixo falha, mesmo com comentário de versão', () => {
  const v = ' # v1.0.0';
  const text = [uses(`o/r@${SHA.slice(1)}`, v), uses(`o/r@${SHA}0`, v), uses(`o/r@${SHA.toUpperCase()}`, v), uses(`o/r@x${SHA}`, v), uses(`o/r@${SHA}x`, v)].join('\n');
  const { errors } = checkPins({ 'a.yml': text });
  assert.equal(errors.length, 5);
  assert.ok(errors.every((error) => error.endsWith('não está fixada por SHA')));
});

test('checkPins: um SHA sem "@" não é uma referência fixada', () => {
  assert.deepEqual(checkPins({ 'a.yml': uses(SHA, ' # v1.0.0') }).errors, [`a.yml:1: ${SHA} não está fixada por SHA`]);
});

test('checkPins: SHA sem comentário de versão, ou com comentário que não é versão, falha', () => {
  const text = [uses(`o/r@${SHA}`), uses(`o/r@${SHA}`, ' # latest'), uses(`o/r@${SHA}`, ' # v4'), uses(`o/r@${SHA}`, ' # v4.4.0.1')].join('\n');
  assert.deepEqual(checkPins({ 'a.yml': text }).errors.map((e) => e.split(' ').pop()), ['versão', 'versão', 'versão', 'versão']);
  assert.equal(checkPins({ 'a.yml': text }).errors.length, 4);
});

test('checkPins: aceita aspas e o uses sem hífen (workflow reutilizável)', () => {
  const text = [uses(`"o/r@${SHA}"`, ' # v1.0.0'), uses(`o/r/.github/workflows/w.yml@${SHA}`, ' # v2.1', '    ')].join('\n');
  assert.deepEqual(checkPins({ 'a.yml': text }), { errors: [], count: 2 });
  assert.equal(checkPins({ 'a.yml': uses('"o/r@v1"') }).errors.length, 1);
});

test('checkPins: ação local é isenta; imagem Docker exige digest', () => {
  assert.deepEqual(checkPins({ 'a.yml': uses('./.github/actions/x') }), { errors: [], count: 1 });
  assert.deepEqual(checkPins({ 'a.yml': uses(`docker://alpine@sha256:${'a'.repeat(64)}`) }).errors, []);
  assert.deepEqual(checkPins({ 'a.yml': uses('docker://alpine:3.20') }).errors, ['a.yml:1: imagem sem digest']);
});

test('checkPins: o que não é uses é ignorado, e cada arquivo é conferido', () => {
  const text = ['name: uses', '      run: echo "uses: x@v1"', '      # uses: x@v1'].join('\n');
  assert.deepEqual(checkPins({ 'a.yml': text }), { errors: [], count: 0 });
  assert.deepEqual(checkPins({ 'a.yml': uses(`o/r@${SHA}`, ' # v1.0.0'), 'b.yml': uses('o/r@v1') }).errors, ['b.yml:1: o/r@v1 não está fixada por SHA']);
});

test('as Actions dos workflows do repositório estão fixadas por SHA', () => {
  const dir = join(ROOT, '.github', 'workflows');
  const names = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
  assert.ok(names.length >= 3, 'poucos workflows: o teste estaria vazio');
  const workflows = Object.fromEntries(names.map((name) => [`.github/workflows/${name}`, readFileSync(join(dir, name), 'utf8')]));
  const { errors, count } = checkPins(workflows);
  assert.ok(count >= 6, 'poucos usos de Action: o teste estaria vazio');
  assert.deepEqual(errors, []);
});
