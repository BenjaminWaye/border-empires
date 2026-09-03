import { musterFlagCap } from "@border-empires/shared";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileActionDef } from "./client-types.js";
import { isMusterUnlocked } from "./client-muster-unlock/client-muster-unlock-storage.js";
import { armMusterMarchTargeting } from "./client-muster-march-targeting.js";
import { announceDiscoveryTip } from "./client-discovery-tips/client-discovery-tip-overlay.js";
import { pushDiscoveryTipFeedEntry } from "./client-alerts/client-alerts.js";

// Inline to avoid circular dependency with client-tile-action-logic.ts
// (which imports buildMusterActions from here).
const avail = (): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> =>
  ({ disabled: false });

/**
 * Muster tile-menu actions: shown on owned land tiles, gated on ownership,
 * the current muster state, and having met a rival empire at least once
 * (see client-muster-unlock-storage.ts) — an existing HOLD/ADVANCE flag
 * still shows its clear action even if reached before an unlock, so a
 * player is never left unable to reclaim staged manpower.
 */
export const buildMusterActions = (
  tile: Tile,
  state: Pick<ClientState, "me" | "authEmail" | "manpowerCap">
): TileActionDef[] => {
  if (tile.terrain !== "LAND" || tile.ownerId !== state.me) return [];
  if (!tile.muster && !isMusterUnlocked(state.authEmail)) return [];

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
    const staged = Math.floor(muster.amount);
    const cap = Math.floor(musterFlagCap(state.manpowerCap, muster.capLevel));
    const nextCap = Math.floor(musterFlagCap(state.manpowerCap, (muster.capLevel ?? 0) + 1));
    // Muster flag exists — offer mode toggle and clear.
    if (muster.mode === "HOLD") {
      out.push({
        id: "muster_advance",
        label: "Set Advance",
        detail: `Mustering… ${staged}/${cap} manpower staged · auto-fire at an adjacent enemy when ready.`,
        ...avail()
      });
      out.push({
        id: "muster_march",
        label: "March To…",
        detail: `Mustering… ${staged}/${cap} manpower staged · pick a target tile to fight toward.`,
        ...avail()
      });
    } else if (muster.mode === "ADVANCE") {
      out.push({
        id: "muster_hold",
        label: "Set Hold",
        detail: `Mustering… ${staged}/${cap} manpower staged · switch to HOLD to pause auto-fire.`,
        ...avail()
      });
      out.push({
        id: "muster_march",
        label: "March To…",
        detail: `Mustering… ${staged}/${cap} manpower staged · pick a target tile to fight toward.`,
        ...avail()
      });
    } else {
      out.push({
        id: "muster_march_cancel",
        label: "Cancel March",
        detail: `Marching toward (${muster.targetX}, ${muster.targetY}) · switch back to HOLD.`,
        ...avail()
      });
    }
    // Free for now (see MUSTER_FLAG_CAP_MANPOWER_FRACTION in shared/config.ts
    // for why) — a planned FOOD-slot cost isn't designed yet.
    out.push({
      id: "muster_expand_cap",
      label: "Expand Capacity",
      detail: `Raise this flag's cap from ${cap} to ${nextCap} manpower.`,
      ...avail()
    });
    out.push({
      id: "muster_clear",
      label: "Clear Muster",
      detail: `Return ${staged} manpower to pool and remove the flag.`,
      ...avail()
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
 */
export const dispatchMusterTileAction = (actionId: string, x: number, y: number, deps: MusterTileActionDeps): boolean => {
  if (actionId === "muster_hold" || actionId === "muster_advance") {
    deps.sendGameMessage({ type: "SET_MUSTER", x, y, mode: actionId === "muster_hold" ? "HOLD" : "ADVANCE" });
    if (deps.state.discoveryTipQueue) {
      announceDiscoveryTip(deps.state.discoveryTipQueue, "FIRST_MUSTER", deps.state.authEmail, deps.renderHud, (def) =>
        pushDiscoveryTipFeedEntry(deps.state, def)
      );
    }
    return true;
  }
  if (actionId === "muster_march") {
    armMusterMarchTargeting(deps.state, x, y, { pushFeed: deps.pushFeed, sendGameMessage: deps.sendGameMessage });
    return true;
  }
  if (actionId === "muster_march_cancel") {
    deps.sendGameMessage({ type: "SET_MUSTER", x, y, mode: "HOLD" });
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
  return false;
};
