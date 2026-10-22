#!/usr/bin/env node
'use strict';

// Loads config/baseline/*.json into editorial.config_baseline, in one transaction.
//
//   node scripts/seed-baseline.js --version <v> [--dir config/baseline] [--skills skills]
//
// --skills also loads the prompts of skills/<name>/SKILL.md (decision D-12). With --skills and no
// --dir, only the prompts are loaded.
//
// It refuses to write when the files do not match .checksums. It needs a role that can write
// config_baseline (the deploy role, not n8n_pipeline). Connection comes from the PG* variables.
// Exit codes: 0 seeded, 1 files rejected or database error, 2 bad usage.

const { loadVerified, loadVerifiedSkills, seed, parseArgs } = require('./lib/baseline');

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), ['version', 'dir', 'skills']);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  if (!args.version || args.version.trim() === '') {
    console.error('uso: seed-baseline.js --version <versão> [--dir config/baseline] [--skills skills]');
    return 2;
  }
  const entries = [];
  const errors = [];
  if (args.dir !== undefined || args.skills === undefined) {
    const loaded = loadVerified(args.dir || 'config/baseline');
    entries.push(...loaded.entries);
    errors.push(...loaded.errors);
  }
  if (args.skills !== undefined) {
    const loaded = loadVerifiedSkills(args.skills);
    entries.push(...loaded.entries);
    errors.push(...loaded.errors);
  }
  if (errors.length) {
    errors.forEach((e) => console.error(`ERRO: ${e}`));
    console.error('Nada foi gravado.');
    return 1;
  }
  try {
    seed(entries, args.version);
  } catch (error) {
    console.error(`ERRO: ${error.message}`);
    console.error('Nada foi gravado.');
    return 1;
  }
  console.log(`OK: ${entries.length} chave(s) gravada(s) na versão ${args.version}`);
  return 0;
}

process.exitCode = main();
