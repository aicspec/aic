# Writing a contract for a new system

The aim is a contract the user recognises as their design, before any code is written. You draft it, and they decide.

1. Ask first, in one short round: what the system is for and who uses it, its goals, what is out of scope, the constraints you must respect (scale, compliance, budget, deadlines) and any technology already chosen. Do not start writing until you know the purpose and the nonGoals.
2. Read `npx -y @aicspec/cli reference contract-reference` and both examples. `reference example-sketch` is the smallest useful contract, and `reference example-online-shop` is a complete one.
3. Start with the shape: the system, Modules with `does` and `doesNot`, Boundaries, and the main Stores, Channels and Externals. A Draft contract is valid, and every gap is reported as work still to do.
4. Do not decide silently. Where there is a real alternative, such as synchronous or asynchronous, one store or several, or building or buying, write your proposal as a Decision with `kind: choice`, `status: open`, a rationale and the alternatives. The user accepts or rejects it. What you do not know is a Decision with `kind: question` and `status: open`.
5. Size it to what has been decided, not to the ambition. A large project still starts with a few Modules and its open questions. More detail invented now is architecture nobody chose.
6. Harden where the user agrees: Interfaces, Types, failure behaviour and Deployment Units make an element Specified, and Scenarios for the main flows and Constraints with a means of checking make it Verifiable.
7. Run `npx -y @aicspec/cli validate` after each step, and fix every violation before going on.

Then hand it to the user for review, as [review.md](review.md) describes.

Do not start implementing until the user has accepted the contract and the open Decisions that block the first Modules. Then follow [implement.md](implement.md).
