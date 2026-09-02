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

/**
 * Collects the current player's own MARCH-mode muster flags, keyed by their
 * target tile's key ("x,y" via keyFor). Used to mark the destination tile of
 * a "March To…" order on the map (both renderers) and to let the player
 * cancel the march by acting on the destination tile, the same way a
 * waypoint flag is cancelled at its destination.
 */
export const collectMarchTargets = (
  state: Pick<ClientState, "tiles" | "me">,
  keyFor: (x: number, y: number) => string
): Map<string, MarchTargetEntry> => {
  const out = new Map<string, MarchTargetEntry>();
  for (const tile of state.tiles.values()) {
    const muster = tile.muster;
    if (!muster || muster.mode !== "MARCH" || tile.ownerId !== state.me) continue;
    if (muster.targetX === undefined || muster.targetY === undefined) continue;
    out.set(keyFor(muster.targetX, muster.targetY), { originX: tile.x, originY: tile.y });
  }
  return out;
};

/** Finds the origin muster tile (if any) marching toward (x, y) for the given player. */
export const findMarchOriginForTarget = (
  state: Pick<ClientState, "tiles" | "me">,
  x: number,
  y: number
): MarchTargetEntry | undefined => {
  for (const tile of state.tiles.values()) {
    const muster = tile.muster;
    if (!muster || muster.mode !== "MARCH" || tile.ownerId !== state.me) continue;
    if (muster.targetX === x && muster.targetY === y) return { originX: tile.x, originY: tile.y };
  }
  return undefined;
};

/**
 * Handles the muster_march_cancel action from either the origin muster tile
 * itself or its live march destination (resolving the real origin either
 * way), sending SET_MUSTER HOLD and pushing a feed line.
 */
export const cancelMarchAction = (
  state: Pick<ClientState, "tiles" | "me">,
  selected: Tile,
  deps: { sendGameMessage: (payload: unknown) => boolean; pushFeed: (msg: string, type?: string, severity?: string) => void }
): void => {
  const origin =
    selected.muster?.mode === "MARCH"
      ? { originX: selected.x, originY: selected.y }
      : findMarchOriginForTarget(state, selected.x, selected.y);
  if (!origin) return;
  deps.sendGameMessage({ type: "SET_MUSTER", x: origin.originX, y: origin.originY, mode: "HOLD" });
  deps.pushFeed(`March cancelled — flag at (${origin.originX}, ${origin.originY}) set back to Hold.`, "combat", "info");
};

/**
 * Appends a "Cancel March" action to `actions` when `tile` is the live
 * destination of one of the player's own March-To orders — mirroring
 * cancel_waypoint on a waypoint's destination tile. No-op if nothing is
 * marching there, or the action is already present (tile is the origin
 * flag itself, which adds its own via buildMusterActions).
 */
export const appendMarchCancelAction = (
  actions: TileActionDef[],
  state: Pick<ClientState, "tiles" | "me">,
  tile: Tile
): TileActionDef[] => {
  const origin = findMarchOriginForTarget(state, tile.x, tile.y);
  if (origin && !actions.some((a) => a.id === "muster_march_cancel")) {
    actions.push({
      id: "muster_march_cancel",
      label: "Cancel March",
      detail: `Marching here from (${origin.originX}, ${origin.originY}) · switch that flag back to HOLD.`,
      disabled: false
    });
  }
  return actions;
};
