#!/usr/bin/env node
'use strict';

// Checks that config/baseline/*.json, .checksums and editorial.config_baseline agree.
//
//   node scripts/verify-baseline.js [--dir config/baseline] [--skills skills] [--version <v>] [--offline true]
//
// --skills also checks the prompts (decision D-12). With --skills and no --dir, only the prompts are
// checked, and rows that are not prompts are left alone.
//
// Read-only: it works with the n8n_pipeline role. --offline true checks only the files against
// .checksums and does not touch the database. Exit codes: 0 consistent, 1 mismatch, 2 bad usage.

const { loadVerified, loadVerifiedSkills, readDatabaseRows, compareWithDatabase, parseArgs } = require('./lib/baseline');

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), ['dir', 'skills', 'version', 'offline']);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const scope = { baseline: args.dir !== undefined || args.skills === undefined, skills: args.skills !== undefined };
  const entries = [];
  const errors = [];
  if (scope.baseline) {
    const loaded = loadVerified(args.dir || 'config/baseline');
    entries.push(...loaded.entries);
    errors.push(...loaded.errors);
  }
  if (scope.skills) {
    const loaded = loadVerifiedSkills(args.skills);
    entries.push(...loaded.entries);
    errors.push(...loaded.errors);
  }
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
    problems = compareWithDatabase(entries, readDatabaseRows(), args.version, scope);
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
