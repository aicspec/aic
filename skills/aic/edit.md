# Changing a contract

Edit the contract file with your own tools.

1. Get the user's agreement on the architectural change first. A contract records decisions, so do not make them silently.
2. Read the relevant part of `npx -y @aicspec/cli reference contract-reference`, and use `npx -y @aicspec/cli reference example-online-shop` for how things look.
3. Make the smallest edit. Keep existing ids: other elements refer to them, and ids are unique across the whole contract.
4. Run `npx -y @aicspec/cli validate` after each edit, and fix every violation before moving on.
5. Record the why. Use a Decision for a choice with a rationale, and `status: open` for a question you cannot answer.

Keep the contract at the right level. It holds what an architect would want to be consulted about. It does not hold internal design, algorithms or layout, and technology belongs only in bindings. If you are describing code in YAML, stop.

Prefer existing primitives over new shapes: a worker is a Module activated by a Channel, a cache is a volatile Store, a scheduled job is a Module activated by a schedule.

A person can also open the same file in https://aicspec.dev/editor/, which draws it. Comments in the YAML are lost if it is saved from there, so keep rationale in Decisions, not comments.
