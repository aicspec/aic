// What validating a contract tells an agent: violations, warnings, open items and the maturity of each element.
import { computeMaturity, maturitySummary } from '../core/maturity.ts';
import type { Contract } from '../core/model.ts';
import { countBySeverity, validateContract } from '../core/validate.ts';

export function validationReport(c: Contract) {
  const problems = validateContract(c);
  const maturity = computeMaturity(c);
  const counts = countBySeverity(problems);
  return {
    valid: counts.error === 0,
    counts,
    problems,
    maturity: {
      summary: maturitySummary(maturity),
      elements: Object.fromEntries([...maturity].map(([id, m]) => [id, { level: m.level, missing: m.missing.map((x) => `${x.level}: ${x.text}`) }])),
    },
  };
}
