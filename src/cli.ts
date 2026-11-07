#!/usr/bin/env node
// The AIC command line. It reads the contract from disk, so nothing leaves the machine.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { implementationPlan, moduleBrief } from './agent/brief.ts';
import { validationReport } from './agent/report.ts';
import { conformanceVerdict, verificationChecklist, type CheckResult } from './agent/verify.ts';
import { bundle } from './core/bundle.ts';
import type { Contract } from './core/model.ts';
import { toYaml } from './core/yaml.ts';
import { DOCUMENT_NAMES, packageRoot, readDocument, type DocumentName } from './documents.ts';

const HELP = `aic: work with AIC architecture contracts (https://aicspec.dev)

Usage: aic <command> [arguments] [options]

Commands
  validate [contract]        Violations, warnings, open items and maturity. Exits 1 if there are violations
  plan                       The order to build Modules in, and what blocks each
  brief <module>             One Module's contract as a bounded task
  checklist [module]         Everything an implementation must honour, as items to check
  verdict <results.json|->   A conformance verdict from your checklist results. Exits 0 only if conformant
  reference <document>       ${DOCUMENT_NAMES.join(', ')}
  bundle [contract]          Joins a contract split with $ref into one file (-o to write it)
  skill install              Installs the AIC skill for Claude Code (--global, or --dir for other agents)

Options
  -c, --contract <path>      The contract. Defaults to aic.yaml, or the only *.aic.yaml, in this directory
  -m, --module <id>          verdict: the Module the checklist was limited to
  -o, --output <path>        bundle: where to write the result
      --json                 validate: print the full report as JSON
      --global               skill install: into ~/.claude/skills instead of ./.claude/skills
      --dir <path>           skill install: into this skills directory instead
  -v, --version              Print the version
  -h, --help                 Print this help

Every command except validate and bundle prints JSON.`;

class UsageError extends Error {}

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

function findContract(given?: string): string {
  if (given) return given;
  if (existsSync('aic.yaml')) return 'aic.yaml';
  const candidates = readdirSync('.').filter((f) => f.endsWith('.aic.yaml'));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) throw new UsageError(`Several contracts here (${candidates.join(', ')}). Choose one with --contract.`);
  throw new UsageError('No aic.yaml in this directory. Pass one with --contract, or design one at https://aicspec.dev/editor/ and save it as aic.yaml.');
}

// A contract split with $ref is joined first, so every command sees one complete contract.
function loadContract(path: string): Contract {
  const contract = bundle(path, (p) => readFileSync(p, 'utf8'));
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) throw new Error(`${path} does not hold an AIC contract.`);
  return contract;
}

function printValidation(c: Contract) {
  const report = validationReport(c);
  const titles = { error: 'Violations', warning: 'Warnings', info: 'Unverified or open' } as const;
  for (const severity of ['error', 'warning', 'info'] as const) {
    const list = report.problems.filter((p) => p.severity === severity);
    if (!list.length) continue;
    console.log(`\n${titles[severity]} (${list.length})`);
    for (const p of list) console.log(`  [${p.code}] ${p.message}${p.path ? `  (${p.path})` : ''}`);
  }
  const { counts } = report, m = report.maturity.summary;
  console.log(`\n${counts.error} violations, ${counts.warning} warnings, ${counts.info} reported as unverified or open.`);
  console.log(`Maturity: ${m.verifiable} Verifiable, ${m.specified} Specified, ${m.draft} Draft, ${m.none} below Draft.`);
  return report;
}

function readResults(source: string): CheckResult[] {
  const text = source === '-' ? readFileSync(0, 'utf8') : readFileSync(source, 'utf8');
  let value: any;
  try { value = JSON.parse(text); } catch (e: any) { throw new UsageError(`The results are not valid JSON: ${e.message}`); }
  const list = Array.isArray(value) ? value : value?.results;
  const statuses = ['pass', 'fail', 'unverified'];
  if (!Array.isArray(list) || !list.every((r) => r && typeof r.id === 'string' && statuses.includes(r.status))) {
    throw new UsageError('The results must be a JSON array of { "id", "status": "pass" | "fail" | "unverified", "evidence" }.');
  }
  return list;
}

function installSkill(options: { global?: boolean; dir?: string }) {
  const skills = options.dir ? resolve(options.dir) : options.global ? join(homedir(), '.claude', 'skills') : resolve('.claude', 'skills');
  const target = join(skills, 'aic');
  const existed = existsSync(target);
  if (existed) rmSync(target, { recursive: true });
  mkdirSync(skills, { recursive: true });
  cpSync(join(packageRoot(), 'skills', 'aic'), target, { recursive: true });
  console.log(`${existed ? 'Updated' : 'Installed'} the AIC skill in ${target}`);
  if (!options.dir && !options.global) console.log('Commit .claude/skills/aic so everyone working on this repository gets it.');
}

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      contract: { type: 'string', short: 'c' },
      module: { type: 'string', short: 'm' },
      output: { type: 'string', short: 'o' },
      json: { type: 'boolean' },
      global: { type: 'boolean' },
      dir: { type: 'string' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, arg, extra] = positionals;

  if (values.version) {
    console.log(JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')).version);
    return 0;
  }
  if (values.help || !command || command === 'help') { console.log(HELP); return command || values.help ? 0 : 2; }

  switch (command) {
    case 'validate': {
      const c = loadContract(findContract(values.contract ?? arg));
      const report = values.json ? validationReport(c) : printValidation(c);
      if (values.json) print(report);
      return report.valid ? 0 : 1;
    }
    case 'plan':
      print(implementationPlan(loadContract(findContract(values.contract))));
      return 0;
    case 'brief':
      if (!arg) throw new UsageError('Name the Module: aic brief <module>. "aic plan" lists them.');
      print(moduleBrief(loadContract(findContract(values.contract)), arg));
      return 0;
    case 'checklist':
      print(verificationChecklist(loadContract(findContract(values.contract)), arg ?? values.module));
      return 0;
    case 'verdict': {
      if (!arg) throw new UsageError('Pass the results: aic verdict results.json, or "-" to read them from standard input.');
      const result = conformanceVerdict(loadContract(findContract(values.contract)), readResults(arg), values.module);
      print(result);
      return result.verdict === 'conformant' ? 0 : 1;
    }
    case 'reference':
      if (!arg || !DOCUMENT_NAMES.includes(arg as DocumentName)) throw new UsageError(`Choose a document: ${DOCUMENT_NAMES.join(', ')}.`);
      process.stdout.write(readDocument(arg as DocumentName));
      return 0;
    case 'bundle': {
      const text = toYaml(loadContract(findContract(values.contract ?? arg)));
      if (values.output) writeFileSync(values.output, text);
      else process.stdout.write(text);
      return 0;
    }
    case 'skill':
      if (arg !== 'install' || extra) throw new UsageError('Usage: aic skill install [--global | --dir <path>]');
      installSkill(values);
      return 0;
    default:
      throw new UsageError(`Unknown command "${command}". Run "aic --help".`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e: any) {
  console.error(e?.message ?? String(e));
  // 2 is a mistake in how the command was called; 1 is a problem with the contract, such as an unknown Module.
  process.exitCode = e instanceof UsageError || String(e?.code).startsWith('ERR_PARSE_ARGS') ? 2 : 1;
}
