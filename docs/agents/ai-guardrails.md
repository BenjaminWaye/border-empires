# AI CPU Guardrails

Read this before touching any AI planner, snapshot, or selector code.

- Do not call heavy concrete AI selector functions from planner snapshot or planning-static cache builders. Specifically: `bestAiSettlementTile`, `bestAiTownSupportSettlementTile`, `bestAiIslandSettlementTile`, `bestAiFortTile`, `bestAiEconomicStructure`, `bestAiEnemyPressureAttack`, `bestAiFrontierAction`.
- Planner snapshot and planning-static cache code must derive booleans and coarse scores from cached territory summaries, lightweight signals, and versioned indexes only.
- Concrete AI target selection should run only for the action the AI actually chose. Repeated late-game selector scans must be cached or version-gated.
- When changing AI code, run the server AI regression tests and keep coverage for any bug that could reintroduce multi-second AI ticks on a single CPU.
- Treat failing regression tests as merge blockers. Do not merge, push, or deploy when the relevant package test suite is failing, even if the feature you were working on seems unrelated.
- Any branch that changes `packages/client/src/main.ts` must rerun `pnpm --filter @border-empires/client test` and the touched-package build/lint checks after the final reapply onto current `main`.
