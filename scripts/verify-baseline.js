#!/usr/bin/env node
'use strict';

// Checks that config/baseline/*.json, .checksums and editorial.config_baseline agree.
//
//   node scripts/verify-baseline.js [--dir config/baseline] [--version <v>] [--offline true]
//
// Read-only: it works with the n8n_pipeline role. --offline true checks only the files against
// .checksums and does not touch the database. Exit codes: 0 consistent, 1 mismatch, 2 bad usage.

const { loadVerified, readDatabaseRows, compareWithDatabase, parseArgs } = require('./lib/baseline');

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), ['dir', 'version', 'offline']);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const { entries, errors } = loadVerified(args.dir || 'config/baseline');
  if (errors.length) {
    errors.forEach((e) => console.error(`ERRO: ${e}`));
    return 1;
  }
  if (args.offline === 'true') {
    console.log(`OK: ${entries.length} arquivo(s) conferem com .checksums (banco não consultado)`);
    return 0;
  }
  let problems;
  try {
    problems = compareWithDatabase(entries, readDatabaseRows(), args.version);
  } catch (error) {
    console.error(`ERRO: ${error.message}`);
    return 1;
  }
  if (problems.length) {
    problems.forEach((e) => console.error(`ERRO: ${e}`));
    return 1;
  }
  console.log(`OK: ${entries.length} chave(s) conferem entre arquivos, .checksums e banco`);
  return 0;
}

process.exitCode = main();
