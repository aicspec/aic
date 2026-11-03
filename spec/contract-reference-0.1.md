# AIC contract reference

Generated from [`schema/aic-contract-0.1.schema.json`](../schema/aic-contract-0.1.schema.json). Do not edit by hand.

## Contract file

One system's architecture, written with the AIC primitives. Every element shares one namespace of ids. The x-aic-* keywords are annotations: x-aic-ref names the primitives a value may refer to, x-aic-primitive marks a primitive, and x-aic-widget is a rendering hint for tools.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `aic` | `0.1` | yes | Version of the AIC specification this contract is written against. |
| `system` | [System](#system) | yes | The thing described. Everything else serves its purpose and respects its non-goals. |
| `boundaries` | map of id to [Boundary](#boundary) |  |  |
| `modules` | map of id to [Module](#module) |  |  |
| `stores` | map of id to [Store](#store) |  |  |
| `channels` | map of id to [Channel](#channel) |  |  |
| `externals` | map of id to [External](#external) |  |  |
| `types` | map of id to [Type](#type) |  |  |
| `scenarios` | map of id to [Scenario](#scenario) |  |  |
| `decisions` | map of id to [Decision](#decision) |  |  |
| `constraints` | map of id to [Constraint](#constraint) |  |  |
| `deploymentUnits` | map of id to [DeploymentUnit](#deployment-unit) |  |  |
| `bindings` | map of id to string |  | Maps an element id to the technology that realises it, as free text. Replacing a Binding leaves the rest of the contract unchanged. |

## Id

Unique across the whole contract, whatever the primitive.

Type: string

## Name

Human-readable name.

Type: string

## StringList

Type: list of string

## System

The thing described. Everything else serves its purpose and respects its non-goals.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable name. |
| `version` | string |  | Version of this contract. Other contracts refer to it by name and version. |
| `purpose` | string |  | Why the system exists. |
| `goals` | [StringList](#stringlist) |  | What the system must achieve. |
| `nonGoals` | [StringList](#stringlist) |  | What the system deliberately does not do. |

## Scenario

An end-to-end behaviour. It states what must happen, not how to test it: the verifier decides that.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string |  | Human-readable name. |
| `given` | string |  | Starting state, if it matters. |
| `when` | string | yes | The starting event. |
| `then` | string | yes | The expected outcome. |
| `path` | list of reference to module, interface, store, channel, external |  | Elements the behaviour runs through, in order. Each must be reachable from an earlier one through a declared link. |

## Decision

A choice, assumption or open question with its rationale. Accepted decisions bind; open ones block what depends on them.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string |  | Human-readable name. |
| `kind` | `choice`, `assumption`, `question` | yes |  |
| `status` | `open`, `accepted`, `rejected` | yes |  |
| `statement` | string | yes | What was chosen, assumed or asked. |
| `rationale` | string |  | Why. |
| `alternatives` | [StringList](#stringlist) |  | Options considered and not taken. |
| `appliesTo` | list of reference to module, interface, store, channel, external, boundary, deploymentUnit, type, dependency |  | Elements it concerns. Empty means the whole system. |

## Module

Code with one responsibility. It behaves as stated and uses only what it declares.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable name. |
| `does` | string |  | Its responsibility: what it does. |
| `doesNot` | [StringList](#stringlist) |  | Optional. What it deliberately does not do. |
| `role` | string |  | A descriptive label such as gateway or router. It creates no obligations. |
| `boundary` | reference to boundary |  | The Boundary it belongs to. |
| `deployedIn` | reference to deploymentUnit |  | The one Deployment Unit it is placed in. |
| `interfaces` | map of id to [Interface](#interface) |  | What this Module offers. A call to one of them activates the Module. |
| `activatedBy` | list of [Activation](#activation) |  | What else makes it run, besides calls to its Interfaces. |
| `uses` | list of [Dependency](#dependency) |  | Its Dependencies. Any other use is a violation. |

## Activation

### Channel

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `kind` | `channel` | yes |  |
| `channel` | reference to channel | yes |  |
| `onDuplicate` | string |  | How a repeated message is handled. Needed when delivery is at-least-once. |
| `onFailure` | string |  | What happens when handling a message fails. |

### Schedule

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `kind` | `schedule` | yes |  |
| `schedule` | string | yes | For example: every hour. |

### Continuous

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `kind` | `continuous` | yes |  |

## Store

State that outlives a request, described by what it holds. A database, cache or file store.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable name. |
| `description` | string |  |  |
| `boundary` | reference to boundary |  | The Boundary it belongs to. |
| `owner` | reference to module, boundary |  | The one Module or Boundary that owns it. Access from outside the owner must be justified by a Decision. |
| `holds` | reference to type |  | The Type it holds. |
| `consistency` | `strong`, `eventual` |  |  |
| `durability` | `durable`, `volatile` |  | A cache is volatile. |
| `derivedFrom` | reference to store |  | The source Store of a cache or replica. |

## Channel

A named conduit that carries messages between Modules. Its producers and consumers follow from Dependencies and activations.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable name. |
| `description` | string |  |  |
| `boundary` | reference to boundary |  | The Boundary it belongs to. |
| `style` | `topic`, `queue`, `stream` |  |  |
| `carries` | reference to type |  | The Type of its messages. |
| `delivery` | `at-most-once`, `at-least-once`, `exactly-once` |  |  |
| `ordering` | `none`, `per-key`, `total` |  |  |

## External

Anything the team does not control: users, third parties, upstream systems.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable name. |
| `kind` | `user`, `third-party`, `upstream-system`, `other` |  |  |
| `description` | string |  |  |
| `assumes` | [StringList](#stringlist) |  | What the system assumes about it. |
| `contract` | object |  | Another AIC contract this External refers to. Only what that contract exposes may be used. |
| `uses` | list of [Dependency](#dependency) |  | Inbound use: the Interfaces or Channels of this system that it relies on. |

## Interface

What a Module offers to others. Callers use only what is declared. Its protocol belongs in a Binding.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable name. |
| `description` | string |  |  |
| `operations` | map of id to [Operation](#operation) |  |  |
| `spec` | [SpecRef](#specification-reference) |  | An existing document that describes this Interface. |

## Operation

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `description` | string |  |  |
| `input` | reference to type |  |  |
| `output` | reference to type |  |  |
| `errors` | [StringList](#stringlist) |  | Failures a caller must handle. |

## Specification reference

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `format` | `openapi`, `asyncapi`, `protobuf`, `jsonschema`, `other` | yes |  |
| `ref` | string | yes | Path or URL. |

## Dependency

A directed use of an Interface, Store, Channel or External. Undeclared use is a violation.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string |  | Optional. Needed only for a Constraint or Decision to refer to this Dependency. |
| `to` | reference to interface, store, channel, external | yes |  |
| `modes` | list of `call`, `publish`, `read`, `write` | yes | The kind of use, not the protocol. |
| `description` | string |  | Why it is used. |
| `onFailure` | string |  | Required behaviour when the target fails. |
| `justifiedBy` | reference to decision |  | The Decision that allows access to a Store from outside its owner. |

## Type

The shape and meaning of data that crosses a boundary or is stored. Either list its fields or point to an existing definition.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `description` | string |  |  |
| `fields` | map of id to [Field](#field) |  |  |
| `definedBy` | [SpecRef](#specification-reference) |  | An existing document that defines this Type. |

## Field

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `type` | string | yes | A basic type such as string or number, or the name of a Type. |
| `required` | boolean |  |  |
| `description` | string |  |  |

## Boundary

A named grouping of elements with visibility rules. It says who may see and depend on what.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable name. |
| `kind` | `domain`, `layer`, `service`, `other` |  |  |
| `description` | string |  |  |
| `within` | reference to boundary |  | The Boundary that contains this one. |
| `exposes` | list of reference to interface, channel, store |  | Elements inside it that others may use. When absent, everything inside is visible. An empty list differs from an absent one: empty states a rule, absent states none. |
| `mayDependOn` | list of reference to boundary |  | Boundaries it may use. When absent, there is no restriction. An empty list differs from an absent one: empty states a rule, absent states none. |

## Constraint

A measurable requirement or rule: a quality target, an architectural rule or a cross-cutting requirement. It holds wherever it applies.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string |  | Human-readable name. |
| `category` | `quality`, `architecture`, `cross-cutting` |  |  |
| `statement` | string | yes |  |
| `appliesTo` | list of reference to module, interface, store, channel, external, boundary, deploymentUnit, dependency |  | Elements it is attached to. Empty means the whole system. |
| `check` | object |  | How it is checked. Without one, it is reported as unverified. |

## Deployment Unit

What is built, released and scaled together. Modules name the unit they are placed in.

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable name. |
| `description` | string |  |  |
| `scaling` | string |  | How it scales. |
