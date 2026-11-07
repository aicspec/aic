// The contract model: which primitives exist, where they live, and a generic walk over references.
// Everything here is read from the JSON Schema, so the schema stays the single definition of the format.
import schema from '../../schema/aic-contract-0.1.schema.json' with { type: 'json' };

export { schema };
export type Contract = Record<string, any>;

export type Kind =
  | 'system' | 'module' | 'interface' | 'store' | 'channel' | 'external' | 'boundary'
  | 'type' | 'scenario' | 'decision' | 'constraint' | 'deploymentUnit' | 'dependency';

// Primitives stored as a top-level map, keyed by id.
export const SECTIONS = {
  boundary: 'boundaries', module: 'modules', store: 'stores', channel: 'channels', external: 'externals',
  type: 'types', scenario: 'scenarios', decision: 'decisions', constraint: 'constraints', deploymentUnit: 'deploymentUnits',
} as const;
export type SectionKind = keyof typeof SECTIONS;

export const DEF_OF: Record<Kind, string> = {
  system: 'System', module: 'Module', interface: 'Interface', store: 'Store', channel: 'Channel', external: 'External',
  boundary: 'Boundary', type: 'Type', scenario: 'Scenario', decision: 'Decision', constraint: 'Constraint',
  deploymentUnit: 'DeploymentUnit', dependency: 'Dependency',
};

export const LABEL_OF: Record<Kind, string> = {
  system: 'System', module: 'Module', interface: 'Interface', store: 'Store', channel: 'Channel', external: 'External',
  boundary: 'Boundary', type: 'Type', scenario: 'Scenario', decision: 'Decision', constraint: 'Constraint',
  deploymentUnit: 'Deployment Unit', dependency: 'Dependency',
};

export interface ElementInfo {
  id: string;
  kind: Kind;
  value: any;
  path: (string | number)[];
  module?: string; // the Module that offers an Interface
  owner?: string; // the source of a Dependency
}

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export const mapOf = (v: unknown): Record<string, any> => (isObject(v) ? v : {});
export const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function allElements(c: Contract): ElementInfo[] {
  const out: ElementInfo[] = [];
  for (const [kind, section] of Object.entries(SECTIONS)) {
    for (const [id, value] of Object.entries(mapOf(c?.[section]))) {
      out.push({ id, kind: kind as Kind, value, path: [section, id] });
    }
  }
  for (const [mid, m] of Object.entries(mapOf(c?.modules))) {
    for (const [id, value] of Object.entries(mapOf((m as any)?.interfaces))) {
      out.push({ id, kind: 'interface', value, path: ['modules', mid, 'interfaces', id], module: mid });
    }
  }
  for (const d of dependencies(c)) {
    if (typeof d.value?.id === 'string') {
      out.push({ id: d.value.id, kind: 'dependency', value: d.value, path: d.path, owner: d.owner });
    }
  }
  return out;
}

export function indexElements(c: Contract): Map<string, ElementInfo> {
  const index = new Map<string, ElementInfo>();
  for (const e of allElements(c)) if (!index.has(e.id)) index.set(e.id, e);
  return index;
}

export interface DependencyInfo { owner: string; ownerKind: 'module' | 'external'; index: number; value: any; path: (string | number)[] }

export function dependencies(c: Contract): DependencyInfo[] {
  const out: DependencyInfo[] = [];
  for (const [ownerKind, section] of [['module', 'modules'], ['external', 'externals']] as const) {
    for (const [owner, el] of Object.entries(mapOf(c?.[section]))) {
      listOf((el as any)?.uses).forEach((value, index) => {
        out.push({ owner, ownerKind, index, value, path: [section, owner, 'uses', index] });
      });
    }
  }
  return out;
}

export interface ActivationInfo { module: string; index: number; value: any; path: (string | number)[] }

export function activations(c: Contract): ActivationInfo[] {
  const out: ActivationInfo[] = [];
  for (const [module, el] of Object.entries(mapOf(c?.modules))) {
    listOf((el as any)?.activatedBy).forEach((value, index) => {
      out.push({ module, index, value, path: ['modules', module, 'activatedBy', index] });
    });
  }
  return out;
}

// Schema helpers
export function resolve(node: any): any {
  if (!node?.$ref) return node ?? {};
  const name = String(node.$ref).split('/').pop()!;
  const { $ref, ...rest } = node;
  return { ...resolve((schema as any).$defs[name]), ...rest };
}
export const defFor = (kind: Kind): any => resolve((schema as any).$defs[DEF_OF[kind]]);

export function branchFor(oneOf: any[], value: any): any {
  return oneOf.find((b) => b.properties?.kind?.const === value?.kind) ?? oneOf[0];
}

export interface RefSite { value: string; kinds: string[]; parent: any; key: string | number; path: (string | number)[] }

// Calls visit for every value the schema marks as a reference (x-aic-ref).
export function walkRefs(c: Contract, visit: (site: RefSite) => void): void {
  const go = (value: any, node: any, parent: any, key: any, path: (string | number)[]) => {
    const s = resolve(node);
    if (s['x-aic-ref'] && typeof value === 'string') {
      visit({ value, kinds: s['x-aic-ref'], parent, key, path });
      return;
    }
    if (s.oneOf && isObject(value)) return go(value, branchFor(s.oneOf, value), parent, key, path);
    if (Array.isArray(value) && s.items) {
      // Iterate over a copy: a visitor may remove items.
      [...value].forEach((v, i) => go(v, s.items, value, i, [...path, i]));
    } else if (isObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        const child = s.properties?.[k] ?? (isObject(s.additionalProperties) ? s.additionalProperties : undefined);
        if (child) go(v, child, value, k, [...path, k]);
      }
    }
  };
  go(c, schema, null, null, []);
}

// Boundary helpers
export function boundaryOf(c: Contract, index: Map<string, ElementInfo>, id: string): string | undefined {
  const e = index.get(id);
  if (!e) return undefined;
  if (e.kind === 'interface') return mapOf(c.modules)[e.module!]?.boundary;
  if (e.kind === 'boundary') return id;
  return e.value?.boundary;
}

export function boundaryChain(c: Contract, boundary: string | undefined): string[] {
  const chain: string[] = [];
  let cur = boundary;
  while (cur && !chain.includes(cur) && mapOf(c.boundaries)[cur]) {
    chain.push(cur);
    cur = mapOf(c.boundaries)[cur]?.within;
  }
  return chain;
}

// Who offers what, and what can flow where: the links a Scenario path can follow.
export function declaredLinks(c: Contract): Map<string, Set<string>> {
  const links = new Map<string, Set<string>>();
  const add = (a: string, b: string) => { if (!links.has(a)) links.set(a, new Set()); links.get(a)!.add(b); };
  for (const d of dependencies(c)) if (d.value?.to) add(d.owner, d.value.to);
  for (const a of activations(c)) if (a.value?.kind === 'channel' && a.value.channel) add(a.value.channel, a.module);
  for (const [mid, m] of Object.entries(mapOf(c?.modules))) {
    for (const iid of Object.keys(mapOf((m as any)?.interfaces))) add(iid, mid);
  }
  return links;
}
