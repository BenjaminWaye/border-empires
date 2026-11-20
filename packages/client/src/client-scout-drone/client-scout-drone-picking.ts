// "Send scout drone" on an active AFC's tile menu opens a flight plan with no
// stops yet (state.scoutDronePicking), and so does a tap on fog, with that tile
// as the first stop. Taps then add and remove stops (client-scout-drone-plan.ts)
// until Go or Cancel on the dock (client-scout-drone-dock.ts). The server
// launches from the active AFC nearest the first stop. Arming clears the other
// map picks, and arming a Crystal ability clears this one.
import { formatCooldownShort } from "../client-app-runtime-utils.js";
import { cancelMarchOriginPicking } from "../client-march-origin-picking/client-march-origin-picking.js";
import { clearCrystalTargeting } from "../client-tile-action-logic/client-crystal-targeting.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { activeScoutDroneFlight, buildRecallScoutAction, type ExploreDispatchDeps } from "./client-scout-drone-explore-action.js";
import { cancelScoutPlan, handleScoutPlanTap, type ScoutPlanState } from "./client-scout-drone-plan.js";

export const AFC_SCOUT_ACTION_ID = "afc_scout_drone" as const;

export const AFC_SCOUT_ACTION_DETAIL = "Pick a tile on the map to send your scout drone that way. It reveals land as it flies and claims nothing.";

type PickingState = ScoutPlanState & Pick<ClientState, "musterMarchTargeting" | "marchOriginPicking" | "buildingPlacement">;

const droneOutReason = (landsAt: number, nowMs: number): string => `Scout drone is out, back in ${formatCooldownShort(landsAt - nowMs)}`;

/**
 * The AFC menu rows: only on your own active AFC. Send scout drone, disabled while the drone is
 * out, preceded by Recall drone while it is still flying out.
 */
export const afcScoutDroneActions = (state: Pick<ClientState, "me" | "scoutDroneFlight">, tile: Tile, nowMs: number = Date.now()): TileActionDef[] => {
  if (tile.afc?.ownerId !== state.me || tile.afc.status !== "active") return [];
  const active = activeScoutDroneFlight(state.scoutDroneFlight, nowMs);
  const recall = buildRecallScoutAction(state.scoutDroneFlight, nowMs);
  const send: TileActionDef = {
    id: AFC_SCOUT_ACTION_ID,
    label: "Send scout drone",
    detail: AFC_SCOUT_ACTION_DETAIL,
    ...(active ? { disabled: true, disabledReason: droneOutReason(active.landsAt, nowMs) } : {})
  };
  return recall ? [recall, send] : [send];
};

/** Handles the AFC menu row. Returns true when `actionId` was Send scout drone. */
export const dispatchAfcScoutAction = (actionId: string, state: ClientState, deps: Pick<ExploreDispatchDeps, "pushFeed">, nowMs: number = Date.now()): boolean => {
  if (actionId !== AFC_SCOUT_ACTION_ID) return false;
  const active = activeScoutDroneFlight(state.scoutDroneFlight, nowMs);
  if (active) {
    deps.pushFeed(`${droneOutReason(active.landsAt, nowMs)}.`, "info", "warn");
    return true;
  }
  // One armed pick at a time, so the card on screen is always the one the next tap answers.
  clearCrystalTargeting(state);
  if (state.marchOriginPicking.active) cancelMarchOriginPicking(state);
  state.musterMarchTargeting.active = false;
  state.scoutDronePicking.active = true;
  state.scoutDronePicking.stops = [];
  return true;
};

export const cancelScoutDronePicking = (state: Pick<ClientState, "scoutDronePicking">): void => cancelScoutPlan(state);

/**
 * Map tap: while planning, adds or removes a stop (client-scout-drone-plan.ts); otherwise a tap
 * on unexplored ground starts a plan there, unless a march pick is waiting for that tap. True
 * when the tap was consumed.
 */
export const handleScoutDronePickClick = (
  state: PickingState,
  wx: number,
  wy: number,
  deps: ExploreDispatchDeps & { renderHud: () => void },
  nowMs: number = Date.now()
): boolean => {
  if (!state.scoutDronePicking.active && (state.musterMarchTargeting.active || state.marchOriginPicking.active || state.buildingPlacement.active)) return false;
  if (!handleScoutPlanTap(state, wx, wy, nowMs)) return false;
  deps.renderHud();
  return true;
};
