// A contract may be split into several files joined by $ref, as OpenAPI allows.
// Bundling produces the one complete file that the schema and every tool work from.
import { parseDocument } from 'yaml';

export type ReadFile = (path: string) => string;

const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.');

function join(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative;
  const parts = `${base}/${relative}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..' && out.length && out[out.length - 1] !== '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return out.join('/');
}

function pointer(doc: any, ptr: string, ref: string): any {
  let cur = doc;
  for (const raw of ptr.split('/').filter(Boolean)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object' || !(key in cur)) throw new Error(`Nothing at "${ptr}" for $ref "${ref}".`);
    cur = cur[key];
  }
  return cur;
}

export function bundle(path: string, read: ReadFile): any {
  const cache = new Map<string, any>();
  const load = (file: string) => {
    if (cache.has(file)) return cache.get(file);
    let text: string;
    try { text = read(file); } catch { throw new Error(`Cannot read "${file}".`); }
    const doc = parseDocument(text, { version: '1.2' });
    if (doc.errors.length) throw new Error(`${file}: ${doc.errors[0].message.split('\n')[0]}`);
    const value = doc.toJS();
    cache.set(file, value);
    return value;
  };

  const walk = (node: any, file: string, chain: string[]): any => {
    if (Array.isArray(node)) return node.map((item) => walk(item, file, chain));
    if (node === null || typeof node !== 'object') return node;
    if ('$ref' in node) {
      const ref = String(node.$ref);
      if (Object.keys(node).length > 1) throw new Error(`${file}: a $ref cannot have sibling keys ("${ref}").`);
      const [target, ptr = ''] = ref.split('#');
      const nextFile = target ? join(dirname(file), target) : file;
      const id = `${nextFile}#${ptr}`;
      if (chain.includes(id)) throw new Error(`Circular $ref: ${[...chain, id].join(' -> ')}`);
      return walk(pointer(load(nextFile), ptr, ref), nextFile, [...chain, id]);
    }
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, file, chain)]));
  };

  return walk(load(path), path, [`${path}#`]);
}
