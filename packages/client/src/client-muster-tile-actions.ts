import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileActionDef } from "./client-types.js";
import { isMusterUnlocked } from "./client-muster-unlock/client-muster-unlock-storage.js";

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
  state: Pick<ClientState, "me" | "authEmail">
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
      detail: "Accumulate manpower on this tile. Switch to Advance when ready to auto-attack.",
      ...avail()
    });
  } else {
    const staged = Math.floor(muster.amount);
    // Muster flag exists — offer mode toggle and clear.
    if (muster.mode === "HOLD") {
      out.push({
        id: "muster_advance",
        label: "Set Advance",
        detail: `Mustering… ${staged} manpower staged · auto-fire at an adjacent enemy when ready.`,
        ...avail()
      });
      out.push({
        id: "muster_march",
        label: "March To…",
        detail: `Mustering… ${staged} manpower staged · pick a target tile to fight toward.`,
        ...avail()
      });
    } else if (muster.mode === "ADVANCE") {
      out.push({
        id: "muster_hold",
        label: "Set Hold",
        detail: `Mustering… ${staged} manpower staged · switch to HOLD to pause auto-fire.`,
        ...avail()
      });
      out.push({
        id: "muster_march",
        label: "March To…",
        detail: `Mustering… ${staged} manpower staged · pick a target tile to fight toward.`,
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
    out.push({
      id: "muster_clear",
      label: "Clear Muster",
      detail: `Return ${staged} manpower to pool and remove the flag.`,
      ...avail()
    });
  }

  return out;
};
