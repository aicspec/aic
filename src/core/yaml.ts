// YAML in and out. Output always follows the schema's property order, so diffs stay small and stable.
import { Document, parse, YAMLParseError, isMap, isScalar, isSeq, visit } from 'yaml';
import { branchFor, resolve, schema, type Contract } from './model.ts';

export interface ParseResult { contract?: Contract; error?: { message: string; line?: number } }

export function parseContract(text: string): ParseResult {
  try {
    const value = parse(text, { version: '1.2' });
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: { message: 'A contract must be a YAML mapping.' } };
    return { contract: value };
  } catch (e) {
    if (e instanceof YAMLParseError) return { error: { message: e.message.split('\n')[0], line: e.linePos?.[0]?.line } };
    return { error: { message: String(e) } };
  }
}

export function canonicalize(value: any, node: any = schema): any {
  const s = resolve(node);
  if (s.oneOf && value && typeof value === 'object') return canonicalize(value, branchFor(s.oneOf, value));
  if (Array.isArray(value)) return value.map((v) => canonicalize(v, s.items ?? {}));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  for (const key of Object.keys(s.properties ?? {})) {
    if (key in value) out[key] = canonicalize(value[key], s.properties[key]);
  }
  const rest = typeof s.additionalProperties === 'object' ? s.additionalProperties : {};
  for (const key of Object.keys(value)) {
    if (!(key in out)) out[key] = canonicalize(value[key], rest);
  }
  return out;
}

export function toYaml(c: Contract): string {
  const doc = new Document(canonicalize(c));
  visit(doc, {
    Seq(_key, node) {
      const scalars = node.items.every((i) => isScalar(i));
      const length = node.items.reduce((n: number, i: any) => n + String(i.value ?? '').length + 2, 0);
      if (scalars && length <= 64) node.flow = true;
    },
    Pair(_key, pair) {
      // Fields of a Type read best on one line.
      if (isScalar(pair.key) && pair.key.value === 'fields' && isMap(pair.value)) {
        for (const f of pair.value.items) if (isMap(f.value)) f.value.flow = true;
      }
      return undefined;
    },
  });
  void isSeq;
  // A blank line between top-level sections makes long contracts easier to scan.
  return doc.toString({ lineWidth: 0 }).replace(/\n(?=[A-Za-z])/g, '\n\n');
}
