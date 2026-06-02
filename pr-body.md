## Summary
Phase 2: Replace four parallel build handlers with a single unified `handleBuildStructureCommand` driven by the `STRUCTURE_REGISTRY` from Phase 1.

## Changes
- `packages/shared/src/messages.ts`: Add `BUILD_STRUCTURE` wire message
- `apps/simulation/src/runtime-command-parsers.ts`: Add `parseBuildStructurePayload`
- `apps/simulation/src/runtime.ts`: Add `handleBuildStructureCommand` (~280 lines), `normalizeLegacyBuildCommand`, `completeStructureBuild`. Update dispatcher. Old handlers kept as dead code.

## Test results
- `apps/simulation test`: 156 tests all pass (827 total)
- `pnpm -r build`: all 8 packages green

## Not in this PR
- Client side switch to BUILD_STRUCTURE (follow-up)
- Deletion of old handlers (follow-up after client uptake)
- Behavioral parity tests (next priority)
