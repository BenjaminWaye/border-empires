// docs/launch-attack-flag-placement-plan.md: the flag-placement half of the
// Launch Attack sheet. When no muster flag is near the targets, the attack
// would raise a new one; this builds the sheet's spot choices and, on Go,
// records the chosen spot for every target it can fund. When a flag is
// already near, there is nothing to place and the sheet shows effort only.
import { MUSTER_REMOTE_FUNDING_RADIUS_TILES } from "../client-muster-attack-gate/client-muster-attack-gate.js";
import { clearMusterFlagPlan, setMusterFlagPlan } from "../client-muster-flag-plan/client-muster-flag-plan.js";
import {
  FLAG_SAFE_DISTANCE_TILES,
  attackNeedsNewMusterFlag,
  musterFlagSpotChoices,
  type MusterFlagSpot
} from "../client-muster-flag-plan/client-muster-flag-spot.js";
import { chebyshevDistanceClient } from "../client-tile-action-support/client-tile-action-support.js";
import type { EffortSheetFlagSpots } from "../client-effort-confirm-sheet/client-effort-flag-spot-section.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

export const NEW_FLAG_NOTICE =
  "No muster flag is near, so a new one will be raised. Enemies can capture a flag and destroy the manpower on it, so keep it back from the border.";

export type LaunchFlagPlacement = {
  sheet: EffortSheetFlagSpots;
  /** Records the selected spot for every target it can fund. Call on Go. */
  apply: () => void;
};

const marchText = (ms: number): string => {
  if (ms <= 0) return "no march";
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 90 ? `~${seconds}s march` : `~${Math.round(seconds / 60)} min march`;
};

const enemyText = (distance: number | undefined): string =>
  distance === undefined ? `${FLAG_SAFE_DISTANCE_TILES}+ tiles from the enemy` : distance <= 1 ? "next to the enemy" : `${distance} tiles from the enemy`;

const labelFor = (spot: MusterFlagSpot): string =>
  spot.kind === "border" ? "On the border" : spot.kind === "closer" ? "Closer" : spot.enemyDistance === undefined ? "Safe (recommended)" : "Safest nearby";

export const flagSpotChoiceText = (spot: MusterFlagSpot): { label: string; detail: string } => ({
  label: labelFor(spot),
  detail: `(${spot.x}, ${spot.y}) · ${enemyText(spot.enemyDistance)} · ${marchText(spot.transitMs)}`
});

/**
 * The placement step for launching on `targets`, or undefined when none of
 * them would raise a new flag (a flag is near, or the player is at the flag
 * cap). Spots are ranked against the firing tile of `focus` when it is one of
 * the targets needing a flag, else the first such target.
 */
export const launchFlagPlacement = (
  state: ClientState,
  targets: readonly Tile[],
  focus: Tile | undefined,
  pickOriginForTarget: (x: number, y: number) => Tile | undefined,
  nowMs = Date.now()
): LaunchFlagPlacement | undefined => {
  const needing: Array<{ target: Tile; origin: Tile }> = [];
  for (const target of targets) {
    const origin = pickOriginForTarget(target.x, target.y);
    if (origin && attackNeedsNewMusterFlag(state, origin, target, nowMs)) needing.push({ target, origin });
  }
  if (needing.length === 0) return undefined;
  const primary = needing.find((n) => focus && n.target.x === focus.x && n.target.y === focus.y) ?? needing[0]!;
  const spots = musterFlagSpotChoices(state, primary.origin, nowMs);
  let selected = 0;
  return {
    sheet: { notice: NEW_FLAG_NOTICE, choices: spots.map(flagSpotChoiceText), selected, onSelect: (index) => (selected = index) },
    apply: () => {
      const spot = spots[selected];
      for (const { target, origin } of needing) {
        // A target whose firing tile is out of the new flag's funding range
        // keeps the old behaviour (a flag on its own firing tile).
        if (spot && chebyshevDistanceClient(spot.x, spot.y, origin.x, origin.y) <= MUSTER_REMOTE_FUNDING_RADIUS_TILES) {
          setMusterFlagPlan(state, target, spot, nowMs);
        } else {
          clearMusterFlagPlan(state, target.x, target.y);
        }
      }
    }
  };
};
