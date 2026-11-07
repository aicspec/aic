# Reading a contract

Everything is keyed by id, and all ids share one namespace.

| Section | Primitive | What it tells you |
| --- | --- | --- |
| system | System | Purpose, goals and non-goals. Everything serves the purpose |
| modules | Module | Code with one responsibility: does, doesNot, what activates it, what it uses |
| modules.*.interfaces | Interface | What a Module offers. Callers use only what is declared |
| modules.*.uses, externals.*.uses | Dependency | A declared use, with modes (call, publish, read, write) and failure behaviour. Undeclared use is a violation |
| stores | Store | State with one owner, a Type and a consistency level |
| channels | Channel | A conduit for messages, with its Type and delivery guarantee |
| externals | External | Anything the team does not control, and what is assumed about it |
| types | Type | The shape of data crossing a boundary or stored |
| boundaries | Boundary | Who may see what: exposes and mayDependOn |
| scenarios | Scenario | An end-to-end behaviour: when, then and the path it runs through |
| decisions | Decision | Accepted decisions bind. Open questions block what they apply to |
| constraints | Constraint | A rule or quality target, and how it is checked |
| deploymentUnits | Deployment Unit | What is built, released and scaled together |
| bindings | Binding | Element id to technology, as free text |

Maturity is per element. Draft has prose, which is enough to discuss. Specified has Interfaces, Types, failure behaviour and Deployment Units, which is enough to implement. Verifiable adds Scenarios and Constraints with a means of checking.

Run `npx -y @aicspec/cli validate` to see violations, gaps and the maturity of each element. For the meaning of a primitive, read `npx -y @aicspec/cli reference specification`; for each property, `npx -y @aicspec/cli reference contract-reference`.
