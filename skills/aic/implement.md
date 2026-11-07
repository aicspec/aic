# Implementing a contract

1. Run `npx -y @aicspec/cli validate`. Do not start while there are violations. Report them.
2. Run `npx -y @aicspec/cli plan`. It orders the Modules so that providers come first and says which are ready.
3. For each Module, run `npx -y @aicspec/cli brief <module>`. It is a bounded task, and it should be all you need to read about the system.
4. If `ready` is false, do not guess. Show the blockers and what is missing to the user and ask how to proceed. An open Decision blocks what it applies to.
5. Build the Module, following the rules in the brief:
   - Use only its declared dependencies, in their declared modes.
   - Expose exactly its declared Interfaces and operations, using its Types.
   - Implement each onFailure and onDuplicate as written.
   - Access a Store only if the Module owns it or declares it.
   - Use the technology named in bindings. Where there is none, the choice is yours.
6. Respect doesNot and the system's nonGoals. Do not add what they exclude, even if it looks helpful.
7. Verify each Module before starting the next, as [verify.md](verify.md) describes.

If the contract is wrong, impossible or silent on something an architect would care about, stop and tell the user what you found and what you suggest. They decide, and then the contract changes first.
