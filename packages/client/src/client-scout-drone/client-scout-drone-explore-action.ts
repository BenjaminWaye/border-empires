// The Explore button on an unexplored tile (docs/explore-scout-plan.md):
// launches the player's scout drone toward the tile. It replaces Expand To and
// March To there, since pressing unexplored ground means "look that way", not
// "claim that tile". Only one drone flies at a time, so the button is
// disabled with the time left while one is out.
import type { ScoutDroneFlight } from "@border-empires/shared";
import { formatCooldownShort } from "../client-app-runtime-utils.js";
import type { TileActionDef } from "../client-types.js";

export const EXPLORE_ACTION_ID = "explore_scout" as const;

export const EXPLORE_ACTION_DETAIL = "Send your scout drone to look this way. It reveals land around it as it flies and claims nothing.";

/** The drone still in the air at `nowMs`, if any. */
export const activeScoutDroneFlight = (flight: ScoutDroneFlight | undefined, nowMs: number): ScoutDroneFlight | undefined =>
  flight && flight.landsAt > nowMs ? flight : undefined;

export const buildExploreAction = (flight: ScoutDroneFlight | undefined, nowMs: number = Date.now()): TileActionDef => {
  const active = activeScoutDroneFlight(flight, nowMs);
  return {
    id: EXPLORE_ACTION_ID,
    label: "Explore",
    detail: EXPLORE_ACTION_DETAIL,
    ...(active ? { disabled: true, disabledReason: `Scout drone is out, back in ${formatCooldownShort(active.landsAt - nowMs)}` } : {})
  };
};

export type ExploreDispatchDeps = {
  sendGameMessage?: ((payload: unknown) => boolean) | undefined;
  pushFeed: (message: string, type?: string, severity?: string) => void;
};

/** Handles the Explore button. Returns true when `actionId` was Explore. */
export const dispatchExploreAction = (
  actionId: string,
  selected: { x: number; y: number } | undefined,
  flight: ScoutDroneFlight | undefined,
  deps: ExploreDispatchDeps,
  nowMs: number = Date.now()
): boolean => {
  if (actionId !== EXPLORE_ACTION_ID) return false;
  if (!selected || !deps.sendGameMessage) return true;
  const active = activeScoutDroneFlight(flight, nowMs);
  if (active) {
    deps.pushFeed(`Scout drone is out, back in ${formatCooldownShort(active.landsAt - nowMs)}.`, "info", "warn");
    return true;
  }
  if (deps.sendGameMessage({ type: "EXPLORE", x: selected.x, y: selected.y })) {
    deps.pushFeed(`Scout drone launched toward (${selected.x}, ${selected.y}).`, "info", "info");
  }
  return true;
};
