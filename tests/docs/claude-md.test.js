'use strict';

// Keeps CLAUDE.md from aging. The map of the public repository ("Estrutura do Repo Público") is
// checked against the tracked files, the numbered sections must stay 1..N in order, and every
// "CLAUDE.md §N" citation in the repository must point to a section that exists.
//
// The rules live in four small functions, tested on synthetic input (the unit tests) and then run on
// the real CLAUDE.md and the real `git ls-files` (the last three tests). A rule that does not break
// its unit test is not a rule.
//
// Map conventions (CLAUDE.md, "Estrutura do Repo Público"): a name that ends in "/" is a directory;
// "# (planejado)" at the start of the comment marks something that does not exist yet, and its
// children inherit the mark; "..." is skipped; "*" in a name matches inside one directory; a name
// with "/" inside is a path under its parent.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..');
const TEXT_FILE = /\.(md|js|json|sql|yml|toml)$/;

const LINE = /^((?:│   |    )*)(?:├── |└── )(\S+)(?:\s+#\s*(.*))?$/;

function extractMapBlock(text) {
  const heading = text.indexOf('\n## Estrutura do Repo Público');
  if (heading < 0) throw new Error('seção "Estrutura do Repo Público" não encontrada');
  const open = text.indexOf('\n```', heading);
  const close = open < 0 ? -1 : text.indexOf('\n```', open + 4);
  if (open < 0 || close < 0) throw new Error('bloco da árvore não encontrado');
  return text.slice(open + 4, close);
}

function parseMap(block) {
  const lines = block.split('\n').filter((line) => line.trim() !== '');
  if (lines[0] !== 'editorial-pipeline/') throw new Error('a primeira linha da árvore deve ser editorial-pipeline/');
  const stack = [];
  const entries = [];
  for (const line of lines.slice(1)) {
    const match = LINE.exec(line);
    if (!match) throw new Error(`linha da árvore não reconhecida: ${line}`);
    const depth = match[1].length / 4;
    const name = match[2];
    const comment = match[3] || '';
    if (name === '...') continue;
    if (depth > stack.length) throw new Error(`recuo inconsistente: ${line}`);
    stack.length = depth;
    const parent = depth === 0 ? { path: '', planned: false } : stack[depth - 1];
    const isDir = name.endsWith('/');
    const base = isDir ? name.slice(0, -1) : name;
    const entry = {
      path: parent.path === '' ? base : `${parent.path}/${base}`,
      isDir,
      depth,
      planned: parent.planned || comment.startsWith('(planejado)'),
    };
    stack[depth] = entry;
    entries.push(entry);
  }
  return entries;
}

function indexFiles(files) {
  const dirs = new Set();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  return { files: new Set(files), dirs };
}

function exists(entry, index) {
  const pool = entry.isDir ? index.dirs : index.files;
  if (!entry.path.includes('*')) return pool.has(entry.path);
  const pattern = new RegExp(`^${entry.path.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
  return [...pool].some((candidate) => pattern.test(candidate));
}

function checkMap(entries, files) {
  const index = indexFiles(files);
  const errors = [];
  for (const entry of entries) {
    const found = exists(entry, index);
    if (!entry.planned && !found) errors.push(`ausente: ${entry.path}`);
    if (entry.planned && found) errors.push(`marca (planejado) obsoleta: ${entry.path}`);
  }
  // Coverage: every tracked top-level name, and every directory under tests/, must be in the map.
  const mapped = new Set(entries.filter((entry) => entry.depth === 0).map((entry) => entry.path.split('/')[0]));
  const mappedTests = new Set(entries.filter((entry) => entry.path.startsWith('tests/')).map((entry) => entry.path.split('/')[1]));
  for (const file of files) {
    const [top, second] = file.split('/');
    if (!mapped.has(top)) errors.push(`fora do mapa: ${top}`);
    if (top === 'tests' && second !== undefined && file.split('/').length > 2 && !mappedTests.has(second)) {
      errors.push(`fora do mapa: tests/${second}`);
    }
  }
  return [...new Set(errors)];
}

function checkSections(text) {
  const numbers = [...text.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));
  if (numbers.length === 0) return ['nenhuma seção numerada'];
  const errors = [];
  numbers.forEach((number, i) => {
    if (number !== i + 1) errors.push(`seção ${number} na posição ${i + 1}`);
  });
  return errors;
}

function checkCitations(claudeText, documents) {
  const last = [...claudeText.matchAll(/^## (\d+)\. /gm)].length;
  const errors = [];
  for (const [file, text] of Object.entries(documents)) {
    for (const match of text.matchAll(/CLAUDE\.md`?,? ?§ ?(\d+)/g)) {
      const number = Number(match[1]);
      if (number < 1 || number > last) errors.push(`${file}: §${number}`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Unit tests, on synthetic input.
// ---------------------------------------------------------------------------------------------

const SYNTHETIC = [
  'editorial-pipeline/',
  '├── README.md',
  '├── docs/',
  '│   ├── A.md                        # texto',
  '│   ├── *-proposal.md               # glob',
  '│   └── B.md                        # (planejado) ainda não existe',
  '├── pasta/sub/',
  '│   ├── x.sql',
  '│   └── ...',
  '├── novo/                           # (planejado)',
  '│   ├── filho.json',
  '│   └── dentro/',
  '│       └── neto.json',
  '└── tests/',
  '    └── um/',
].join('\n');

const FILES = ['README.md', 'docs/A.md', 'docs/x-proposal.md', 'pasta/sub/x.sql', 'tests/um/t.js'];

test('parseMap: compõe caminhos, herda o planejado, expande nomes com barra e pula "..."', () => {
  const byPath = Object.fromEntries(parseMap(SYNTHETIC).map((entry) => [entry.path, entry]));
  assert.deepEqual(Object.keys(byPath), [
    'README.md', 'docs', 'docs/A.md', 'docs/*-proposal.md', 'docs/B.md', 'pasta/sub', 'pasta/sub/x.sql',
    'novo', 'novo/filho.json', 'novo/dentro', 'novo/dentro/neto.json', 'tests', 'tests/um',
  ]);
  assert.equal(byPath['docs/B.md'].planned, true);
  assert.equal(byPath['docs/A.md'].planned, false);
  assert.equal(byPath['novo'].planned, true);
  assert.equal(byPath['novo/filho.json'].planned, true, 'o filho herda');
  assert.equal(byPath['novo/dentro/neto.json'].planned, true, 'o neto herda');
  assert.equal(byPath['pasta/sub'].isDir, true);
  assert.equal(byPath['pasta/sub/x.sql'].isDir, false);
  assert.equal(byPath['tests/um'].depth, 1);
});

test('parseMap: recusa raiz errada, linha irreconhecível e recuo impossível', () => {
  assert.throws(() => parseMap('outra/\n├── a'), /primeira linha/);
  assert.throws(() => parseMap('editorial-pipeline/\nlinha solta'), /não reconhecida/);
  assert.throws(() => parseMap('editorial-pipeline/\n│   ├── a'), /recuo/);
});

test('parseMap: a marca (planejado) só vale no começo do comentário', () => {
  const [entry] = parseMap('editorial-pipeline/\n└── a.md    # nota (planejado) no meio');
  assert.equal(entry.planned, false);
});

test('parseMap: o recuo não pode saltar um nível, nem depois de um ramo mais fundo', () => {
  const lines = ['editorial-pipeline/', '├── a/', '│   └── b/', '│       └── c', '└── d', '        └── e'];
  assert.throws(() => parseMap(lines.join('\n')), /recuo/);
  assert.equal(parseMap(lines.slice(0, 5).join('\n')).length, 4);
});

test('extractMapBlock: devolve o primeiro bloco depois do título e recusa a falta de título ou de bloco', () => {
  const doc = 'x\n## Estrutura do Repo Público\ntexto\n```\nBLOCO\n```\n```\nOUTRO\n```\n';
  assert.equal(extractMapBlock(doc).trim(), 'BLOCO');
  assert.throws(() => extractMapBlock('x\n```\nBLOCO\n```\n'), /não encontrada/);
  assert.throws(() => extractMapBlock('x\n## Estrutura do Repo Público\ntexto\n'), /bloco/);
  assert.throws(() => extractMapBlock('x\n## Estrutura do Repo Público\n```\nsem fechar\n'), /bloco/);
});

test('checkMap: o mapa coerente passa', () => {
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), FILES), []);
});

test('checkMap: item sem marca que não existe é erro', () => {
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), FILES.filter((file) => file !== 'docs/A.md')), ['ausente: docs/A.md']);
});

test('checkMap: diretório sem marca que não existe é erro', () => {
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), FILES.filter((file) => !file.startsWith('pasta/'))), ['ausente: pasta/sub', 'ausente: pasta/sub/x.sql']);
});

test('checkMap: marca (planejado) em algo que já existe é obsoleta', () => {
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), [...FILES, 'docs/B.md']), ['marca (planejado) obsoleta: docs/B.md']);
});

test('checkMap: o filho de um diretório planejado que já existe também é obsoleto', () => {
  const errors = checkMap(parseMap(SYNTHETIC), [...FILES, 'novo/filho.json']);
  assert.deepEqual(errors, ['marca (planejado) obsoleta: novo', 'marca (planejado) obsoleta: novo/filho.json']);
});

test('checkMap: o glob exige ao menos um arquivo no mesmo diretório', () => {
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), FILES.filter((file) => file !== 'docs/x-proposal.md')), ['ausente: docs/*-proposal.md']);
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), [...FILES.filter((file) => file !== 'docs/x-proposal.md'), 'docs/sub/x-proposal.md']), ['ausente: docs/*-proposal.md']);
});

test('checkMap: o ponto de um glob não é curinga', () => {
  const entries = parseMap('editorial-pipeline/\n└── d/\n    └── a.*');
  assert.deepEqual(checkMap(entries, ['d/aXb']), ['ausente: d/a.*']);
  assert.deepEqual(checkMap(entries, ['d/a.b']), []);
});

test('checkMap: um arquivo não vale como diretório, nem o contrário', () => {
  assert.deepEqual(checkMap(parseMap('editorial-pipeline/\n└── a/'), ['a']), ['ausente: a']);
  assert.deepEqual(checkMap(parseMap('editorial-pipeline/\n└── a'), ['a/b']), ['ausente: a']);
});

test('checkMap: nome de topo rastreado e ausente do mapa é erro', () => {
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), [...FILES, 'solto.txt', 'extra/arq.js']), ['fora do mapa: solto.txt', 'fora do mapa: extra']);
});

test('checkMap: diretório novo em tests/ ausente do mapa é erro; arquivo direto em tests/ não', () => {
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), [...FILES, 'tests/novo/t.js']), ['fora do mapa: tests/novo']);
  assert.deepEqual(checkMap(parseMap(SYNTHETIC), [...FILES, 'tests/_harness.js']), []);
});

test('checkSections: 1..N em ordem passa; salto, repetição, ordem trocada e ausência falham', () => {
  const doc = (...numbers) => numbers.map((n) => `## ${n}. Título\ntexto\n`).join('\n');
  assert.deepEqual(checkSections(doc(1, 2, 3)), []);
  assert.deepEqual(checkSections(doc(1, 3)), ['seção 3 na posição 2']);
  assert.deepEqual(checkSections(doc(1, 1)), ['seção 1 na posição 2']);
  assert.deepEqual(checkSections(doc(2, 1)), ['seção 2 na posição 1', 'seção 1 na posição 2']);
  assert.deepEqual(checkSections(doc(2)), ['seção 2 na posição 1']);
  assert.deepEqual(checkSections('# sem seções\n'), ['nenhuma seção numerada']);
  assert.deepEqual(checkSections('## Sem número\n### 1. Subseção\n'), ['nenhuma seção numerada']);
});

// The citations are built by a function so that this file does not contain a citation of its own:
// the real-repository test below scans every tracked file, this one included.
const cite = (number, glue = ' ', after = '') => `CLAUDE.md${glue}§${after}${number}`;

test('checkCitations: aponta só a citação fora de 1..N', () => {
  const claude = '## 1. A\n## 2. B\n## 3. C\n';
  const documents = {
    'a.md': `ver ${cite(3, '` ')}, ${cite(1)} e ${cite(2, ', ', ' ')}`,
    'b.md': `ver ${cite(4, '` ')}`,
    'c.md': `ver ${cite(0)} e CLAUDE.md §segurança`,
  };
  assert.deepEqual(checkCitations(claude, documents), ['b.md: §4', 'c.md: §0']);
});

// ---------------------------------------------------------------------------------------------
// The real repository.
// ---------------------------------------------------------------------------------------------

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return output.split('\0').filter(Boolean).map((file) => file.normalize('NFC'));
}

const CLAUDE_MD = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').normalize('NFC');

test('o mapa do CLAUDE.md confere com os arquivos rastreados', () => {
  const entries = parseMap(extractMapBlock(CLAUDE_MD));
  const files = trackedFiles();
  assert.ok(files.length > 100, 'git ls-files devolveu poucos arquivos: o teste estaria vazio');
  assert.ok(entries.some((entry) => entry.planned) && entries.some((entry) => !entry.planned), 'o mapa deve ter itens com e sem a marca (planejado)');
  assert.deepEqual(checkMap(entries.map((entry) => ({ ...entry, path: entry.path.normalize('NFC') })), files), []);
});

test('as seções numeradas do CLAUDE.md seguem 1..N em ordem', () => {
  assert.deepEqual(checkSections(CLAUDE_MD), []);
  assert.ok([...CLAUDE_MD.matchAll(/^## (\d+)\. /gm)].length >= 10);
});

test('toda citação "CLAUDE.md §N" no repositório aponta para uma seção que existe', () => {
  const documents = {};
  for (const file of trackedFiles()) {
    if (TEXT_FILE.test(file)) documents[file] = readFileSync(join(ROOT, file), 'utf8').normalize('NFC');
  }
  assert.ok(Object.keys(documents).length > 50);
  assert.deepEqual(checkCitations(CLAUDE_MD, documents), []);
});
