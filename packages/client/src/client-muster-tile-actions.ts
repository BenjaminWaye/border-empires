import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileActionDef } from "./client-types.js";

// Inline to avoid circular dependency with client-tile-action-logic.ts
// (which imports buildMusterActions from here).
const avail = (): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> =>
  ({ disabled: false });

/**
 * Muster tile-menu actions: shown on owned land tiles, gated on ownership
 * and the current muster state. The server will reject these commands if
 * MUSTER_SYSTEM_ENABLED is false (MUSTER_DISABLED), so no client-side flag
 * check is needed.
 */
export const buildMusterActions = (
  tile: Tile,
  state: Pick<ClientState, "me">
): TileActionDef[] => {
  if (tile.terrain !== "LAND" || tile.ownerId !== state.me) return [];

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
    } else {
      out.push({
        id: "muster_hold",
        label: "Set Hold",
        detail: `Mustering… ${staged} manpower staged · switch to HOLD to pause auto-fire.`,
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
