import { MUSTER_ADVANCE_RANGE_STEPS, MUSTER_MARCH_MAX_DISTANCE_TILES, musterFlagCap } from "@border-empires/shared";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileActionDef } from "./client-types.js";
import { isMusterUnlocked } from "./client-muster-unlock/client-muster-unlock-storage.js";
import { musterStatusText } from "./client-side-panel-html/client-side-panel-html.js";
import { armMusterMarchTargeting, cancelMarchAction, MARCH_CANCEL_ACTION_IDS, type MarchCancelActionId } from "./client-muster-march-targeting.js";
import { announceDiscoveryTipForState } from "./client-onboarding-ui-gate/client-onboarding-ui-overlays.js";
import { predictedMusterAmount } from "./client-muster-prediction/client-muster-prediction.js";
import { musterSiegeReason, ownTileSiegeAt } from "./client-muster-siege/client-muster-siege.js";

// Inline to avoid circular dependency with client-tile-action-logic.ts
// (which imports buildMusterActions from here).
const avail = (): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> =>
  ({ disabled: false });

/**
 * Muster tile-menu actions: shown on owned land tiles, gated on ownership,
 * the current muster state, and having met an enemy (rival empire or
 * barbarians) at least once THIS SEASON
 * (see client-muster-unlock-storage.ts) — an existing HOLD/ADVANCE flag
 * still shows its clear action even if reached before an unlock, so a
 * player is never left unable to reclaim staged manpower.
 */
export const buildMusterActions = (
  tile: Tile,
  state: Pick<
    ClientState,
    | "me" | "authEmail" | "manpowerCap" | "manpower" | "musterAmountRateByTile" | "bridgeDebugSeasonId" | "incomingAttacksByTile" | "tiles"
    | "pendingMusterAttacks"
  >,
  nowMs = Date.now()
): TileActionDef[] => {
  if (tile.terrain !== "LAND" || tile.ownerId !== state.me) return [];
  if (!tile.muster && !isMusterUnlocked(state.authEmail, state.bridgeDebugSeasonId)) return [];

  const out: TileActionDef[] = [];
  const muster = tile.muster;

  if (!muster) {
    // No muster flag — offer to set one in HOLD mode.
    out.push({
      id: "muster_hold",
      label: "Stage Muster",
      detail: `Accumulate up to ${Math.floor(musterFlagCap(state.manpowerCap, 0))} manpower on this tile. Switch to Advance when ready to auto-attack.`,
      ...avail()
    });
  } else {
    const cap = Math.floor(musterFlagCap(state.manpowerCap, muster.capLevel));
    const staged = Math.floor(
      predictedMusterAmount(state.musterAmountRateByTile, `${tile.x},${tile.y}`, tile, state.me, cap, state.manpower)
    );
    const nextCap = Math.floor(musterFlagCap(state.manpowerCap, (muster.capLevel ?? 0) + 1));
    // Live auto-fire status (traveling/fighting/cooldown), synced from the
    // server — see musterStatusText's doc comment for what each mode+status
    // combination renders as.
    const status = musterStatusText({
      mode: muster.mode,
      amount: staged,
      x: tile.x,
      y: tile.y,
      targetX: muster.targetX,
      targetY: muster.targetY,
      inFlight: muster.inFlight,
      inFlightCount: muster.inFlightCount,
      nextActionAt: muster.nextActionAt,
      fightX: muster.fightX,
      fightY: muster.fightY,
      noTargetInRange: muster.noTargetInRange,
      insufficientManpower: muster.insufficientManpower,
      unfundableTarget: muster.unfundableTarget,
      clearing: muster.clearing
    });
    // An enemy attack on this flag's tile pins its troops until the fight
    // resolves (the server refuses these with MUSTER_UNDER_SIEGE): no
    // advancing or marching out, and no clearing the flag to pull the troops
    // back before the tile falls. Hold, Cancel March and Expand Capacity stay
    // open -- none of them moves troops off the tile.
    const siege = ownTileSiegeAt(state, tile.x, tile.y, nowMs);
    const siegeLock = (): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> =>
      siege ? { disabled: true, disabledReason: musterSiegeReason(siege, nowMs) } : avail();
    // Muster flag exists — offer mode toggle and clear.
    if (muster.mode === "HOLD") {
      out.push({
        id: "muster_advance",
        label: "Set Advance",
        detail: `Mustering… ${staged}/${cap} manpower staged · clears Planetary Defense and enemies within ${MUSTER_ADVANCE_RANGE_STEPS} steps, then reports back.`,
        ...siegeLock()
      });
      out.push({
        id: "muster_march",
        label: "March To…",
        detail: `Mustering… ${staged}/${cap} manpower staged · pick a target tile (up to ${MUSTER_MARCH_MAX_DISTANCE_TILES} tiles away) to fight toward.`,
        ...siegeLock()
      });
    } else if (muster.mode === "ADVANCE") {
      out.push({
        id: "muster_hold",
        label: "Set Hold",
        detail: `${status} (${staged}/${cap} staged) · switch to HOLD to pause auto-fire.`,
        ...avail()
      });
      out.push({
        id: "muster_march",
        label: "March To…",
        detail: `${status} (${staged}/${cap} staged) · pick a target tile (up to ${MUSTER_MARCH_MAX_DISTANCE_TILES} tiles away) to fight toward.`,
        ...siegeLock()
      });
    } else {
      out.push({
        id: "muster_march_cancel",
        label: "Cancel March",
        detail: `${status} (${staged}/${cap} staged) · switch back to HOLD.`,
        ...avail()
      });
    }
    // Free for now (see MUSTER_FLAG_CAP_MANPOWER_FRACTION in shared/config.ts
    // for why) — a planned FOOD-slot cost isn't designed yet. musterFlagCap
    // clamps to the player's manpower cap, so once cap === nextCap there's
    // no more room to grow into and further presses would be a no-op.
    const maxedOut = nextCap <= cap;
    out.push({
      id: "muster_expand_cap",
      label: "Expand Capacity",
      detail: maxedOut
        ? `Already at your manpower cap (${cap}) — can't expand further.`
        : `Raise this flag's cap from ${cap} to ${nextCap} manpower.`,
      disabled: maxedOut,
      ...(maxedOut ? { disabledReason: "Already at your manpower cap" } : {})
    });
    // A manual attack parked on this flag shows only as the badge over it
    // (client-muster-pending-badge.ts) -- no banner with a Cancel button any
    // more, and touch players have no Esc -- so cancelling lives here.
    const queued = state.pendingMusterAttacks.filter((entry) => entry.musterTileKey === `${tile.x},${tile.y}`);
    if (queued.length > 0) {
      const targets = queued.map((entry) => `(${entry.targetX}, ${entry.targetY})`).join(", ");
      out.push({
        id: "muster_cancel_queued_attack",
        label: queued.length === 1 ? "Cancel Queued Attack" : "Cancel Queued Attacks",
        detail: `Stop waiting to attack ${targets}. Manpower already staged stays on this flag.`,
        ...avail()
      });
    }
    out.push({
      id: "muster_clear",
      label: "Clear Muster",
      detail: `Return ${staged} manpower to pool and remove the flag.`,
      ...siegeLock()
    });
  }

  return out;
};

export type MusterTileActionDeps = {
  state: ClientState;
  sendGameMessage: (payload: unknown) => boolean;
  pushFeed: (msg: string, type?: string, severity?: string) => void;
  renderHud: () => void;
};

/**
 * Dispatches a muster_* tile-menu action to its command — extracted out of
 * client-action-flow.ts (which is already over the file-line cap) so new
 * muster actions land here instead of growing that file. Returns true when
 * actionId was a muster action (handled or not applicable to send), false
 * otherwise so the caller can fall through to its other action handling.
 *
 * `tile` is the selected tile (not just its x/y) because the
 * muster_march_cancel(_2/_3) ids don't always mean "cancel this tile's own
 * march" — cancelMarchAction resolves which origin flag actionId's slot
 * actually refers to (see MARCH_CANCEL_ACTION_IDS / appendMarchCancelAction),
 * which can be a different flag entirely when this tile is only a march
 * *destination*, not itself marching.
 */
export const dispatchMusterTileAction = (actionId: string, tile: Tile, deps: MusterTileActionDeps): boolean => {
  const { x, y } = tile;
  if (actionId === "muster_hold" || actionId === "muster_advance") {
    deps.sendGameMessage({ type: "SET_MUSTER", x, y, mode: actionId === "muster_hold" ? "HOLD" : "ADVANCE" });
    if (deps.state.discoveryTipQueue) announceDiscoveryTipForState(deps.state, "FIRST_MUSTER", deps.renderHud, { x, y });
    return true;
  }
  if (actionId === "muster_march") {
    armMusterMarchTargeting(deps.state, x, y, { pushFeed: deps.pushFeed });
    return true;
  }
  if ((MARCH_CANCEL_ACTION_IDS as readonly string[]).includes(actionId)) {
    cancelMarchAction(deps.state, tile, actionId as MarchCancelActionId, { sendGameMessage: deps.sendGameMessage, pushFeed: deps.pushFeed });
    return true;
  }
  if (actionId === "muster_clear") {
    deps.sendGameMessage({ type: "CLEAR_MUSTER", x, y });
    return true;
  }
  if (actionId === "muster_expand_cap") {
    deps.sendGameMessage({ type: "UPGRADE_MUSTER_CAP", x, y });
    return true;
  }
  if (actionId === "muster_cancel_queued_attack") {
    const flagKey = `${x},${y}`;
    const before = deps.state.pendingMusterAttacks.length;
    deps.state.pendingMusterAttacks = deps.state.pendingMusterAttacks.filter((entry) => entry.musterTileKey !== flagKey);
    // processPendingMusterAttacks only unwatches when it empties the list
    // itself, and it doesn't run at all once the list is empty.
    if (before > 0 && deps.state.pendingMusterAttacks.length === 0) deps.sendGameMessage({ type: "UNWATCH_MUSTER" });
    deps.pushFeed(`Queued attack from (${x}, ${y}) cancelled`, "combat", "info");
    deps.renderHud();
    return true;
  }
  return false;
};
