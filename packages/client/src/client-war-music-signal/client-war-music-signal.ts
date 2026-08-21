import type { ClientState } from "../client-state/client-state.js";

// Derives war-music combat/tension signals for updateMusicForGameState.
//
// Both signals are driven off `tile.muster`, a server-tracked field that
// only changes on an explicit SET_MUSTER/CLEAR_MUSTER command (see
// runtime-muster-tick.ts and runtime-structure-lifecycle-command-handlers.ts)
// — not per-frame or per-attack-resolution state. That makes both stable for
// as long as the underlying stance holds, instead of blipping every time an
// individual skirmish's animation or attack-in-flight timer happens to be
// empty for a beat:
//   - combat: a flag is raised and set to ADVANCE (actively marching/firing).
//     `activeBattles` is still OR'd in to catch a manual (non-muster) attack,
//     which can start a skirmish with no muster flag involved at all.
//   - tension: a flag is raised but still HOLD (staged, not yet advancing) —
//     the "war is coming" stance.
export const computeWarMusicSignals = (state: Pick<ClientState, "tiles" | "activeBattles">): {
  combat: boolean;
  tension: boolean;
} => {
  let advancing = false;
  let staged = false;
  for (const tile of state.tiles.values()) {
    if (tile.muster?.mode === "ADVANCE") advancing = true;
    else if (tile.muster?.mode === "HOLD") staged = true;
    if (advancing && staged) break;
  }
  return {
    combat: advancing || state.activeBattles.size > 0,
    tension: staged
  };
};
