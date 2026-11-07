import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { implementationPlan, moduleBrief } from '../src/agent/brief.ts';
import { ContractError, readContract } from '../src/agent/contract.ts';
import { conformanceVerdict, verificationChecklist } from '../src/agent/verify.ts';
import { parseContract } from '../src/core/yaml.ts';

const shop = parseContract(readFileSync('examples/online-shop.aic.yaml', 'utf8')).contract!;
const sketch = parseContract(readFileSync('examples/sketch.aic.yaml', 'utf8')).contract!;
const clone = () => structuredClone(shop);

describe('reading a contract', () => {
  it('reports the line of a YAML error', () => {
    expect(() => readContract('aic: "0.1"\nsystem: [')).toThrow(ContractError);
  });
  it('refuses a contract split with $ref, because the server has only one file', () => {
    expect(() => readContract('aic: "0.1"\nmodules:\n  a:\n    $ref: ./a.yaml\n')).toThrow(/\$ref/);
  });
});

describe('module brief', () => {
  it('gives Order Service only what it needs', () => {
    const b = moduleBrief(shop, 'order-service');
    expect(b.ready).toBe(true);
    expect(b.dependencies.map((d: any) => d.to)).toEqual(['catalog-api', 'payment-provider', 'orders', 'order-placed']);
    expect(b.dependencies[0].target).toMatchObject({ kind: 'interface', offeredBy: 'catalog-service' });
    expect(Object.keys(b.ownedStores)).toEqual(['orders']);
    expect(Object.keys(b.types).sort()).toEqual(['Order', 'OrderPlaced', 'Product']);
    expect(b.callers.map((c) => c.who)).toEqual(['customer-app']);
    expect(Object.keys(b.bindings).sort()).toEqual(['catalog-api', 'order-placed', 'order-service-unit', 'orders', 'orders-api']);
  });
  it('leaves out what does not concern the Module', () => {
    const b = moduleBrief(shop, 'notification-worker');
    expect(Object.keys(b.ownedStores)).toEqual([]);
    expect(Object.keys(b.bindings).sort()).toEqual(['notification-worker-unit', 'order-placed']);
    expect(Object.keys(b.types)).toEqual(['OrderPlaced']);
    expect(Object.keys(b.decisions)).toEqual([]);
    expect(Object.keys(b.scenarios)).toEqual(['order-confirmed']);
  });
  it('follows Types named inside the fields of other Types', () => {
    const b = moduleBrief(shop, 'catalog-service');
    expect(Object.keys(b.types)).toEqual(['Product']);
    expect(Object.keys(moduleBrief(shop, 'order-service').types)).toContain('Product');
  });
  it('is not ready while an open Decision applies to the Module', () => {
    const c = clone();
    c.decisions.q = { name: 'Q', kind: 'question', status: 'open', statement: 'Refund how?', appliesTo: ['order-service'] };
    const b = moduleBrief(c, 'order-service');
    expect(b.ready).toBe(false);
    expect(b.blockers).toEqual([{ id: 'q', statement: 'Refund how?' }]);
    expect(moduleBrief(c, 'catalog-service').ready).toBe(true);
  });
  it('is not ready when the contract breaks a rule that involves the Module', () => {
    const c = clone();
    c.modules['catalog-service'].uses = [{ to: 'orders', modes: ['read'], onFailure: 'Fail.' }];
    const b = moduleBrief(c, 'catalog-service');
    expect(b.ready).toBe(false);
    expect(b.violations.map((v) => v.code)).toContain('store-access');
  });
  it('a sketch is not ready', () => {
    const id = Object.keys(sketch.modules)[0];
    expect(moduleBrief(sketch, id).ready).toBe(false);
  });
  it('names the Modules when the id is wrong', () => {
    expect(() => moduleBrief(shop, 'nope')).toThrow(/order-service/);
  });
});

describe('implementation plan', () => {
  it('puts providers first', () => {
    const order = implementationPlan(shop).modules.map((m) => m.module);
    expect(order.indexOf('catalog-service')).toBeLessThan(order.indexOf('order-service'));
    expect(order).toHaveLength(3);
  });
  it('still covers every Module when they depend on each other', () => {
    const c = clone();
    c.modules['catalog-service'].uses = [{ to: 'orders-api', modes: ['call'], onFailure: 'Fail.' }];
    expect(implementationPlan(c).modules).toHaveLength(3);
  });
});

describe('verification', () => {
  const answerAll = (status: 'pass' | 'fail', c = shop, module?: string) =>
    verificationChecklist(c, module).map((i) => ({ id: i.id, status, evidence: 'observed' }));

  it('has ids that are unique', () => {
    const ids = verificationChecklist(shop).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('covers all five families of checks', () => {
    expect(new Set(verificationChecklist(shop).map((i) => i.check))).toEqual(new Set(['structural', 'interface-and-type', 'scenario', 'constraint', 'realisation']));
  });
  it('limits the list to one Module', () => {
    const items = verificationChecklist(shop, 'notification-worker');
    expect(items.map((i) => i.id)).toContain('structural:notification-worker:only-declared');
    expect(items.some((i) => i.element === 'order-service')).toBe(false);
    expect(items.some((i) => i.id === 'constraint:orders-api-authentication')).toBe(false);
    expect(items.some((i) => i.id === 'interface-and-type:channel:order-placed')).toBe(true);
  });
  it('conformant needs every checkable item passed, and prose stays a judgement', () => {
    const v = conformanceVerdict(shop, answerAll('pass'));
    expect(v.verdict).toBe('conformant');
    expect(v.summary.judgements).toBeGreaterThan(0);
    expect(v.judgements.every((j) => j.id.includes(':does'))).toBe(true);
    expect(v.basis).toMatch(/did not inspect the code/);
  });
  it('one failure makes it non-conformant and names the primitive', () => {
    const results = answerAll('pass');
    results[0].status = 'fail';
    const v = conformanceVerdict(shop, results);
    expect(v.verdict).toBe('non-conformant');
    expect(v.failed[0].primitive).toBe('Module');
  });
  it('an unanswered item is incomplete, never a pass', () => {
    const v = conformanceVerdict(shop, answerAll('pass').filter((r) => !r.id.startsWith('scenario:')));
    expect(v.verdict).toBe('incomplete');
    expect(v.notAnswered.map((r) => r.id)).toEqual(['scenario:order-confirmed']);
  });
  it('a pass without evidence does not count', () => {
    const results = answerAll('pass').map((r) => (r.id.startsWith('scenario:') ? { id: r.id, status: 'pass' as const } : r));
    expect(conformanceVerdict(shop, results).verdict).toBe('incomplete');
  });
  it('a Constraint with no check is unverified and does not block the verdict', () => {
    const c = clone();
    delete c.constraints['place-order-latency'].check;
    const results = answerAll('pass', c).filter((r) => r.id !== 'constraint:place-order-latency');
    const v = conformanceVerdict(c, results);
    expect(v.verdict).toBe('conformant');
    expect(v.unverified.map((r) => r.id)).toContain('constraint:place-order-latency');
  });
  it('an id that is not on the list is reported', () => {
    const v = conformanceVerdict(shop, [...answerAll('pass'), { id: 'made-up', status: 'pass', evidence: 'x' }]);
    expect(v.verdict).toBe('incomplete');
    expect(v.unknownIds).toEqual(['made-up']);
  });
});
