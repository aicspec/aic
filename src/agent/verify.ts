// What conformance means for one contract, as a list an agent can work through, and the verdict its answers lead to.
// The server never sees the code. The checks are carried out by the agent, and the verdict says so.
import { activations, indexElements, listOf, mapOf, type Contract } from '../core/model.ts';
import { interfacesOf, UnknownModuleError } from './brief.ts';

export type CheckFamily = 'structural' | 'interface-and-type' | 'scenario' | 'constraint' | 'realisation';

export interface CheckItem {
  id: string;
  check: CheckFamily;
  primitive: string;
  element: string;
  // checkable: evidence can settle it. prose: words only, so any verdict on it stays a judgement.
  nature: 'checkable' | 'prose';
  statement: string;
  how: string;
}

export function verificationChecklist(c: Contract, moduleId?: string): CheckItem[] {
  const modules = mapOf(c.modules);
  if (moduleId && !modules[moduleId]) throw new UnknownModuleError(`There is no Module "${moduleId}". Modules: ${Object.keys(modules).join(', ') || 'none'}.`);
  const inScope = (id: string) => !moduleId || id === moduleId;
  const index = indexElements(c);
  const items: CheckItem[] = [];
  const add = (item: CheckItem) => items.push(item);

  for (const [id, m] of Object.entries(modules) as [string, any][]) {
    if (!inScope(id)) continue;
    const declared = listOf(m?.uses).map((u) => u?.to).filter(Boolean);
    const activatedBy = activations(c).filter((x) => x.module === id && x.value?.kind === 'channel').map((x) => x.value.channel);
    add({
      id: `structural:${id}:only-declared`, check: 'structural', primitive: 'Module', element: id, nature: 'checkable',
      statement: `"${m?.name ?? id}" uses only: ${declared.join(', ') || 'nothing outside itself'}${activatedBy.length ? `, and consumes ${activatedBy.join(', ')} because it is activated by them` : ''}.`,
      how: 'Inspect imports, clients, connection strings and published or consumed topics in this Module. Report anything not on the list.',
    });
    for (const u of listOf(m?.uses)) {
      if (!u?.to) continue;
      add({
        id: `structural:${id}:uses:${u.to}`, check: 'structural', primitive: 'Dependency', element: id, nature: 'checkable',
        statement: `"${m?.name ?? id}" uses ${u.to} with mode${listOf(u.modes).length === 1 ? '' : 's'} ${listOf(u.modes).join(', ')} and no other.`,
        how: 'Find each use in the code and compare it with the declared modes.',
      });
      if (u.onFailure) add({
        id: `interface-and-type:${id}:on-failure:${u.to}`, check: 'interface-and-type', primitive: 'Dependency', element: id, nature: 'checkable',
        statement: `When ${u.to} fails, "${m?.name ?? id}" does this: ${u.onFailure}`,
        how: 'Make the dependency fail in a running test and observe the behaviour.',
      });
    }
    for (const a of activations(c).filter((x) => x.module === id)) {
      const v = a.value ?? {};
      const what = v.kind === 'channel' ? `messages from ${v.channel}` : v.kind === 'schedule' ? `the schedule ${v.schedule ?? ''}`.trim() : 'continuous execution';
      add({
        id: `structural:${id}:activation:${a.index}`, check: 'structural', primitive: 'Module', element: id, nature: 'checkable',
        statement: `"${m?.name ?? id}" runs because of ${what}.`,
        how: 'Find what starts this code and compare it.',
      });
      for (const key of ['onDuplicate', 'onFailure'] as const) {
        if (v[key]) add({
          id: `interface-and-type:${id}:activation:${a.index}:${key}`, check: 'interface-and-type', primitive: 'Module', element: id, nature: 'checkable',
          statement: `${key === 'onDuplicate' ? 'On a duplicate message' : 'When an activation fails'}: ${v[key]}`,
          how: key === 'onDuplicate' ? 'Deliver the same message twice in a running test and observe the outcome.' : 'Make the activation fail in a running test and observe the outcome.',
        });
      }
    }
    if (m?.does) add({
      id: `structural:${id}:does`, check: 'structural', primitive: 'Module', element: id, nature: 'prose',
      statement: `"${m?.name ?? id}" has this responsibility: ${String(m.does)}`, how: 'Read the code and give your judgement.',
    });
    listOf(m?.doesNot).forEach((text, i) => add({
      id: `structural:${id}:does-not:${i}`, check: 'structural', primitive: 'Module', element: id, nature: 'prose',
      statement: `"${m?.name ?? id}" does not: ${text}`, how: 'Read the code and give your judgement.',
    }));

    for (const [iid, iface] of Object.entries(mapOf(m?.interfaces)) as [string, any][]) {
      add({
        id: `interface-and-type:${iid}:surface`, check: 'interface-and-type', primitive: 'Interface', element: iid, nature: 'checkable',
        statement: `"${iface?.name ?? iid}" exposes ${Object.keys(mapOf(iface?.operations)).join(', ') || `what ${iface?.spec?.ref ?? 'its specification'} declares`} and nothing else.`,
        how: 'List the routes, handlers or messages the code really exposes and compare them. Undeclared ones are violations.',
      });
      for (const [oid, op] of Object.entries(mapOf(iface?.operations)) as [string, any][]) {
        add({
          id: `interface-and-type:${iid}:${oid}`, check: 'interface-and-type', primitive: 'Interface', element: iid, nature: 'checkable',
          statement: `Operation ${oid}${op?.input ? ` takes ${op.input}` : ''}${op?.output ? ` and returns ${op.output}` : ''}${listOf(op?.errors).length ? `, with errors ${listOf(op.errors).join(', ')}` : ''}.`,
          how: 'Call it in a running test, including one call for each error, and compare the data with the Type.',
        });
      }
    }
  }

  // Stores and Channels: in scope when the Module owns or uses them.
  const touchedBy = (id: string) => !moduleId || listOf(modules[moduleId]?.uses).some((u) => u?.to === id) || activations(c).some((a) => a.module === moduleId && a.value?.channel === id);
  for (const [id, s] of Object.entries(mapOf(c.stores)) as [string, any][]) {
    if (!touchedBy(id) && s?.owner !== moduleId) continue;
    add({
      id: `structural:store:${id}`, check: 'structural', primitive: 'Store', element: id, nature: 'checkable',
      statement: `Store "${s?.name ?? id}" is owned by ${s?.owner ?? 'nobody yet'}, and only its declared users access it${s?.holds ? `; it holds ${s.holds}` : ''}${s?.consistency ? ` with ${s.consistency} consistency` : ''}.`,
      how: 'Search the whole codebase for access to this store, including raw queries and shared connection strings.',
    });
  }
  for (const [id, ch] of Object.entries(mapOf(c.channels)) as [string, any][]) {
    if (!touchedBy(id)) continue;
    add({
      id: `interface-and-type:channel:${id}`, check: 'interface-and-type', primitive: 'Channel', element: id, nature: 'checkable',
      statement: `Channel "${ch?.name ?? id}" carries ${ch?.carries ?? 'an undeclared Type'}${ch?.delivery ? ` with ${ch.delivery} delivery` : ''}.`,
      how: 'Compare the messages sent and received with the Type, and check how the channel is configured.',
    });
  }

  if (!moduleId) {
    for (const [id, b] of Object.entries(mapOf(c.boundaries)) as [string, any][]) {
      add({
        id: `structural:boundary:${id}`, check: 'structural', primitive: 'Boundary', element: id, nature: 'checkable',
        statement: `Boundary "${b?.name ?? id}" exposes only ${listOf(b?.exposes).join(', ') || 'nothing'}, and may depend only on ${listOf(b?.mayDependOn).join(', ') || 'nothing'}.`,
        how: 'Look for code outside the Boundary reaching anything it does not expose, and for uses of Boundaries it may not depend on.',
      });
    }
    for (const [id, t] of Object.entries(mapOf(c.types)) as [string, any][]) {
      add({
        id: `interface-and-type:type:${id}`, check: 'interface-and-type', primitive: 'Type', element: id, nature: 'checkable',
        statement: `Data declared as ${id} conforms to it wherever it crosses a boundary or is stored${Object.keys(mapOf(t?.fields)).length ? `: ${Object.keys(mapOf(t?.fields)).join(', ')}` : ''}.`,
        how: 'Compare real payloads and stored records with the Type.',
      });
    }
  }

  const touchesModule = (path: any[]) => !moduleId || path.includes(moduleId) || interfacesOf(modules[moduleId]).some((i) => path.includes(i));
  for (const [id, s] of Object.entries(mapOf(c.scenarios)) as [string, any][]) {
    if (!touchesModule(listOf(s?.path))) continue;
    add({
      id: `scenario:${id}`, check: 'scenario', primitive: 'Scenario', element: id, nature: 'checkable',
      statement: `When ${s?.when} Then ${s?.then}${listOf(s?.path).length ? ` Path: ${listOf(s.path).join(' > ')}.` : ''}`,
      how: 'Run the implementation as it is and trigger the starting event. Check the outcome and that it went through this path. Do not change the code to test it.',
    });
  }

  const scope = moduleId ? new Set<string>([moduleId, ...interfacesOf(modules[moduleId]), ...listOf(modules[moduleId]?.uses).map((u) => u?.to)]) : null;
  for (const [id, k] of Object.entries(mapOf(c.constraints)) as [string, any][]) {
    const targets = listOf(k?.appliesTo);
    if (scope && targets.length && !targets.some((t) => scope.has(t))) continue;
    add({
      id: `constraint:${id}`, check: 'constraint', primitive: 'Constraint', element: id, nature: k?.check ? 'checkable' : 'prose',
      statement: `${k?.statement ?? id}${targets.length ? ` Applies to: ${targets.join(', ')}.` : ' Applies to the whole system.'}`,
      how: k?.check ? `Check it by ${k.check.method}${k.check.detail ? `: ${k.check.detail}` : ''}.` : 'It names no check, so report it as unverified unless you have a judgement to record.',
    });
  }

  for (const [id, m] of Object.entries(modules) as [string, any][]) {
    if (!inScope(id) || !m?.deployedIn) continue;
    add({
      id: `realisation:${id}:unit`, check: 'realisation', primitive: 'Deployment Unit', element: m.deployedIn, nature: 'checkable',
      statement: `"${m?.name ?? id}" is built and released in Deployment Unit ${m.deployedIn}.`,
      how: 'Compare the deployment artefacts, such as Dockerfiles and manifests, with the Deployment Units.',
    });
  }
  for (const [id, tech] of Object.entries(mapOf(c.bindings))) {
    const e = index.get(id);
    if (scope && !scope.has(id) && !(e?.kind === 'deploymentUnit' && modules[moduleId!]?.deployedIn === id)) continue;
    add({
      id: `realisation:binding:${id}`, check: 'realisation', primitive: 'Binding', element: id, nature: 'checkable',
      statement: `${id} uses this technology: ${String(tech)}.`,
      how: 'Check the code, its dependencies and the deployment artefacts.',
    });
  }
  return items;
}

export interface CheckResult { id: string; status: 'pass' | 'fail' | 'unverified'; evidence?: string }

export function conformanceVerdict(c: Contract, results: CheckResult[], moduleId?: string) {
  const items = verificationChecklist(c, moduleId);
  const known = new Map(items.map((i) => [i.id, i]));
  const reported = new Map(results.map((r) => [r.id, r]));
  const unknownIds = results.filter((r) => !known.has(r.id)).map((r) => r.id);

  type Row = { id: string; check: CheckFamily; primitive: string; element: string; statement: string; evidence?: string };
  const failed: Row[] = [], passed: Row[] = [], judgements: Row[] = [], unverified: Row[] = [], notAnswered: Row[] = [];
  for (const item of items) {
    const r = reported.get(item.id);
    const row = { id: item.id, check: item.check, primitive: item.primitive, element: item.element, statement: item.statement, evidence: r?.evidence };
    if (!r) { (item.nature === 'prose' ? unverified : notAnswered).push(row); continue; }
    // Without evidence a pass is only a claim, so it does not count.
    if (r.status === 'pass' && !r.evidence?.trim()) { (item.nature === 'prose' ? unverified : notAnswered).push({ ...row, evidence: 'A pass was reported with no evidence.' }); continue; }
    if (r.status === 'fail') failed.push(row);
    else if (r.status === 'unverified') (item.nature === 'prose' ? unverified : notAnswered).push(row);
    // Prose is never verified: the specification records this as a judgement, not as a passing check.
    else if (item.nature === 'prose') judgements.push(row);
    else passed.push(row);
  }

  const verdict = failed.length ? 'non-conformant' : notAnswered.length || unknownIds.length ? 'incomplete' : 'conformant';
  return {
    verdict,
    scope: moduleId ? `Module ${moduleId}` : 'whole contract',
    basis: 'Computed from what the agent reported. The tool did not inspect the code.',
    summary: { checks: items.length, passed: passed.length, failed: failed.length, judgements: judgements.length, unverified: unverified.length, notAnswered: notAnswered.length },
    failed, notAnswered, unverified, judgements, unknownIds,
  };
}
