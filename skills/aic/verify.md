# Verifying an implementation

The command line does not inspect your code. You carry out the checks and report what you found. The verdict is computed from your report and says so, so an honest report is the whole value of it.

1. Run `npx -y @aicspec/cli checklist <module>` to check one Module, or `npx -y @aicspec/cli checklist` for the whole contract.
2. Work through every item. Run the implementation as it is, through what the contract declares. Do not change code in order to pass a check, and do not change the contract.
3. Give each item a status:
   - `pass`: you checked it and it holds. Evidence is required: a file and line, a test run, or an observed result.
   - `fail`: it does not hold. Say what you found. A failure names the primitive it violates.
   - `unverified`: you did not or could not check it.
4. Pass the results to `verdict` on standard input, with `--module` if the checklist was limited to one. Do not leave a results file in the repository:

   ```sh
   npx -y @aicspec/cli verdict - --module orders <<'EOF'
   [
     { "id": "<checklist item id>", "status": "pass", "evidence": "src/orders/api.ts:42, test orders.test.ts passes" },
     { "id": "<checklist item id>", "status": "unverified" }
   ]
   EOF
   ```

5. Show the user the verdict, including the unverified list. Passing must never hide what was not checked.

The verdict means:

- non-conformant: at least one check failed. Fix the code, or raise the contract with the user.
- incomplete: checkable items were not answered or have no evidence. Keep going.
- conformant: every checkable item passed. Prose items and Constraints with no check are still listed as judgements or unverified, because words are open to interpretation.

The checks fall into five families: structural (only declared dependencies and store access), interface and type (what is exposed, and data shapes), scenario (the outcome occurs through the declared path), constraint (each rule holds by its stated means), and realisation (deployment artefacts match the Deployment Units and Bindings).
