// The Explore button, offered on an unexplored tile's menu only when tapping fog doesn't
// open a flight plan (client-scout-drone-plan.ts): a House with no AFC sees it disabled
// (client-unexplored-tile-menu.ts). It sends EXPLORE toward the tile; with the drone
// already out, the server adds the tile to its route. There is no Recall: send more stops
// instead (docs/explore-scout-plan.md §13).
import type { ScoutDroneFlight } from "@border-empires/shared";
import type { TileActionDef } from "../client-types.js";

export const EXPLORE_ACTION_ID = "explore_scout" as const;

export const EXPLORE_ACTION_DETAIL = "Send your scout drone to look this way. It reveals land around it as it flies and claims nothing.";

/** The drone still in the air at `nowMs`, if any. */
export const activeScoutDroneFlight = (flight: ScoutDroneFlight | undefined, nowMs: number): ScoutDroneFlight | undefined =>
  flight && flight.landsAt > nowMs ? flight : undefined;

export const buildExploreAction = (): TileActionDef => ({ id: EXPLORE_ACTION_ID, label: "Explore", detail: EXPLORE_ACTION_DETAIL });

export type ExploreDispatchDeps = {
  sendGameMessage?: ((payload: unknown) => boolean) | undefined;
  pushFeed: (message: string, type?: string, severity?: string) => void;
};

/** Handles the Explore button. Returns true when `actionId` was Explore. */
export const dispatchExploreAction = (actionId: string, selected: { x: number; y: number } | undefined, deps: ExploreDispatchDeps): boolean => {
  if (actionId !== EXPLORE_ACTION_ID) return false;
  if (!selected || !deps.sendGameMessage) return true;
  // No "launched" popup: the drone on the map, with its "Back in …" pill (client-scout-drone-eta-label.ts), is the confirmation.
  deps.sendGameMessage({ type: "EXPLORE", x: selected.x, y: selected.y });
  return true;
};
