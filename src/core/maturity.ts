// The three maturity levels of the specification, computed per element.
import { activations, indexElements, listOf, mapOf, allElements, type Contract, type ElementInfo } from './model.ts';

export type Level = 'draft' | 'specified' | 'verifiable';
export const LEVELS: Level[] = ['draft', 'specified', 'verifiable'];
export interface Maturity { level: Level | null; missing: { level: Level; text: string }[] }

export function computeMaturity(c: Contract): Map<string, Maturity> {
  const index = indexElements(c);
  const out = new Map<string, Maturity>();

  const covered = new Set<string>();
  for (const s of Object.values(mapOf(c.scenarios))) for (const step of listOf((s as any)?.path)) covered.add(step);
  for (const k of Object.values(mapOf(c.constraints))) {
    if ((k as any)?.check) for (const t of listOf((k as any)?.appliesTo)) covered.add(t);
  }
  const openOn = new Map<string, string[]>();
  for (const d of Object.values(mapOf(c.decisions))) {
    if ((d as any)?.status !== 'open') continue;
    for (const t of listOf((d as any)?.appliesTo)) openOn.set(t, [...(openOn.get(t) ?? []), (d as any)?.statement ?? 'an open decision']);
  }
  const unitsUsed = new Set(Object.values(mapOf(c.modules)).map((m: any) => m?.deployedIn).filter(Boolean));
  const activated = new Set(activations(c).map((a) => a.module));

  const interfaceReady = (i: any) => {
    if (i?.spec) return true;
    const ops = Object.values(mapOf(i?.operations));
    return ops.length > 0 && ops.every((o: any) => o?.input || o?.output);
  };

  const requirements = (e: ElementInfo): Record<Level, string[]> => {
    const v = e.value ?? {};
    const r: Record<Level, string[]> = { draft: [], specified: [], verifiable: [] };
    const blocking = openOn.get(e.id) ?? [];
    switch (e.kind) {
      case 'module': {
        if (!v.does) r.draft.push('Say what it does');
        const ifaces = Object.entries(mapOf(v.interfaces));
        for (const [id, i] of ifaces) if (!interfaceReady(i)) r.specified.push(`Specify Interface "${(i as any)?.name ?? id}"`);
        if (!ifaces.length && !activated.has(e.id)) r.specified.push('Say what makes it run');
        const noFailure = listOf(v.uses).filter((d) => !d?.onFailure).length;
        if (noFailure) r.specified.push(`State failure behaviour on ${noFailure} ${noFailure === 1 ? 'Dependency' : 'Dependencies'}`);
        if (!v.deployedIn) r.specified.push('Place it in a Deployment Unit');
        if (!covered.has(e.id) && !ifaces.some(([id]) => covered.has(id))) r.verifiable.push('Include it in a Scenario path or a checked Constraint');
        break;
      }
      case 'interface':
        if (!v.description && !Object.keys(mapOf(v.operations)).length) r.draft.push('Describe it');
        if (!interfaceReady(v)) r.specified.push('List operations with their Types, or point to a specification');
        if (!covered.has(e.id)) r.verifiable.push('Include it in a Scenario path or a checked Constraint');
        break;
      case 'store':
        if (!v.description && !v.holds) r.draft.push('Say what it holds');
        if (!v.owner) r.specified.push('Name its owner');
        if (!v.holds) r.specified.push('Name the Type it holds');
        if (!v.consistency) r.specified.push('Choose a consistency level');
        if (!covered.has(e.id)) r.verifiable.push('Include it in a Scenario path or a checked Constraint');
        break;
      case 'channel':
        if (!v.description && !v.carries) r.draft.push('Say what it carries');
        if (!v.carries) r.specified.push('Name the Type it carries');
        if (!v.delivery) r.specified.push('Choose a delivery guarantee');
        if (!covered.has(e.id)) r.verifiable.push('Include it in a Scenario path or a checked Constraint');
        break;
      case 'external':
        if (!v.description) r.draft.push('Describe it');
        if (!listOf(v.assumes).length && !v.contract) r.specified.push('State what the system assumes about it');
        if (!covered.has(e.id)) r.verifiable.push('Include it in a Scenario path or a checked Constraint');
        break;
      case 'boundary':
        if (!v.description) r.draft.push('Describe it');
        if (!Array.isArray(v.exposes)) r.specified.push('Say what it exposes');
        if (!Array.isArray(v.mayDependOn)) r.specified.push('Say which Boundaries it may depend on');
        break;
      case 'type':
        if (!v.description) r.draft.push('Describe it');
        if (!Object.keys(mapOf(v.fields)).length && !v.definedBy) r.specified.push('List its fields, or point to a definition');
        break;
      case 'scenario':
        if (!v.when || !v.then) r.draft.push('State the starting event and the expected outcome');
        if (!listOf(v.path).length) r.verifiable.push('Declare the path it runs through');
        break;
      case 'constraint':
        if (!v.statement) r.draft.push('State the rule');
        if (!v.category) r.specified.push('Choose a category');
        if (!v.check) r.verifiable.push('Name how it is checked');
        break;
      case 'deploymentUnit':
        if (!unitsUsed.has(e.id)) r.specified.push('Place at least one Module in it');
        break;
      default:
        break;
    }
    for (const b of blocking) r.specified.push(`Resolve: ${b}`);
    return r;
  };

  for (const e of allElements(c)) {
    if (e.kind === 'decision' || e.kind === 'dependency') continue;
    const r = requirements(e);
    let level: Level | null = null;
    const missing: Maturity['missing'] = [];
    let stillClimbing = true;
    for (const l of LEVELS) {
      for (const text of r[l]) missing.push({ level: l, text });
      if (stillClimbing && r[l].length === 0) level = l;
      else stillClimbing = false;
    }
    out.set(e.id, { level, missing });
  }
  void index;
  return out;
}

export function maturitySummary(m: Map<string, Maturity>): Record<'none' | Level, number> {
  const s = { none: 0, draft: 0, specified: 0, verifiable: 0 };
  for (const v of m.values()) s[v.level ?? 'none']++;
  return s;
}
