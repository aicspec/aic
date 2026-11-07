// One Module's contract as a bounded task: everything needed to implement it, and nothing about the rest of the system.
import { computeMaturity } from '../core/maturity.ts';
import { activations, dependencies, indexElements, listOf, mapOf, type Contract } from '../core/model.ts';
import { validateContract } from '../core/validate.ts';

export class UnknownModuleError extends Error {}

export const interfacesOf = (m: any) => Object.keys(mapOf(m?.interfaces));

// Decisions and Constraints with an empty appliesTo concern the whole system.
const concerns = (item: any, ids: Set<string>) => {
  const targets = listOf(item?.appliesTo);
  return targets.length === 0 || targets.some((t) => ids.has(t));
};

// The Types a Module's data is made of, following fields that name other Types.
function typesReachedFrom(c: Contract, names: Iterable<string>) {
  const types = mapOf(c.types);
  const out: Record<string, any> = {};
  const visit = (name: string) => {
    if (out[name] || !types[name]) return;
    out[name] = types[name];
    for (const f of Object.values(mapOf(types[name]?.fields))) {
      for (const word of String((f as any)?.type ?? '').split(/\W+/)) visit(word);
    }
  };
  for (const n of names) visit(n);
  return out;
}

function describeTarget(c: Contract, to: string) {
  const target = indexElements(c).get(to);
  if (!target) return { kind: 'unknown' };
  const v = target.value ?? {};
  switch (target.kind) {
    case 'interface': return { kind: 'interface', offeredBy: target.module, name: v.name, operations: v.operations, spec: v.spec };
    case 'store': return { kind: 'store', name: v.name, holds: v.holds, owner: v.owner, consistency: v.consistency, durability: v.durability };
    case 'channel': return { kind: 'channel', name: v.name, carries: v.carries, delivery: v.delivery, ordering: v.ordering };
    case 'external': return { kind: 'external', name: v.name, description: v.description, assumes: v.assumes, contract: v.contract };
    default: return { kind: target.kind, name: v.name };
  }
}

export function openDecisionsFor(c: Contract, moduleId: string) {
  const m = mapOf(c.modules)[moduleId];
  const ids = new Set([moduleId, ...interfacesOf(m), ...(m?.boundary ? [m.boundary] : []), ...(m?.deployedIn ? [m.deployedIn] : [])]);
  return Object.entries(mapOf(c.decisions))
    .filter(([, d]) => (d as any)?.status === 'open' && concerns(d, ids))
    .map(([id, d]) => ({ id, statement: (d as any)?.statement }));
}

export function moduleBrief(c: Contract, moduleId: string) {
  const modules = mapOf(c.modules);
  const m = modules[moduleId];
  if (!m) throw new UnknownModuleError(`There is no Module "${moduleId}". Modules: ${Object.keys(modules).join(', ') || 'none'}.`);

  const interfaces = mapOf(m.interfaces);
  const uses = listOf(m.uses);
  const channelsActivating = activations(c).filter((a) => a.module === moduleId && a.value?.kind === 'channel').map((a) => a.value.channel);
  const targets = [...uses.map((u) => u?.to), ...channelsActivating].filter(Boolean);
  const self = new Set<string>([moduleId, ...Object.keys(interfaces)]);
  const related = new Set<string>([...self, ...targets, ...(m.boundary ? [m.boundary] : []), ...(m.deployedIn ? [m.deployedIn] : [])]);
  const index = indexElements(c);

  const ownedStores = Object.entries(mapOf(c.stores)).filter(([, s]) => (s as any)?.owner === moduleId).map(([id]) => id);
  const callers = dependencies(c)
    .filter((d) => self.has(d.value?.to) && d.owner !== moduleId)
    .map((d) => ({ who: d.owner, interface: d.value.to, purpose: d.value.description }));

  const typeNames = new Set<string>();
  for (const i of Object.values(interfaces)) {
    for (const op of Object.values(mapOf((i as any)?.operations))) {
      if ((op as any)?.input) typeNames.add((op as any).input);
      if ((op as any)?.output) typeNames.add((op as any).output);
    }
  }
  for (const t of [...targets, ...ownedStores]) {
    const e = index.get(t);
    if (e?.value?.holds) typeNames.add(e.value.holds);
    if (e?.value?.carries) typeNames.add(e.value.carries);
    for (const op of e?.kind === 'interface' ? Object.values(mapOf(e.value?.operations)) : []) {
      if ((op as any)?.input) typeNames.add((op as any).input);
      if ((op as any)?.output) typeNames.add((op as any).output);
    }
  }

  const maturity = computeMaturity(c).get(moduleId);
  const blockers = openDecisionsFor(c, moduleId);
  const violations = validateContract(c).filter((p) => p.severity === 'error' && p.element && related.has(p.element));
  const boundary = m.boundary ? mapOf(c.boundaries)[m.boundary] : undefined;
  const pick = (section: any, keep: (value: any, id: string) => boolean) =>
    Object.fromEntries(Object.entries(mapOf(section)).filter(([id, value]) => keep(value, id)));

  return {
    module: moduleId,
    ready: blockers.length === 0 && violations.length === 0 && (maturity?.level === 'specified' || maturity?.level === 'verifiable'),
    maturity: { level: maturity?.level ?? null, missing: maturity?.missing ?? [] },
    blockers,
    violations: violations.map((p) => ({ code: p.code, message: p.message })),
    system: { name: c.system?.name, purpose: c.system?.purpose, nonGoals: c.system?.nonGoals },
    contract: m,
    dependencies: uses.map((u) => ({ ...u, target: describeTarget(c, u?.to) })),
    activatedByChannels: channelsActivating.map((id) => ({ id, ...describeTarget(c, id) })),
    ownedStores: pick(c.stores, (_, id) => ownedStores.includes(id)),
    callers,
    boundary: m.boundary ? { id: m.boundary, name: boundary?.name, exposes: boundary?.exposes, mayDependOn: boundary?.mayDependOn } : null,
    types: typesReachedFrom(c, typeNames),
    decisions: pick(c.decisions, (d) => d?.status === 'accepted' && concerns(d, related)),
    constraints: pick(c.constraints, (k) => concerns(k, related)),
    scenarios: pick(c.scenarios, (s) => listOf(s?.path).some((step) => self.has(step))),
    bindings: pick(c.bindings, (_, id) => related.has(id) || ownedStores.includes(id)),
    rules: [
      'Use only what is listed in dependencies and activatedByChannels. Any other call, connection or import of another part of the system is a violation.',
      'Expose exactly the Interfaces and operations in contract.interfaces, with these Types and errors.',
      'Implement every onFailure and onDuplicate as stated.',
      'Use the technology in bindings. Where there is no Binding, choose it yourself and do not write it back to the contract without asking.',
      'If this contract cannot be honoured, stop and report it to the architect. Do not change the contract to fit the code.',
    ],
  };
}

// Providers before those who need them, so each Module can be built against something real.
export function implementationPlan(c: Contract) {
  const modules = mapOf(c.modules);
  const index = indexElements(c);
  const needs = new Map<string, Set<string>>(Object.keys(modules).map((id) => [id, new Set<string>()]));
  for (const d of dependencies(c)) {
    if (d.ownerKind !== 'module') continue;
    const target = index.get(d.value?.to);
    const provider = target?.kind === 'interface' ? target.module : target?.kind === 'store' ? target.value?.owner : undefined;
    if (provider && provider !== d.owner && modules[provider]) needs.get(d.owner)?.add(provider);
  }

  const done = new Set<string>();
  const order: string[] = [];
  const remaining = new Set(Object.keys(modules));
  while (remaining.size) {
    const next = [...remaining].filter((id) => [...needs.get(id)!].every((n) => done.has(n)));
    // A cycle has no valid first step, so take the Modules in the order they are written.
    for (const id of next.length ? next : [[...remaining][0]]) { remaining.delete(id); done.add(id); order.push(id); }
  }

  const errors = validateContract(c).filter((p) => p.severity === 'error');
  const steps = order.map((id, i) => {
    const brief = moduleBrief(c, id);
    return {
      step: i + 1, module: id, name: modules[id]?.name, deployedIn: modules[id]?.deployedIn, ready: brief.ready,
      buildAfter: [...needs.get(id)!], maturity: brief.maturity.level, blockers: brief.blockers, violations: brief.violations,
      stillMissing: brief.maturity.missing.filter((x) => x.level !== 'verifiable').map((x) => x.text),
    };
  });
  return { contractViolations: errors.length, modules: steps };
}
