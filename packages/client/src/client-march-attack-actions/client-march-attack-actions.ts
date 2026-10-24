// "March Attack" rows on a hostile tile too deep in enemy territory to attack
// directly: march an existing muster flag there, or raise a new flag on the
// owned tile nearest the target and march it. Both open the same March-To
// commit sheet (handleArrowGestureConfirm) a flag's own "March To…" opens,
// which sends SET_MUSTER MARCH -- the server creates the flag on that tile in
// MARCH mode when none is there yet (handleSetMusterCommand), so a new flag
// needs no separate HOLD step first.

import { MUSTER_MARCH_MAX_DISTANCE_TILES, musterMarchDistanceTiles } from "@border-empires/shared";
import { handleArrowGestureConfirm, type ArrowGestureConfirmDeps } from "../client-arrow-gesture-confirm.js";
import { isMusterUnlocked } from "../client-muster-unlock/client-muster-unlock-storage.js";
import { ownTileSiegeAt } from "../client-muster-siege/client-muster-siege.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

// One fixed id per listed flag, since TileActionDef["id"] is a closed union.
export const MARCH_ATTACK_FLAG_ACTION_IDS = ["march_attack_flag", "march_attack_flag_2", "march_attack_flag_3"] as const;
export const MARCH_ATTACK_NEW_FLAG_ACTION_ID = "march_attack_new_flag";
export const MARCH_ATTACK_ACTION_IDS: readonly string[] = [...MARCH_ATTACK_FLAG_ACTION_IDS, MARCH_ATTACK_NEW_FLAG_ACTION_ID];

export type MarchAttackOrigin = { x: number; y: number; distance: number };
export type MarchAttackOptions = { flags: MarchAttackOrigin[]; newFlag?: MarchAttackOrigin };

type MarchAttackState = Pick<
  ClientState,
  "me" | "tiles" | "musterFlagLimit" | "incomingAttacksByTile" | "authEmail" | "bridgeDebugSeasonId"
>;

const byDistance = (a: MarchAttackOrigin, b: MarchAttackOrigin): number => a.distance - b.distance || a.x - b.x || a.y - b.y;

/**
 * Every way to march on (target.x, target.y): the player's own flags within
 * march range (nearest first, at most one per action id, besieged flags left
 * out since the server refuses to march them), and the owned land tile
 * nearest the target to raise a new flag on -- only while the player is
 * under their flag cap and that tile is itself within march range.
 */
export const marchAttackOptions = (state: MarchAttackState, target: { x: number; y: number }, nowMs = Date.now()): MarchAttackOptions => {
  const flags: MarchAttackOrigin[] = [];
  let flagCount = 0;
  let newFlag: MarchAttackOrigin | undefined;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    const distance = musterMarchDistanceTiles(tile.x, tile.y, target.x, target.y);
    const inRange = distance > 0 && distance <= MUSTER_MARCH_MAX_DISTANCE_TILES;
    if (tile.muster?.ownerId === state.me) {
      flagCount += 1;
      if (inRange && !ownTileSiegeAt(state, tile.x, tile.y, nowMs)) flags.push({ x: tile.x, y: tile.y, distance });
      continue;
    }
    if (!inRange || ownTileSiegeAt(state, tile.x, tile.y, nowMs)) continue;
    const candidate = { x: tile.x, y: tile.y, distance };
    if (!newFlag || byDistance(candidate, newFlag) < 0) newFlag = candidate;
  }
  flags.sort(byDistance);
  return {
    flags: flags.slice(0, MARCH_ATTACK_FLAG_ACTION_IDS.length),
    ...(newFlag && flagCount < state.musterFlagLimit ? { newFlag } : {})
  };
};

const flagModeText = (tile: Tile | undefined): string => {
  const muster = tile?.muster;
  if (muster?.mode === "MARCH" && muster.targetX !== undefined && muster.targetY !== undefined) {
    return `redirects its march on (${muster.targetX}, ${muster.targetY})`;
  }
  return muster?.mode === "ADVANCE" ? "stops advancing" : "leaves Hold";
};

/**
 * The March Attack rows for a hostile `tile`, or [] when there's no way to
 * march on it (muster not unlocked yet, or no flag / owned tile in range).
 */
export const buildMarchAttackActions = (tile: Tile, state: MarchAttackState, nowMs = Date.now()): TileActionDef[] => {
  if (!tile.ownerId || tile.ownerId === state.me) return [];
  const options = marchAttackOptions(state, tile, nowMs);
  if (options.flags.length === 0 && !options.newFlag) return [];
  if (options.flags.length === 0 && !isMusterUnlocked(state.authEmail, state.bridgeDebugSeasonId)) return [];
  const out: TileActionDef[] = options.flags.map((flag, index) => ({
    id: MARCH_ATTACK_FLAG_ACTION_IDS[index]!,
    label: `March Attack from Flag (${flag.x}, ${flag.y})`,
    detail: `${flag.distance} tiles away · the flag ${flagModeText(state.tiles.get(`${flag.x},${flag.y}`))} and fights its way here.`,
    disabled: false
  }));
  if (options.newFlag) {
    const { x, y, distance } = options.newFlag;
    out.push({
      id: MARCH_ATTACK_NEW_FLAG_ACTION_ID,
      label: "March Attack from New Flag",
      detail: `Raises a muster flag at (${x}, ${y}), ${distance} tiles away, which musters troops then marches here.`,
      disabled: false
    });
  }
  return out;
};

// The disabled reason buildTileActions puts on Launch Attack when the target
// has no bordering origin tile or dock (client-tile-action-logic.ts). Keyed on
// it so ally tiles (no Launch Attack row) and spawn-shielded targets (a
// different reason) never get March Attack rows.
const NO_BORDERING_ORIGIN_REASON = "No bordering origin tile or linked dock";

/**
 * Replaces a hostile tile's disabled "Launch Attack" (no bordering origin)
 * and the waypoint chain's "Expand To & Attack" with the March Attack rows
 * at the top of the menu: a march from a flag is the way to strike deep.
 * Both stay as they were when no march is possible. Idempotent across
 * re-renders.
 */
export const injectMarchAttackActions = (view: TileMenuView, tile: Tile, state: MarchAttackState): void => {
  if (view.actions.some((action) => MARCH_ATTACK_ACTION_IDS.includes(action.id))) return;
  const launch = view.actions.find((action) => action.id === "launch_attack");
  if (!launch?.disabled || launch.disabledReason !== NO_BORDERING_ORIGIN_REASON) return;
  const rows = buildMarchAttackActions(tile, state);
  if (rows.length === 0) return;
  view.actions = [...rows, ...view.actions.filter((action) => action !== launch && action.id !== "expand_here")];
  view.tabs = ["actions", ...view.tabs.filter((tab) => tab !== "actions")];
};

/**
 * Handles a March Attack row: recomputes the options (the menu may be a few
 * ticks stale) and opens the March-To commit sheet from the chosen origin.
 * Returns false for any other action id.
 */
export const dispatchMarchAttackAction = (
  actionId: string,
  target: { x: number; y: number },
  state: MarchAttackState & Parameters<typeof handleArrowGestureConfirm>[0],
  deps: ArrowGestureConfirmDeps
): boolean => {
  if (!MARCH_ATTACK_ACTION_IDS.includes(actionId)) return false;
  const options = marchAttackOptions(state, target);
  const flagIndex = (MARCH_ATTACK_FLAG_ACTION_IDS as readonly string[]).indexOf(actionId);
  const origin = flagIndex >= 0 ? options.flags[flagIndex] : options.newFlag;
  if (!origin) {
    deps.pushFeed(
      flagIndex >= 0 ? "That flag can no longer march on this tile." : "No owned tile in march range to raise a new flag on.",
      "combat",
      "warn"
    );
    return true;
  }
  handleArrowGestureConfirm(state, { x: origin.x, y: origin.y }, { x: target.x, y: target.y }, deps);
  return true;
};
