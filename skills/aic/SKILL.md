---
name: aic
description: Read, change, implement and verify an AIC architecture contract (aic.yaml or a file ending in .aic.yaml) with the AIC command line. Use when the repository has an AIC contract, or when the user asks to implement, check or change the architecture such a contract records.
---

# Working with an AIC contract

AIC (Architecture Implementation Contract) records a system's architecture in a YAML file, usually `aic.yaml` at the root of the repository. It is the source of truth: implement what it says, and never invent architecture it leaves out.

An AIC contract fixes what an architect would want to be consulted about if it changed: responsibilities, permitted interactions, data shapes at boundaries, delivery guarantees, failure behaviour and what is deployed together. Everything else is yours to decide: internal design, algorithms, code structure, and libraries unless a Binding fixes them.

If the repository has no contract, ask the user. They can design one at https://aicspec.dev/editor/ and save it as `aic.yaml`.

## Three rules

1. The contract outranks the code and your own preferences. If they disagree, report it.
2. Do not change the contract to make your implementation fit, or to make a check pass. Only the architect changes the architecture.
3. Never report something as verified unless you checked it. Unverified statements are reported as unverified.

## The command line

Run the commands from the directory that holds the contract. They read `aic.yaml`, or the only `*.aic.yaml`, from there; pass `--contract <path>` for another file. They run on this machine and send nothing anywhere.

```sh
npx -y @aicspec/cli <command>
```

| Command | What it gives you |
| --- | --- |
| `validate` | Violations, warnings, open items and the maturity of each element. Exits 1 if there are violations. Add `--json` for the full report |
| `plan` | The Modules in build order, with what each needs first and what blocks it |
| `brief <module>` | One Module's contract as a bounded task |
| `checklist [module]` | Every commitment an implementation must honour, with an id and how to check it |
| `verdict <results.json \| ->` | The verdict by the AIC conformance rules, from your checklist results |
| `reference <document>` | `specification`, `contract-reference`, `schema`, `example-online-shop` or `example-sketch` |
| `bundle` | Joins a contract split with `$ref` into one file. Every other command does this for you |

`validate` prints text. Every other command prints JSON.

## What to read for each task

| To do this | Read | Then run |
| --- | --- | --- |
| Understand a contract | [read.md](read.md) | `validate` |
| Change the design | [edit.md](edit.md) | `validate`, `reference contract-reference` |
| Build it | [implement.md](implement.md) | `validate`, `plan`, `brief <module>` |
| Check what was built | [verify.md](verify.md) | `checklist`, `verdict` |

Read the file for the task before you start it.
