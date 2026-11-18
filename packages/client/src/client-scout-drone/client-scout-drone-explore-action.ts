// The Explore button on an unexplored tile (docs/explore-scout-plan.md):
// launches the player's scout drone toward the tile. It replaces Expand To and
// March To there, since pressing unexplored ground means "look that way", not
// "claim that tile". Only one drone flies at a time, so the button is
// disabled with the time left while one is out, and Recall drone (RECALL_SCOUT)
// sits beside it while the drone is still flying out.
import { scoutDroneStepIndexAt, type ScoutDroneFlight } from "@border-empires/shared";
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

export const RECALL_SCOUT_ACTION_ID = "recall_scout" as const;

/** Recall drone: only while the drone is still flying out and not already called home (then there is nothing to cut short). */
export const buildRecallScoutAction = (flight: ScoutDroneFlight | undefined, nowMs: number = Date.now()): TileActionDef | undefined => {
  const active = activeScoutDroneFlight(flight, nowMs);
  if (!active || active.endReason === "RECALLED" || scoutDroneStepIndexAt(active, nowMs) >= active.turnIndex) return undefined;
  return { id: RECALL_SCOUT_ACTION_ID, label: "Recall drone", detail: "Turn the scout drone back now. It flies home the way it came." };
};

/** Handles Recall drone. Returns true when `actionId` was Recall drone. */
export const dispatchRecallScoutAction = (actionId: string, deps: Pick<ExploreDispatchDeps, "sendGameMessage">): boolean => {
  if (actionId !== RECALL_SCOUT_ACTION_ID) return false;
  deps.sendGameMessage?.({ type: "RECALL_SCOUT" });
  return true;
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
  // No "launched" popup: the drone on the map, with its "Back in …" pill (client-scout-drone-eta-label.ts), is the confirmation.
  deps.sendGameMessage({ type: "EXPLORE", x: selected.x, y: selected.y });
  return true;
};
