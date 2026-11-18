// "Send scout drone" on an active AFC's tile menu: the button arms a pick
// mode (state.scoutDronePicking), and the next map tap sends EXPLORE toward
// that tile, the same command the unexplored-tile Explore button sends
// (client-scout-drone-explore-action.ts). The server still launches from the
// active AFC nearest the target (planScoutDroneFlight), so the button aims
// the drone; it does not pick which AFC it leaves from. A tap on the player's
// own or allied land is refused here, as the server would (SCOUT_TARGET_HOME),
// and picking continues so a mis-tap doesn't drop the order. The armed card
// with its Cancel button is client-hud/client-hud-targeting-overlay.ts.
import { formatCooldownShort } from "../client-app-runtime-utils.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { activeScoutDroneFlight, dispatchExploreAction, EXPLORE_ACTION_ID, type ExploreDispatchDeps } from "./client-scout-drone-explore-action.js";

export const AFC_SCOUT_ACTION_ID = "afc_scout_drone" as const;

export const AFC_SCOUT_ACTION_DETAIL = "Pick a tile on the map to send your scout drone that way. It reveals land as it flies and claims nothing.";

type PickingState = Pick<ClientState, "scoutDronePicking" | "scoutDroneFlight" | "tiles" | "me" | "allies">;

const droneOutReason = (landsAt: number, nowMs: number): string => `Scout drone is out, back in ${formatCooldownShort(landsAt - nowMs)}`;

/** The AFC menu row: only on your own active AFC, disabled while the drone is out. */
export const afcScoutDroneAction = (state: Pick<ClientState, "me" | "scoutDroneFlight">, tile: Tile, nowMs: number = Date.now()): TileActionDef | undefined => {
  if (tile.afc?.ownerId !== state.me || tile.afc.status !== "active") return undefined;
  const active = activeScoutDroneFlight(state.scoutDroneFlight, nowMs);
  return {
    id: AFC_SCOUT_ACTION_ID,
    label: "Send scout drone",
    detail: AFC_SCOUT_ACTION_DETAIL,
    ...(active ? { disabled: true, disabledReason: droneOutReason(active.landsAt, nowMs) } : {})
  };
};

/** Handles the AFC menu row. Returns true when `actionId` was Send scout drone. */
export const dispatchAfcScoutAction = (actionId: string, state: PickingState, deps: Pick<ExploreDispatchDeps, "pushFeed">, nowMs: number = Date.now()): boolean => {
  if (actionId !== AFC_SCOUT_ACTION_ID) return false;
  const active = activeScoutDroneFlight(state.scoutDroneFlight, nowMs);
  if (active) {
    deps.pushFeed(`${droneOutReason(active.landsAt, nowMs)}.`, "info", "warn");
    return true;
  }
  state.scoutDronePicking.active = true;
  return true;
};

export const cancelScoutDronePicking = (state: Pick<ClientState, "scoutDronePicking">): void => {
  state.scoutDronePicking.active = false;
};

/** Map tap while picking; true when the tap was consumed. */
export const handleScoutDronePickClick = (
  state: PickingState,
  wx: number,
  wy: number,
  deps: ExploreDispatchDeps & { renderHud: () => void },
  nowMs: number = Date.now()
): boolean => {
  if (!state.scoutDronePicking.active) return false;
  const owner = state.tiles.get(`${wx},${wy}`)?.ownerId;
  if (owner && (owner === state.me || state.allies.includes(owner))) {
    deps.pushFeed("Pick a tile beyond your own and allied land to send the scout drone toward.", "info", "warn");
  } else {
    cancelScoutDronePicking(state);
    dispatchExploreAction(EXPLORE_ACTION_ID, { x: wx, y: wy }, state.scoutDroneFlight, deps, nowMs);
  }
  deps.renderHud();
  return true;
};
