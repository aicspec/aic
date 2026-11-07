// The documents an agent can ask for. They ship inside the package, next to the code.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The package root holds spec/, schema/, examples/ and skills/. Compiled code sits deeper than the source, so search upwards.
export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!(existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'spec')))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('Cannot find the AIC documents that ship with this package.');
    dir = up;
  }
  return dir;
}

// Links in the specification are relative to this repository, which an agent does not have.
const absoluteLinks = (text: string) =>
  text.replace(/\]\(\.\.\/([^)]+)\)/g, '](https://github.com/aicspec/aic/blob/main/$1)')
    .replace(/\]\((contract-reference-0\.1\.md[^)]*)\)/g, '](https://github.com/aicspec/aic/blob/main/spec/$1)');

const FILES = {
  specification: 'spec/aic-specification-0.1.md',
  'contract-reference': 'spec/contract-reference-0.1.md',
  schema: 'schema/aic-contract-0.1.schema.json',
  'example-online-shop': 'examples/online-shop.aic.yaml',
  'example-sketch': 'examples/sketch.aic.yaml',
} as const;

export type DocumentName = keyof typeof FILES;
export const DOCUMENT_NAMES = Object.keys(FILES) as DocumentName[];

export function readDocument(name: DocumentName): string {
  const text = readFileSync(join(packageRoot(), FILES[name]), 'utf8');
  return FILES[name].endsWith('.md') ? absoluteLinks(text) : text;
}
