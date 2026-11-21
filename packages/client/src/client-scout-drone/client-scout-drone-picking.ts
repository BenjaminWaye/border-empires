// "Send scout drone" on an active AFC's tile menu opens a flight plan with no
// stops yet (state.scoutDronePicking), and so does a tap on fog, with that tile
// as the first stop. Taps then add and remove stops (client-scout-drone-plan.ts)
// until Go or Cancel on the dock (client-scout-drone-dock.ts). The server
// launches from the active AFC nearest the first stop. Arming clears the other
// map picks, and arming a Crystal ability clears this one.
import { cancelMarchOriginPicking } from "../client-march-origin-picking/client-march-origin-picking.js";
import { clearCrystalTargeting } from "../client-tile-action-logic/client-crystal-targeting.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import type { ExploreDispatchDeps } from "./client-scout-drone-explore-action.js";
import { cancelScoutPlan, handleScoutPlanTap, scoutPlanTapStarts, type ScoutPlanState } from "./client-scout-drone-plan.js";
import { scoutChargeCount, scoutChargeStatus } from "./client-scout-drone-charge-status.js";
import { scoutReportCardVisible } from "./client-scout-drone-hud.js";

export const AFC_SCOUT_ACTION_ID = "afc_scout_drone" as const;

export const AFC_SCOUT_ACTION_DETAIL = "Pick a tile on the map to send your scout drone that way. It reveals land as it flies and claims nothing.";

type PickingState = ScoutPlanState & Pick<ClientState, "musterMarchTargeting" | "marchOriginPicking" | "buildingPlacement" | "scoutDroneReport">;

/** The AFC menu row: Send scout drone, only on your own active AFC. With the drone out, the plan adds stops to its route. */
export const afcScoutDroneActions = (state: Pick<ClientState, "me" | "scoutDroneCharges">, tile: Tile, nowMs: number = Date.now()): TileActionDef[] => {
  if (tile.afc?.ownerId !== state.me || tile.afc.status !== "active") return [];
  // The bar's button has room for the count only (about 44px); the full refill time is in the detail and on
  // the AFC screen (client-afc-upgrades.ts).
  return [{ id: AFC_SCOUT_ACTION_ID, label: "Send scout drone", cost: scoutChargeCount(state, nowMs), detail: `${AFC_SCOUT_ACTION_DETAIL} Charges: ${scoutChargeStatus(state, nowMs)}.` }];
};

/** Handles the AFC menu row. Returns true when `actionId` was Send scout drone. */
export const dispatchAfcScoutAction = (actionId: string, state: ClientState): boolean => {
  if (actionId !== AFC_SCOUT_ACTION_ID) return false;
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
  nowMs: number = Date.now(),
  /** True when this tap also closed an open tile menu (client-action-flow.ts). */
  closedMenu = false
): boolean => {
  if (!state.scoutDronePicking.active && (state.musterMarchTargeting.active || state.marchOriginPicking.active || state.buildingPlacement.active)) return false;
  // A tap that closes something never also starts a plan: players dismissing a tile menu or the landing
  // report card by tapping the map got a plan, and each further "closing" tap a stop (player report 2026-11-21).
  // The tap closes it and is spent; the next tap on the fog plans as usual.
  if (!state.scoutDronePicking.active && scoutPlanTapStarts(state, wx, wy)) {
    const cardUp = scoutReportCardVisible(state, nowMs);
    if (cardUp || closedMenu) {
      if (cardUp) state.scoutDroneReport = undefined;
      deps.renderHud();
      return true;
    }
  }
  if (!handleScoutPlanTap(state, wx, wy, nowMs)) return false;
  deps.renderHud();
  return true;
};
