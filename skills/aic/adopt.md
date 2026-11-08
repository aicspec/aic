# Writing a contract for code that already exists

The aim is to record the architecture the code has today, at the level an architect cares about, so the user can see it and agents can keep to it from then on. This is the one time the code is the source. Once the user accepts the contract, it outranks the code.

1. Read `npx -y @aicspec/cli reference contract-reference` and `npx -y @aicspec/cli reference example-online-shop`, so you know what each primitive holds.
2. Survey the repository before you write anything. Look for what is deployed (Dockerfiles, service and function definitions, workspace packages, manifests), what runs (entry points, HTTP routes, consumers, scheduled jobs), where state lives (databases, tables, caches, buckets), what carries messages (queues, topics, event buses) and what the system calls that the team does not control.
3. Map what you found onto the primitives:
   - A Module is a unit of responsibility, not a file, class or folder. A service usually has a handful. A monolith is split by the areas that have their own responsibility, grouped with Boundaries.
   - A Store has one owner: the Module that writes it. A database shared by several services is a finding, not a Store with several owners.
   - Routes, RPC services, consumed events and commands are Interfaces, and the shapes that cross them are Types.
   - Each Dependency records how one element uses another: call, publish, read or write.
   - Deployables are Deployment Units, and frameworks, databases and services are Bindings.
4. Record what the code does, not what it should do. Every Dependency, store access and Interface should point to code you read. Write `onFailure` as what actually happens, even if that is "The error reaches the caller". Leave out what you cannot tell, so the element stays Draft and the gap is reported.
5. Do not tidy up silently. Where the code looks accidental, such as a Module reading another's Store, a cycle, a call that crosses what looks like a boundary, or one thing done two ways, record it as it is and add a Decision with `kind: question` and `status: open`, which applies to the elements involved. Say what you found and where, with the file path. Do not change the code. The user decides whether it is intended.
6. Take the system's purpose, goals and nonGoals from the README and the docs, then confirm them with the user. Ask at the same time about what the code cannot tell you, for example which boundaries are deliberate.
7. Keep it readable in one sitting. If you pass about 25 Modules, you are describing code rather than architecture: merge them.
8. Run `npx -y @aicspec/cli validate` and fix every violation. Gaps are fine at this stage.
9. Check the contract against the code with `npx -y @aicspec/cli checklist <module>`, at least for the main Modules. A failure means you misread the code, so fix the contract, or the code breaks its own pattern, so raise it as an open Decision.

Then hand it to the user for review, as [review.md](review.md) describes.

Once they accept it, suggest committing it, and adding a line to the repository's agent instructions (CLAUDE.md or AGENTS.md), with their agreement: "The architecture is recorded in aic.yaml. Follow it, and change it only with the user's agreement." From then on, work as [edit.md](edit.md), [implement.md](implement.md) and [verify.md](verify.md) describe.
