// "March Attack" rows on a hostile tile too deep in enemy territory to attack
// directly: march an existing muster flag there, or raise a new flag on the
// owned tile with the shortest march route to the target and march it. Both open the same March-To
// commit sheet (handleArrowGestureConfirm) a flag's own "March To…" opens,
// which sends SET_MUSTER MARCH -- the server creates the flag on that tile in
// MARCH mode when none is there yet (handleSetMusterCommand), so a new flag
// needs no separate HOLD step first.

import { MUSTER_MARCH_MAX_DISTANCE_TILES, musterMarchDistanceTiles } from "@border-empires/shared";
import { marchRouteStepsFromTarget, type MarchRouteState } from "./client-march-route.js";
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

type MarchAttackState = MarchRouteState &
  Pick<ClientState, "musterFlagLimit" | "incomingAttacksByTile" | "authEmail" | "bridgeDebugSeasonId" | "activeTruces">;

const originKey = (origin: { x: number; y: number }): string => `${origin.x},${origin.y}`;

const byDistance = (a: MarchAttackOrigin, b: MarchAttackOrigin): number => a.distance - b.distance || a.x - b.x || a.y - b.y;

/**
 * Every way to march on (target.x, target.y), ranked by real route length
 * (`distance`, see marchRouteStepsFromTarget) so a tile across water with no
 * dock or bridge crossing is never offered: the player's own flags with a
 * route in range (shortest first, at most one per action id, besieged flags
 * left out since the server refuses to march them), and the owned land tile
 * with the shortest route to raise a new flag on -- only while the player is
 * under their flag cap. Every origin also stays within the server's
 * straight-line march cap, which it checks on SET_MUSTER.
 */
export const marchAttackOptions = (state: MarchAttackState, target: { x: number; y: number }, nowMs = Date.now()): MarchAttackOptions => {
  const flags: MarchAttackOrigin[] = [];
  let flagCount = 0;
  let newFlag: MarchAttackOrigin | undefined;
  const routeSteps = marchRouteStepsFromTarget(state, target, nowMs);
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    const distance = routeSteps.get(originKey(tile)) ?? Number.POSITIVE_INFINITY;
    const inRange =
      distance > 0 && Number.isFinite(distance) && musterMarchDistanceTiles(tile.x, tile.y, target.x, target.y) <= MUSTER_MARCH_MAX_DISTANCE_TILES;
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
 * march on it (muster not unlocked yet, no flag / owned tile in range, or a
 * truce with its owner -- a march never attacks a truced empire, so the flag
 * would just sit at the border with its manpower locked). Each row carries
 * its origin as originKey so a click dispatches the origin it names.
 */
export const buildMarchAttackActions = (tile: Tile, state: MarchAttackState, nowMs = Date.now()): TileActionDef[] => {
  if (!tile.ownerId || tile.ownerId === state.me) return [];
  if (state.activeTruces.some((truce) => truce.otherPlayerId === tile.ownerId && truce.endsAt > nowMs)) return [];
  const options = marchAttackOptions(state, tile, nowMs);
  if (options.flags.length === 0 && !options.newFlag) return [];
  if (options.flags.length === 0 && !isMusterUnlocked(state.authEmail, state.bridgeDebugSeasonId)) return [];
  const out: TileActionDef[] = options.flags.map((flag, index) => ({
    id: MARCH_ATTACK_FLAG_ACTION_IDS[index]!,
    label: `March Attack from Flag (${flag.x}, ${flag.y})`,
    detail: `${flag.distance}-tile route · the flag ${flagModeText(state.tiles.get(originKey(flag)))} and fights its way here.`,
    originKey: originKey(flag),
    disabled: false
  }));
  if (options.newFlag) {
    const { x, y, distance } = options.newFlag;
    out.push({
      id: MARCH_ATTACK_NEW_FLAG_ACTION_ID,
      label: "March Attack from New Flag",
      detail: `Raises a muster flag at (${x}, ${y}), a ${distance}-tile route away, which musters troops then marches here.`,
      originKey: originKey(options.newFlag),
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
 * with the March Attack rows at the top of the menu: a march from a flag is
 * the way to strike deep. Idempotent across re-renders.
 */
export const injectMarchAttackActions = (view: TileMenuView, tile: Tile, state: MarchAttackState): void => {
  if (view.actions.some((action) => MARCH_ATTACK_ACTION_IDS.includes(action.id))) return;
  const launch = view.actions.find((action) => action.id === "launch_attack");
  if (!launch?.disabled || launch.disabledReason !== NO_BORDERING_ORIGIN_REASON) return;
  const rows = buildMarchAttackActions(tile, state);
  if (rows.length === 0) return;
  view.actions = [...rows, ...view.actions.filter((action) => action !== launch)];
  view.tabs = ["actions", ...view.tabs.filter((tab) => tab !== "actions")];
};

/**
 * Handles a March Attack row: recomputes the options (the menu may be a few
 * ticks stale) and opens the March-To commit sheet from the origin the row
 * named (`rowOriginKey`, the button's data-origin-key) -- only if that
 * origin is still valid, never a different flag that has since moved into
 * the row's slot. Returns false for any other action id.
 */
export const dispatchMarchAttackAction = (
  actionId: string,
  target: { x: number; y: number },
  rowOriginKey: string | undefined,
  state: MarchAttackState & Parameters<typeof handleArrowGestureConfirm>[0],
  deps: ArrowGestureConfirmDeps
): boolean => {
  if (!MARCH_ATTACK_ACTION_IDS.includes(actionId)) return false;
  const options = marchAttackOptions(state, target);
  const isFlagRow = actionId !== MARCH_ATTACK_NEW_FLAG_ACTION_ID;
  const candidates = isFlagRow ? options.flags : options.newFlag ? [options.newFlag] : [];
  const origin = candidates.find((candidate) => originKey(candidate) === rowOriginKey);
  if (!origin) {
    deps.pushFeed(
      isFlagRow ? "That flag can no longer march on this tile." : "That tile can no longer raise a new flag to march on this tile.",
      "combat",
      "warn"
    );
    return true;
  }
  handleArrowGestureConfirm(state, { x: origin.x, y: origin.y }, { x: target.x, y: target.y }, deps, { newFlag: !isFlagRow });
  return true;
};
