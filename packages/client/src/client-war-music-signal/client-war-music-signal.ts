import type { ClientState } from "../client-state/client-state.js";

// Derives war-music combat/tension signals for updateMusicForGameState.
//
// `activeBattles` is purely client-side battle-FX animation state, pruned
// the instant each individual skirmish's ~5.6s clash/rout animation ends
// (see client-battle-overlay.ts). During a sustained war, entries flicker
// empty for a beat between skirmishes even though the war itself hasn't
// paused, which made music flip back to calm and re-trigger repeatedly.
//
// A muster flag left in ADVANCE mode is a durable, server-tracked stance —
// it stays ADVANCE and keeps auto-firing until the player explicitly sets
// it back to HOLD (see runtime-muster-tick.ts) — so it doesn't blip between
// individual skirmishes the way activeBattles does. We still OR in
// activeBattles for a manual (non-muster) attack, which can start a
// skirmish with no ADVANCE flag involved at all.
export const computeWarMusicSignals = (state: Pick<ClientState, "tiles" | "activeBattles" | "incomingAttacksByTile" | "musterTransitByTile" | "deferredAttackByTile" | "pendingMusterAttacks">): {
  combat: boolean;
  tension: boolean;
} => {
  let advancing = false;
  for (const tile of state.tiles.values()) {
    if (tile.muster?.mode === "ADVANCE") {
      advancing = true;
      break;
    }
  }
  return {
    combat: advancing || state.activeBattles.size > 0,
    tension:
      state.incomingAttacksByTile.size > 0 ||
      state.musterTransitByTile.size > 0 ||
      state.deferredAttackByTile.size > 0 ||
      state.pendingMusterAttacks.length > 0
  };
};
