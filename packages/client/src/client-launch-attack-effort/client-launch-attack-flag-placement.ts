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
import type { EffortSheetFlagSpots, FlagSpotTone } from "../client-effort-confirm-sheet/client-effort-flag-spot-section.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

export type LaunchFlagPlacement = {
  sheet: EffortSheetFlagSpots;
  /** Records the selected spot for every target it can fund. Call on Go. */
  apply: () => void;
};

/** March time to the front, for the tooltip: "12s", "2 min", "no march". */
const marchText = (ms: number): string => {
  if (ms <= 0) return "no march";
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${seconds < 90 ? `${seconds}s` : `${Math.round(seconds / 60)} min`} march to the front`;
};

/** Tiles from the nearest hostile tile, compact: "3+ tiles", "2 tiles", "1 tile". */
const distanceText = (distance: number | undefined): string =>
  distance === undefined ? `${FLAG_SAFE_DISTANCE_TILES}+ tiles` : distance === 1 ? "1 tile" : `${distance} tiles`;

const enemyText = (distance: number | undefined): string =>
  distance === undefined ? `${FLAG_SAFE_DISTANCE_TILES}+ tiles from the enemy` : distance <= 1 ? "next to the enemy" : `${distance} tiles from the enemy`;

const toneFor = (spot: MusterFlagSpot): FlagSpotTone =>
  spot.kind === "border" ? "border" : spot.kind === "closer" || spot.enemyDistance !== undefined ? "close" : "safe";

const labelFor = (spot: MusterFlagSpot): string =>
  spot.kind === "border" ? "Border" : spot.kind === "closer" ? "Close" : spot.enemyDistance === undefined ? "Safe" : "Safest";

/** One segment of the flag switch: a short name and distance from the enemy on the button, the rest in its tooltip. */
export const flagSpotChoiceText = (spot: MusterFlagSpot): EffortSheetFlagSpots["choices"][number] => ({
  label: labelFor(spot),
  detail: distanceText(spot.enemyDistance),
  tone: toneFor(spot),
  hint: `(${spot.x}, ${spot.y}) · ${enemyText(spot.enemyDistance)} · ${marchText(spot.transitMs)}`
});

/**
 * The placement step for launching on `targets`, or undefined when there is
 * nothing to choose: none of them would raise a new flag (a flag is near, or
 * the player is at the flag cap), or the firing tile is the only spot. Spots
 * are ranked against the firing tile of `focus` when it is one of the targets
 * needing a flag, else the first such target. Any spot left over from an
 * earlier launch on these targets is cleared first, so an attack this launch
 * doesn't plan can't pick one up.
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
    clearMusterFlagPlan(state, target.x, target.y);
    const origin = pickOriginForTarget(target.x, target.y);
    if (origin && attackNeedsNewMusterFlag(state, origin, target, nowMs)) needing.push({ target, origin });
  }
  if (needing.length === 0) return undefined;
  const primary = needing.find((n) => focus && n.target.x === focus.x && n.target.y === focus.y) ?? needing[0]!;
  const spots = musterFlagSpotChoices(state, primary.origin, nowMs, primary.target);
  // Only the border tile: no choice to make, so no step (the attack raises
  // its flag there, as before).
  if (spots.length <= 1) return undefined;
  let selected = 0;
  return {
    sheet: { choices: spots.map(flagSpotChoiceText), selected, onSelect: (index) => (selected = index) },
    apply: () => {
      const spot = spots[selected];
      // Stamped when the player presses Attack, not when the sheet opened, so
      // a sheet left open a while doesn't record an already-expired plan.
      const now = Date.now();
      for (const { target, origin } of needing) {
        // A target whose firing tile is out of the new flag's funding range
        // keeps the old behaviour (a flag on its own firing tile).
        if (spot && chebyshevDistanceClient(spot.x, spot.y, origin.x, origin.y) <= MUSTER_REMOTE_FUNDING_RADIUS_TILES) {
          setMusterFlagPlan(state, target, spot, now);
        } else {
          clearMusterFlagPlan(state, target.x, target.y);
        }
      }
    }
  };
};
