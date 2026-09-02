import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileActionDef } from "./client-types.js";

type MarchTargetingDeps = {
  pushFeed: (msg: string, type?: string, severity?: string) => void;
  sendGameMessage: (payload: unknown) => boolean;
};

/** Arms march-target picking for the flag at (x, y): the next tile click sets its march target. */
export const armMusterMarchTargeting = (
  state: Pick<ClientState, "musterMarchTargeting">,
  x: number,
  y: number,
  deps: MarchTargetingDeps
): void => {
  state.musterMarchTargeting.active = true;
  state.musterMarchTargeting.originX = x;
  state.musterMarchTargeting.originY = y;
  deps.pushFeed("Select a tile to march toward.", "combat", "info");
};

/**
 * Consumes an armed march-target click: sends SET_MUSTER with the clicked
 * tile as the march target, or cancels back to HOLD if the click landed on
 * unexplored ground or the flag's own tile. Always disarms targeting.
 */
export const handleMusterMarchTargetClick = (
  state: Pick<ClientState, "musterMarchTargeting">,
  wx: number,
  wy: number,
  vis: "visible" | "fogged" | "unexplored",
  deps: MarchTargetingDeps
): void => {
  const { originX, originY } = state.musterMarchTargeting;
  state.musterMarchTargeting.active = false;
  if (vis !== "unexplored" && (wx !== originX || wy !== originY)) {
    deps.sendGameMessage({ type: "SET_MUSTER", x: originX, y: originY, mode: "MARCH", targetX: wx, targetY: wy });
  } else {
    deps.pushFeed("March target cancelled.", "combat", "info");
  }
};

export type MarchTargetEntry = { originX: number; originY: number };
export type MarchOrder = MarchTargetEntry & { targetX: number; targetY: number };

// Two (or, at the 3-flag MUSTER_LIMIT cap, all three) of a player's own
// muster flags can legally March-To the same destination tile. Every
// consumer here works off the full list rather than "the first match" or a
// destination-keyed Map, so a shared destination shows -- and can cancel --
// each origin individually instead of silently hiding all but one.

/** Lists the current player's own MARCH-mode muster orders, sorted by origin for a stable, iteration-order-independent listing. */
export const listMarchTargets = (state: Pick<ClientState, "tiles" | "me">): MarchOrder[] => {
  const out: MarchOrder[] = [];
  for (const tile of state.tiles.values()) {
    const muster = tile.muster;
    if (!muster || muster.mode !== "MARCH" || tile.ownerId !== state.me) continue;
    if (muster.targetX === undefined || muster.targetY === undefined) continue;
    out.push({ originX: tile.x, originY: tile.y, targetX: muster.targetX, targetY: muster.targetY });
  }
  out.sort((a, b) => a.originX - b.originX || a.originY - b.originY);
  return out;
};

/** Finds every origin muster flag (if any) marching toward (x, y) for the given player, in stable order. */
export const findMarchOriginsForTarget = (
  state: Pick<ClientState, "tiles" | "me">,
  x: number,
  y: number
): MarchTargetEntry[] =>
  listMarchTargets(state)
    .filter((order) => order.targetX === x && order.targetY === y)
    .map(({ originX, originY }) => ({ originX, originY }));

// Up to MUSTER_LIMIT (3) of a player's own flags can share a destination
// tile -- one explicit action id per stacked slot, since TileActionDef["id"]
// is a fixed string union (no per-instance dynamic ids).
export const MARCH_CANCEL_ACTION_IDS = ["muster_march_cancel", "muster_march_cancel_2", "muster_march_cancel_3"] as const;
export type MarchCancelActionId = (typeof MARCH_CANCEL_ACTION_IDS)[number];

/**
 * Handles a muster_march_cancel(_2/_3) action from either the origin muster
 * tile itself (only ever one flag there, actionId is irrelevant) or its live
 * march destination, where actionId's position in MARCH_CANCEL_ACTION_IDS
 * selects which stacked origin to cancel. Sends SET_MUSTER HOLD and pushes a
 * feed line.
 */
export const cancelMarchAction = (
  state: Pick<ClientState, "tiles" | "me">,
  selected: Tile,
  actionId: string,
  deps: { sendGameMessage: (payload: unknown) => boolean; pushFeed: (msg: string, type?: string, severity?: string) => void }
): void => {
  const origin =
    selected.muster?.mode === "MARCH"
      ? { originX: selected.x, originY: selected.y }
      : findMarchOriginsForTarget(state, selected.x, selected.y)[MARCH_CANCEL_ACTION_IDS.indexOf(actionId as MarchCancelActionId)];
  if (!origin) return;
  deps.sendGameMessage({ type: "SET_MUSTER", x: origin.originX, y: origin.originY, mode: "HOLD" });
  deps.pushFeed(`March cancelled — flag at (${origin.originX}, ${origin.originY}) set back to Hold.`, "combat", "info");
};

/**
 * Appends one "Cancel March" action per own March-To order whose live
 * destination is `tile` — mirroring cancel_waypoint on a waypoint's
 * destination tile, but listing (and letting the player individually
 * cancel) every origin when more than one flag shares this destination.
 * No-op for an origin already covered by an existing action (tile is that
 * flag's own origin, which adds its own via buildMusterActions).
 */
export const appendMarchCancelAction = (
  actions: TileActionDef[],
  state: Pick<ClientState, "tiles" | "me">,
  tile: Tile
): TileActionDef[] => {
  const origins = findMarchOriginsForTarget(state, tile.x, tile.y);
  const existingIds = new Set(actions.map((a) => a.id));
  origins.forEach((origin, index) => {
    const id = MARCH_CANCEL_ACTION_IDS[index];
    if (!id || existingIds.has(id)) return;
    actions.push({
      id,
      label: origins.length > 1 ? `Cancel March from (${origin.originX}, ${origin.originY})` : "Cancel March",
      detail: `Marching here from (${origin.originX}, ${origin.originY}) · switch that flag back to HOLD.`,
      disabled: false
    });
  });
  return actions;
};
