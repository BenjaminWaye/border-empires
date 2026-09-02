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

// Up to MUSTER_LIMIT flags can share a destination tile -- one explicit
// action id per stacked slot, since TileActionDef["id"] is a fixed string
// union (no per-instance dynamic ids). MUSTER_LIMIT's base is
// MUSTER_MAX_TILES (2, packages/shared/src/config.ts) plus tech/wonder
// bonuses (musterMaxTilesAdd, wonderMusterExtraFlag -- see
// runtime-structure-lifecycle-command-handlers.ts), so a heavily-teched
// player can in principle exceed this many flags sharing one tile; beyond
// it, the overflow origins simply have no cancel slot on the destination
// tile's menu (still cancellable from their own origin tile).
export const MARCH_CANCEL_ACTION_IDS = ["muster_march_cancel", "muster_march_cancel_2", "muster_march_cancel_3"] as const;
export type MarchCancelActionId = (typeof MARCH_CANCEL_ACTION_IDS)[number];

/**
 * All March-To cancel candidates for `tile`'s menu, in the same order
 * appendMarchCancelAction assigns MARCH_CANCEL_ACTION_IDS: `tile`'s own
 * outgoing march first (if it has one -- this is the slot buildMusterActions
 * already fills with "muster_march_cancel"), then every other flag's
 * incoming march into `tile`, sorted by origin. A tile can simultaneously be
 * one flag's origin and another's destination, so both lists are combined
 * here rather than treating "has an outgoing march" as exclusive of
 * "is someone's target".
 */
const marchCancelCandidatesForTile = (
  state: Pick<ClientState, "tiles" | "me">,
  tile: Pick<Tile, "x" | "y" | "muster">
): MarchTargetEntry[] => {
  const incoming = findMarchOriginsForTarget(state, tile.x, tile.y).filter(
    (origin) => !(origin.originX === tile.x && origin.originY === tile.y)
  );
  return tile.muster?.mode === "MARCH" ? [{ originX: tile.x, originY: tile.y }, ...incoming] : incoming;
};

/**
 * Handles a muster_march_cancel(_2/_3) action: actionId's position in
 * MARCH_CANCEL_ACTION_IDS selects which of marchCancelCandidatesForTile's
 * candidates to cancel -- correctly disambiguating even when `selected` is
 * simultaneously the origin of its own outgoing march and the destination
 * of another flag's incoming one. Sends SET_MUSTER HOLD and pushes a feed line.
 */
export const cancelMarchAction = (
  state: Pick<ClientState, "tiles" | "me">,
  selected: Tile,
  actionId: string,
  deps: { sendGameMessage: (payload: unknown) => boolean; pushFeed: (msg: string, type?: string, severity?: string) => void }
): void => {
  const index = MARCH_CANCEL_ACTION_IDS.indexOf(actionId as MarchCancelActionId);
  const origin = marchCancelCandidatesForTile(state, selected)[index];
  if (!origin) return;
  deps.sendGameMessage({ type: "SET_MUSTER", x: origin.originX, y: origin.originY, mode: "HOLD" });
  deps.pushFeed(`March cancelled — flag at (${origin.originX}, ${origin.originY}) set back to Hold.`, "combat", "info");
};

/**
 * Appends one "Cancel March" action per march-cancel candidate for `tile`
 * (see marchCancelCandidatesForTile) not already covered by an existing
 * action -- mirroring cancel_waypoint on a waypoint's destination tile, but
 * listing (and letting the player individually cancel) every flag when more
 * than one shares this tile as an origin and/or destination.
 */
export const appendMarchCancelAction = (
  actions: TileActionDef[],
  state: Pick<ClientState, "tiles" | "me">,
  tile: Tile
): TileActionDef[] => {
  const candidates = marchCancelCandidatesForTile(state, tile);
  const existingIds = new Set(actions.map((a) => a.id));
  candidates.forEach((origin, index) => {
    const id = MARCH_CANCEL_ACTION_IDS[index];
    if (!id || existingIds.has(id)) return;
    actions.push({
      id,
      label: candidates.length > 1 ? `Cancel March from (${origin.originX}, ${origin.originY})` : "Cancel March",
      detail: `Marching here from (${origin.originX}, ${origin.originY}) · switch that flag back to HOLD.`,
      disabled: false
    });
  });
  return actions;
};
