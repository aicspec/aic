// The command line as an agent uses it: run in a directory that holds aic.yaml.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI = resolve('src/cli.ts');
const project = (example = 'online-shop') => {
  const dir = mkdtempSync(join(tmpdir(), 'aic-cli-'));
  copyFileSync(`examples/${example}.aic.yaml`, join(dir, 'aic.yaml'));
  return dir;
};
const run = (cwd: string, args: string[], input?: string) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
};

describe('aic command line', () => {
  it('finds aic.yaml and validates it', () => {
    const r = run(project(), ['validate']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('0 violations');
  });

  it('exits 1 when the contract has violations', () => {
    const dir = project();
    const text = readFileSync(join(dir, 'aic.yaml'), 'utf8').replace(/^system:/m, 'nonsense: true\nsystem:');
    writeFileSync(join(dir, 'aic.yaml'), text);
    const r = run(dir, ['validate', '--json']);
    expect(r.code).toBe(1);
    expect(r.json().valid).toBe(false);
  });

  it('says what to do when there is no contract', () => {
    const r = run(mkdtempSync(join(tmpdir(), 'aic-empty-')), ['plan']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('aicspec.dev/editor');
  });

  it('plans, briefs and lists checks as JSON', () => {
    const dir = project();
    const plan = run(dir, ['plan']).json();
    expect(plan.modules.map((m: any) => m.module)).toContain('order-service');
    expect(run(dir, ['brief', 'order-service']).json().ready).toBe(true);
    expect(run(dir, ['checklist', 'order-service']).json().length).toBeGreaterThan(0);
  });

  it('names the Modules when one is unknown', () => {
    const r = run(project(), ['brief', 'ghost']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('order-service');
  });

  it('computes a verdict from results on standard input', () => {
    const dir = project();
    const items = run(dir, ['checklist', 'order-service']).json();
    const results = items.map((i: any) => ({ id: i.id, status: 'pass', evidence: 'checked' }));
    const ok = run(dir, ['verdict', '-', '--module', 'order-service'], JSON.stringify(results));
    expect(ok.json().verdict).toBe('conformant');
    expect(ok.code).toBe(0);
    const partial = run(dir, ['verdict', '-', '--module', 'order-service'], JSON.stringify(results.slice(1)));
    expect(partial.json().verdict).not.toBe('conformant');
    expect(partial.code).toBe(1);
  });

  it('follows $ref across files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aic-split-'));
    writeFileSync(join(dir, 'aic.yaml'), 'aic: "0.1"\nsystem:\n  name: S\nmodules:\n  $ref: ./modules.yaml\n');
    writeFileSync(join(dir, 'modules.yaml'), 'm1:\n  name: One\n  does: Things.\n');
    expect(run(dir, ['plan']).json().modules[0].module).toBe('m1');
  });

  it('prints the documents that ship with it, with links that work outside this repository', () => {
    const spec = run(project(), ['reference', 'specification']).out;
    expect(spec).toContain('# AIC');
    expect(spec).not.toMatch(/\]\(\.\.\//);
  });

  it('installs the skill into a project', () => {
    const dir = project();
    expect(run(dir, ['skill', 'install']).code).toBe(0);
    expect(existsSync(join(dir, '.claude/skills/aic/SKILL.md'))).toBe(true);
    expect(run(dir, ['skill', 'install']).out).toContain('Updated');
  });

  it('rejects unknown commands and options as usage errors', () => {
    expect(run(project(), ['launch']).code).toBe(2);
    expect(run(project(), ['plan', '--nope']).code).toBe(2);
  });
});
