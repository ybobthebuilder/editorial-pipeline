#!/usr/bin/env node
'use strict';

// Loads config/baseline/*.json into editorial.config_baseline, in one transaction.
//
//   node scripts/seed-baseline.js --version <v> [--dir config/baseline]
//
// It refuses to write when the files do not match .checksums. It needs a role that can write
// config_baseline (the deploy role, not n8n_pipeline). Connection comes from the PG* variables.
// Exit codes: 0 seeded, 1 files rejected or database error, 2 bad usage.

const { loadVerified, seed, parseArgs } = require('./lib/baseline');

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), ['version', 'dir']);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  if (!args.version || args.version.trim() === '') {
    console.error('uso: seed-baseline.js --version <versão> [--dir config/baseline]');
    return 2;
  }
  const { entries, errors } = loadVerified(args.dir || 'config/baseline');
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
