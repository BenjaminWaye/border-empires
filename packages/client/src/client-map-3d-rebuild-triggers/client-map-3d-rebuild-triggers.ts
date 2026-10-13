import { activeFrontierAttackClaimTargetKeys } from "../client-map-3d-frontier-claim-plates.js";

type FrontierClaimTriggerState = Parameters<typeof activeFrontierAttackClaimTargetKeys>[0];

// Stable string snapshot of every FRONTIER-attack claim target currently
// resolving, for the true-3D renderer's maybeRebuild (client-map-3d.ts) to
// diff against the snapshot taken at the last rebuild: a change means a claim
// started or ended, so the base ownership tint needs rebuilding (see
// activeFrontierAttackClaimTargetKeys for why the tint depends on it).
//
// Reads the epoch clock itself rather than taking a `now` argument: the claim
// timestamps it compares against (resolvesAt / transitEndsAt) are server epoch
// ms, while the render loop's own `nowMs` is performance.now() (page-relative).
// Passing that through made every claim look perpetually unresolved, so the
// snapshot never dropped a finished claim and the claim-end rebuild never
// fired. Keeping the clock in here leaves no caller-side clock to get wrong.
export function frontierAttackClaimRebuildSnapshot(
  state: FrontierClaimTriggerState,
  keyFor: (x: number, y: number) => string
): string {
  return Array.from(activeFrontierAttackClaimTargetKeys(state, keyFor, Date.now())).sort().join(",");
}
