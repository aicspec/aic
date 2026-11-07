// The library behind the command line, for tools built on AIC.
export { bundle, type ReadFile } from './core/bundle.ts';
export { computeMaturity, maturitySummary, LEVELS, type Level, type Maturity } from './core/maturity.ts';
export { schema, type Contract } from './core/model.ts';
export { countBySeverity, validateContract, type Problem, type Severity } from './core/validate.ts';
export { parseContract, toYaml, type ParseResult } from './core/yaml.ts';
export { implementationPlan, moduleBrief, UnknownModuleError } from './agent/brief.ts';
export { ContractError, readContract } from './agent/contract.ts';
export { validationReport } from './agent/report.ts';
export { conformanceVerdict, verificationChecklist, type CheckFamily, type CheckItem, type CheckResult } from './agent/verify.ts';
