# AIC

**Architecture Implementation Contract**: an open, technology-agnostic contract for software architecture.

Website: [aicspec.dev](https://aicspec.dev)

Coding agents make architectural decisions silently when nothing records them. An AIC contract states what a system must do, how it is divided, how its parts may interact and how it is deployed, so that people can read it and machines can check it. Any tool can render it, any coding agent can implement it, and any verifier can test whether an implementation honours it.

## Start here

| Read this | To learn |
| --- | --- |
| [Specification](spec/aic-specification-0.1.md) | The problem, the 14 primitives, conformance and a worked example |
| [Contract reference](spec/contract-reference-0.1.md) | Every property of the format |
| [JSON Schema](schema/aic-contract-0.1.schema.json) | The single definition of the format |
| [Online shop example](examples/online-shop.aic.yaml) | A complete contract |
| [Sketch example](examples/sketch.aic.yaml) | The smallest useful contract, a Draft |

## Status

Version 0.1 is a working draft, so the format may still change.

## Author

Created by Victor Fernandez.

## Licence

Copyright 2026 Victor Fernandez. Licensed under the [Apache License 2.0](LICENSE).
