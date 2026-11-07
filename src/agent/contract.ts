// Reading a contract that an agent sent as text.
import { parseContract } from '../core/yaml.ts';
import type { Contract } from '../core/model.ts';

const hasRef = (node: unknown): boolean => {
  if (Array.isArray(node)) return node.some(hasRef);
  if (!node || typeof node !== 'object') return false;
  return '$ref' in node || Object.values(node).some(hasRef);
};

export class ContractError extends Error {}

export function readContract(text: string): Contract {
  const { contract, error } = parseContract(text);
  if (!contract) throw new ContractError(`The contract is not valid YAML${error?.line ? ` (line ${error.line})` : ''}: ${error?.message}`);
  // The server sees one file, so it cannot follow a reference to another.
  if (hasRef(contract)) throw new ContractError('This contract is split into several files with $ref. Replace each $ref with the content it points to and send one complete file.');
  return contract;
}
