// Default state for the fixed-borders-via-reach system, extracted out of
// client-state.ts (already over the repo's 500-line file cap — see
// AGENTS.md's file-line-limit rule).
export const createInitialReachState = () => ({
  // Fixed-borders-via-reach overlay. `undefined` means "not computed for this
  // frame yet" (client-runtime-loop.ts lazily fills it via resolveMyReach,
  // which prefers serverReach below and only falls back to the local
  // approximation before the first REACH_UPDATE arrives).
  myReach: undefined as Set<string> | undefined,
  myReachRevisionAtCompute: "" as string,
  // Authoritative reach pushed by the simulation (REACH_UPDATE) — see
  // client-reach-authoritative.ts. `undefined` until the first message lands.
  serverReach: undefined as Set<string> | undefined,
  serverReachRevision: 0
});
