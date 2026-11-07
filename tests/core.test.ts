import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bundle } from '../src/core/bundle.ts';
import { computeMaturity } from '../src/core/maturity.ts';
import { parseContract, toYaml } from '../src/core/yaml.ts';
import { validateContract } from '../src/core/validate.ts';

const load = (name: string) => parseContract(readFileSync(`examples/${name}.aic.yaml`, 'utf8')).contract!;
const errors = (c: any) => validateContract(c).filter((p) => p.severity === 'error');
const codes = (c: any) => validateContract(c).map((p) => p.code);

describe('examples', () => {
  it('the online shop has no errors or warnings', () => {
    expect(validateContract(load('online-shop')).filter((p) => p.severity !== 'info')).toEqual([]);
  });
  it('the online shop is verifiable throughout', () => {
    const notThere = [...computeMaturity(load('online-shop'))].filter(([, m]) => m.level !== 'verifiable');
    expect(notThere).toEqual([]);
  });
  it('the sketch is valid and its gaps are visible', () => {
    const c = load('sketch');
    expect(errors(c)).toEqual([]);
    expect(codes(c)).toContain('open-decision');
    const m = computeMaturity(c);
    expect(m.get('links')!.missing.map((x) => x.text)).toContain('Resolve: Do short links expire?');
  });
});

describe('the mistakes the specification says a contract catches', () => {
  it('a shortcut into another module\'s data', () => {
    const c = load('online-shop');
    c.modules['notification-worker'].uses.push({ to: 'orders', modes: ['read'] });
    expect(codes(c)).toContain('store-access');
  });
  it('a reach across a Boundary', () => {
    const c = load('online-shop');
    c.stores.prices = { name: 'Prices', boundary: 'catalog', owner: 'catalog-service' };
    c.modules['catalog-service'].uses = [{ to: 'prices', modes: ['read'] }];
    c.modules['order-service'].uses.push({ to: 'prices', modes: ['read'] });
    expect(codes(c)).toContain('not-exposed');
  });
  it('a Boundary dependency that is not allowed', () => {
    const c = load('online-shop');
    c.boundaries.ordering.mayDependOn = [];
    expect(codes(c)).toContain('boundary-dependency');
  });
  it('at-least-once delivery with duplicates unstated', () => {
    const c = load('online-shop');
    delete c.modules['notification-worker'].activatedBy[0].onDuplicate;
    expect(codes(c)).toContain('duplicates-unstated');
  });
});

describe('structure', () => {
  it('rejects unknown properties and a missing system', () => {
    expect(errors({ aic: '0.1', system: { name: 'x', colour: 'red' } })[0].message).toContain('colour');
    expect(errors({ aic: '0.1' })[0].message).toContain('system');
  });
  it('reports only the relevant Activation branch', () => {
    const c: any = { aic: '0.1', system: { name: 'x' }, modules: { a: { name: 'A', activatedBy: [{ kind: 'schedule' }] } } };
    expect(errors(c).map((e) => e.message)).toEqual(['/modules/a/activatedBy/0: missing "schedule"']);
  });
  it('rejects ids used twice, across primitives', () => {
    const c: any = { aic: '0.1', system: { name: 'x' }, modules: { a: { name: 'A' } }, stores: { a: { name: 'A' } } };
    expect(codes(c)).toContain('duplicate-id');
  });
  it('rejects dangling and wrongly typed references', () => {
    const c: any = { aic: '0.1', system: { name: 'x' }, stores: { s: { name: 'S', owner: 'ghost' } }, channels: { ch: { name: 'C', carries: 's' } } };
    expect(codes(c)).toEqual(expect.arrayContaining(['unresolved-reference', 'wrong-reference-kind']));
  });
  it('rejects a mode that does not fit the target', () => {
    const c = load('online-shop');
    c.modules['order-service'].uses[0].modes = ['write'];
    expect(codes(c)).toContain('invalid-mode');
  });
  it('rejects a Binding on nothing', () => {
    const c = load('online-shop');
    c.bindings.ghost = 'Redis';
    expect(codes(c)).toContain('unresolved-reference');
  });
  it('detects a broken Scenario path', () => {
    const c = load('online-shop');
    c.scenarios['order-confirmed'].path = ['customer-app', 'email-provider'];
    expect(codes(c)).toContain('path-broken');
  });
});


describe('YAML', () => {
  it('round-trips without changing meaning', () => {
    const c = load('online-shop');
    expect(parseContract(toYaml(c)).contract).toEqual(c);
  });
  it('writes properties in schema order', () => {
    const y = toYaml({ system: { purpose: 'p', name: 'n' }, aic: '0.1' });
    expect(y.indexOf('aic')).toBeLessThan(y.indexOf('system'));
    expect(y.indexOf('name')).toBeLessThan(y.indexOf('purpose'));
  });
  it('keeps "no" and "on" as text under YAML 1.2', () => {
    expect(parseContract('a: no\nb: on').contract).toEqual({ a: 'no', b: 'on' });
  });
  it('reports the line of a syntax error', () => {
    expect(parseContract('a: [1,\nb: 2').error?.line).toBeTruthy();
  });
});


describe('bundle', () => {
  const files: Record<string, string> = {
    'c/main.yaml': 'aic: "0.1"\nsystem:\n  name: S\nmodules:\n  $ref: ./parts/modules.yaml\ntypes:\n  Order:\n    $ref: ./parts/types.yaml#/Order\n',
    'c/parts/modules.yaml': 'm1:\n  name: One\n  does: Things.\n',
    'c/parts/types.yaml': 'Order:\n  description: An order.\n',
    'c/loop.yaml': 'a:\n  $ref: ./loop.yaml#/a\n',
    'c/sibling.yaml': 'a:\n  $ref: ./x.yaml\n  name: nope\n',
    'c/missing.yaml': 'a:\n  $ref: ./parts/types.yaml#/Nope\n',
  };
  const read = (p: string) => { if (!(p in files)) throw new Error('no'); return files[p]; };

  it('joins a split contract into one that validates', () => {
    const c = bundle('c/main.yaml', read);
    expect(c.modules.m1.name).toBe('One');
    expect(c.types.Order.description).toBe('An order.');
    expect(validateContract(c).filter((p) => p.code === 'schema')).toEqual([]);
  });
  it('explains circular, sibling, missing and unreadable references', () => {
    expect(() => bundle('c/loop.yaml', read)).toThrow(/Circular/);
    expect(() => bundle('c/sibling.yaml', read)).toThrow(/sibling/);
    expect(() => bundle('c/missing.yaml', read)).toThrow(/Nothing at/);
    expect(() => bundle('c/nope.yaml', read)).toThrow(/Cannot read/);
  });
});

