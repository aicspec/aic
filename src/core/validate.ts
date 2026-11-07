// Checks a contract in two passes: its shape against the JSON Schema, then the rules a schema cannot express.
import Ajv2020 from 'ajv/dist/2020.js';
import {
  activations, allElements, boundaryChain, boundaryOf, declaredLinks, dependencies, indexElements, LABEL_OF, listOf, mapOf,
  schema, walkRefs, type Contract, type ElementInfo,
} from './model.ts';

export type Severity = 'error' | 'warning' | 'info';
export interface Problem { severity: Severity; code: string; message: string; element?: string; path?: string }

const AjvClass: any = (Ajv2020 as any).default ?? Ajv2020;
const ajv = new AjvClass({ strict: false, allErrors: true });
const validateSchema = ajv.compile(schema);

function schemaProblems(c: Contract): Problem[] {
  if (validateSchema(c)) return [];
  const errors: any[] = validateSchema.errors ?? [];
  const seen = new Set<string>();
  const out: Problem[] = [];
  for (const e of errors) {
    // An Activation is a oneOf picked by its kind: report only the branch its kind selects.
    const branch = /Activation\/oneOf\/(\d)\//.exec(e.schemaPath);
    if (e.keyword === 'oneOf') continue;
    if (branch) {
      const instance = e.instancePath.split('/').slice(1).reduce((v: any, k: string) => v?.[k], c);
      const kinds = ['channel', 'schedule', 'continuous'];
      const kind = e.keyword === 'const' ? undefined : instance?.kind;
      if (e.keyword === 'const' || (kind !== undefined && kinds[Number(branch[1])] !== kind)) continue;
    }
    const where = e.instancePath || '/';
    let message = `${where}: ${e.message}`;
    if (e.keyword === 'additionalProperties') message = `${where}: unknown property "${e.params.additionalProperty}"`;
    if (e.keyword === 'required') message = `${where}: missing "${e.params.missingProperty}"`;
    if (e.keyword === 'enum') message = `${where}: must be one of ${e.params.allowedValues.join(', ')}`;
    if (seen.has(message)) continue;
    seen.add(message);
    const parts = e.instancePath.split('/').filter(Boolean);
    const element = parts[0] === 'modules' && parts[2] === 'interfaces' ? parts[3] : parts[1];
    out.push({ severity: 'error', code: 'schema', message, element, path: where });
  }
  return out;
}

const MODES_BY_TARGET: Record<string, string[]> = {
  interface: ['call'],
  channel: ['publish', 'read'],
  store: ['read', 'write'],
  external: ['call', 'publish', 'read', 'write'],
};

export function validateContract(c: Contract): Problem[] {
  const problems = schemaProblems(c);
  if (!c || typeof c !== 'object') return problems;
  const add = (severity: Severity, code: string, message: string, element?: string) => problems.push({ severity, code, message, element });
  const index = indexElements(c);
  const name = (id: string) => index.get(id)?.value?.name ?? id;

  // One namespace of ids.
  const seen = new Map<string, ElementInfo>();
  for (const e of allElements(c)) {
    const first = seen.get(e.id);
    if (first) add('error', 'duplicate-id', `The id "${e.id}" is used by both a ${LABEL_OF[first.kind]} and a ${LABEL_OF[e.kind]}. Ids are unique across the contract.`, e.id);
    else seen.set(e.id, e);
  }

  // Every reference resolves, to a primitive of the kind the schema allows.
  walkRefs(c, ({ value, kinds, path }) => {
    const owner = path[0] === 'modules' && path[2] === 'interfaces' ? String(path[3]) : String(path[1]);
    const target = index.get(value);
    if (!target) add('error', 'unresolved-reference', `${path.join('.')} refers to "${value}", which does not exist.`, owner);
    else if (!kinds.includes(target.kind)) {
      add('error', 'wrong-reference-kind', `${path.join('.')} refers to "${value}", a ${LABEL_OF[target.kind]}. It must be one of: ${kinds.join(', ')}.`, owner);
    }
  });
  for (const id of Object.keys(mapOf(c.bindings))) {
    if (!index.has(id)) add('error', 'unresolved-reference', `The Binding "${id}" refers to an element that does not exist.`, id);
  }

  // Boundaries nest without cycles, and only expose what is inside them.
  for (const [id, b] of Object.entries(mapOf(c.boundaries))) {
    const seenChain = new Set<string>([id]);
    let cur = (b as any)?.within;
    while (cur) {
      if (seenChain.has(cur)) { add('error', 'boundary-cycle', `Boundary "${name(id)}" is inside itself through "within".`, id); break; }
      seenChain.add(cur);
      cur = mapOf(c.boundaries)[cur]?.within;
    }
    for (const ex of listOf((b as any)?.exposes)) {
      if (index.has(ex) && !boundaryChain(c, boundaryOf(c, index, ex)).includes(id)) {
        add('error', 'exposes-outsider', `Boundary "${name(id)}" exposes "${name(ex)}", which is not inside it.`, id);
      }
    }
  }

  // Crossing a Boundary follows its rules. Used for Dependencies and for activations by a Channel.
  const checkCrossing = (source: string, target: string, verb: string) => {
    const from = boundaryChain(c, boundaryOf(c, index, source));
    const to = boundaryChain(c, boundaryOf(c, index, target));
    for (const b of to) {
      if (from.includes(b)) continue;
      const exposes = mapOf(c.boundaries)[b]?.exposes;
      if (Array.isArray(exposes) && !exposes.includes(target)) {
        add('error', 'not-exposed', `"${name(source)}" ${verb} "${name(target)}", but Boundary "${name(b)}" does not expose it.`, source);
      }
    }
    if (!to.length) return;
    for (const b of from) {
      if (to.includes(b)) continue;
      const allowed = mapOf(c.boundaries)[b]?.mayDependOn;
      if (Array.isArray(allowed) && !allowed.some((a) => to.includes(a))) {
        add('error', 'boundary-dependency', `Boundary "${name(b)}" may not depend on "${name(to[0])}", yet "${name(source)}" ${verb} "${name(target)}".`, source);
      }
    }
  };

  const called = new Set<string>();
  const publishers = new Map<string, string[]>();
  const consumers = new Map<string, string[]>();
  const touched = new Set<string>();

  for (const d of dependencies(c)) {
    const to = d.value?.to;
    const target = index.get(to);
    if (!target) continue;
    touched.add(to);
    if (target.kind === 'interface') called.add(to);
    const modes = listOf(d.value.modes);
    if (target.kind === 'channel') {
      if (modes.includes('publish')) publishers.set(to, [...(publishers.get(to) ?? []), d.owner]);
      if (modes.includes('read')) consumers.set(to, [...(consumers.get(to) ?? []), d.owner]);
    }
    const allowed = MODES_BY_TARGET[target.kind];
    if (allowed) {
      for (const m of modes) {
        if (!allowed.includes(m)) add('error', 'invalid-mode', `"${name(d.owner)}" cannot ${m} a ${LABEL_OF[target.kind]}. Allowed: ${allowed.join(', ')}.`, d.owner);
      }
    }
    if (d.ownerKind === 'external' && !['interface', 'channel'].includes(target.kind)) {
      add('error', 'external-reach', `External "${name(d.owner)}" can only use Interfaces and Channels, not a ${LABEL_OF[target.kind]}.`, d.owner);
    }
    if (d.ownerKind === 'module' && target.kind === 'store') {
      const owner = target.value?.owner;
      const inOwner = !owner || owner === d.owner || boundaryChain(c, boundaryOf(c, index, d.owner)).includes(owner);
      if (!inOwner) {
        if (!d.value.justifiedBy) add('error', 'store-access', `"${name(d.owner)}" uses Store "${name(to)}" owned by "${name(owner)}" with no Decision justifying it.`, d.owner);
        else if (mapOf(c.decisions)[d.value.justifiedBy]?.status !== 'accepted') add('warning', 'store-access', `"${name(d.owner)}" uses Store "${name(to)}" on a Decision that is not accepted yet.`, d.owner);
        const unit = mapOf(c.modules)[d.owner]?.deployedIn;
        const ownerUnit = mapOf(c.modules)[owner]?.deployedIn;
        if (unit && ownerUnit && unit !== ownerUnit) add('warning', 'cross-unit-store', `"${name(d.owner)}" and "${name(owner)}" are in different Deployment Units but share Store "${name(to)}". Modules in different units interact through an Interface or Channel.`, d.owner);
      }
    }
    checkCrossing(d.owner, to, target.kind === 'interface' || target.kind === 'external' ? 'calls' : 'uses');
  }

  for (const a of activations(c)) {
    if (a.value?.kind !== 'channel' || !index.has(a.value.channel)) continue;
    const ch = a.value.channel;
    touched.add(ch);
    consumers.set(ch, [...(consumers.get(ch) ?? []), a.module]);
    checkCrossing(a.module, ch, 'is activated by');
    if (mapOf(c.channels)[ch]?.delivery === 'at-least-once' && !a.value.onDuplicate) {
      add('warning', 'duplicates-unstated', `"${name(a.module)}" can receive the same message twice from "${name(ch)}" (at-least-once). State how it handles duplicates.`, a.module);
    }
  }

  // Gaps: not violations, but things a reviewer would want to see.
  for (const [id, m] of Object.entries(mapOf(c.modules))) {
    if (!Object.keys(mapOf((m as any)?.interfaces)).length && !listOf((m as any)?.activatedBy).length) {
      add('warning', 'never-runs', `Nothing makes Module "${name(id)}" run: it has no Interface and no activation.`, id);
    }
    for (const [iid] of Object.entries(mapOf((m as any)?.interfaces))) {
      if (!called.has(iid)) add('warning', 'unused-interface', `Interface "${name(iid)}" has no callers. Is it needed?`, iid);
    }
  }
  for (const [id, s] of Object.entries(mapOf(c.stores))) {
    if (!touched.has(id)) add('warning', 'unused-store', `No Module uses Store "${name(id)}".`, id);
    const owner = (s as any)?.owner;
    if (owner && index.get(owner)?.kind === 'module') {
      const ob = mapOf(c.modules)[owner]?.boundary;
      if (ob !== (s as any)?.boundary) add('warning', 'owner-elsewhere', `Store "${name(id)}" is drawn outside the Boundary of its owner "${name(owner)}".`, id);
    }
    if (owner && index.get(owner)?.kind === 'boundary' && !boundaryChain(c, (s as any)?.boundary).includes(owner)) {
      add('warning', 'owner-elsewhere', `Store "${name(id)}" is drawn outside its owning Boundary "${name(owner)}".`, id);
    }
  }
  for (const id of Object.keys(mapOf(c.channels))) {
    if (!publishers.get(id)?.length) add('warning', 'no-producer', `Nothing publishes to Channel "${name(id)}".`, id);
    if (!consumers.get(id)?.length) add('warning', 'no-consumer', `Nothing consumes Channel "${name(id)}".`, id);
  }
  for (const [id, e] of Object.entries(mapOf(c.externals))) {
    if (!touched.has(id) && !listOf((e as any)?.uses).length) add('warning', 'unused-external', `External "${name(id)}" is not connected to anything.`, id);
  }

  // Scenario paths follow declared links.
  const links = declaredLinks(c);
  for (const [id, s] of Object.entries(mapOf(c.scenarios))) {
    const path = listOf((s as any)?.path);
    path.forEach((step, i) => {
      if (i === 0 || !index.has(step)) return;
      const reachable = path.slice(0, i).some((prev) => links.get(prev)?.has(step));
      if (!reachable) add('warning', 'path-broken', `Scenario "${name(id)}": nothing earlier in the path has a declared link to "${name(step)}".`, id);
    });
  }

  // Statements that are not checkable are reported, never assumed.
  for (const [id, k] of Object.entries(mapOf(c.constraints))) {
    if (!(k as any)?.check) add('info', 'unverified', `Constraint "${name(id)}" names no check, so it is reported as unverified.`, id);
  }
  for (const [id, d] of Object.entries(mapOf(c.decisions))) {
    if ((d as any)?.status === 'open') {
      const blocked = listOf((d as any)?.appliesTo).map(name).join(', ') || 'the whole system';
      add('info', 'open-decision', `Open: "${(d as any)?.statement ?? id}" blocks ${blocked}.`, id);
    }
  }
  return problems;
}

export const countBySeverity = (problems: Problem[]) => ({
  error: problems.filter((p) => p.severity === 'error').length,
  warning: problems.filter((p) => p.severity === 'warning').length,
  info: problems.filter((p) => p.severity === 'info').length,
});

export { activations };
