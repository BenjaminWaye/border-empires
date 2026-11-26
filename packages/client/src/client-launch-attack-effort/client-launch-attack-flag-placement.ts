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

/** Extra time before the attack fires, compact: "+12s", "+2m", "+0s". */
const marchText = (ms: number): string => {
  const seconds = ms <= 0 ? 0 : Math.max(1, Math.round(ms / 1000));
  return seconds < 90 ? `+${seconds}s` : `+${Math.round(seconds / 60)}m`;
};

const enemyText = (distance: number | undefined): string =>
  distance === undefined ? `${FLAG_SAFE_DISTANCE_TILES}+ tiles from the enemy` : distance <= 1 ? "next to the enemy" : `${distance} tiles from the enemy`;

const toneFor = (spot: MusterFlagSpot): FlagSpotTone =>
  spot.kind === "border" ? "border" : spot.kind === "closer" || spot.enemyDistance !== undefined ? "close" : "safe";

const labelFor = (spot: MusterFlagSpot): string =>
  spot.kind === "border" ? "Border" : spot.kind === "closer" ? "Close" : spot.enemyDistance === undefined ? "Safe" : "Safest";

/** One segment of the flag switch: a short name and march time on the button, the rest in its tooltip. */
export const flagSpotChoiceText = (spot: MusterFlagSpot): EffortSheetFlagSpots["choices"][number] => ({
  label: labelFor(spot),
  detail: marchText(spot.transitMs),
  tone: toneFor(spot),
  hint: `(${spot.x}, ${spot.y}) · ${enemyText(spot.enemyDistance)} · ${spot.transitMs > 0 ? `${marchText(spot.transitMs).slice(1)} march to the front` : "no march"}`
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
    sheet: { choices: spots.map(flagSpotChoiceText), selected, onSelect: (index) => (selected = index) },
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
