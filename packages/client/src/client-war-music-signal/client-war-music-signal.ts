import type { ClientState } from "../client-state/client-state.js";

// How long war (combat) music keeps playing after the last live combat
// signal (an ADVANCE/MARCH flag or an active battle) drops out. Without
// this, a manual attack that resolves in a couple of seconds flips the
// soundtrack straight back to peaceful/tension music, which reads as the
// track jumping around; holding combat music for a while after the last
// attack lets it settle instead.
const WAR_MUSIC_HOLD_MS = 2 * 60 * 1000;

// Derives war-music combat/tension signals for updateMusicForGameState.
//
// NOTE: despite the "compute*" name, this function is NOT pure -- it writes
// `state.warMusicHoldUntil` as its latch mechanism (see below), so it must
// always be called with the live, mutable ClientState. Passing a snapshot
// or copy would silently break the hold-timer: the write would land on the
// throwaway object instead of the real state, and combat would never latch.
//
// Both signals are driven off `tile.muster`, a server-tracked field that
// only changes on an explicit SET_MUSTER/CLEAR_MUSTER command (see
// runtime-muster-tick.ts and runtime-structure-lifecycle-command-handlers.ts)
// — not per-frame or per-attack-resolution state. That makes both stable for
// as long as the underlying stance holds, instead of blipping every time an
// individual skirmish's animation or attack-in-flight timer happens to be
// empty for a beat:
//   - combat: a flag is raised and set to ADVANCE or MARCH (actively
//     marching/firing toward a target). `activeBattles` is still OR'd in to
//     catch a manual (non-muster) attack, which can start a skirmish with no
//     muster flag involved at all. Once true, combat is latched via
//     `state.warMusicHoldUntil` for WAR_MUSIC_HOLD_MS after the last time it
//     was live, so the track doesn't jump straight back out of war music the
//     instant a single attack resolves.
//   - tension: a flag is raised but still HOLD (staged, not yet advancing) —
//     the "war is coming" stance.
export const computeWarMusicSignals = (
  state: Pick<ClientState, "tiles" | "activeBattles" | "warMusicHoldUntil">,
  now: number = Date.now()
): {
  combat: boolean;
  tension: boolean;
} => {
  let advancing = false;
  let staged = false;
  for (const tile of state.tiles.values()) {
    if (tile.muster?.mode === "ADVANCE" || tile.muster?.mode === "MARCH") advancing = true;
    else if (tile.muster?.mode === "HOLD") staged = true;
    if (advancing && staged) break;
  }
  const liveCombat = advancing || state.activeBattles.size > 0;
  if (liveCombat) state.warMusicHoldUntil = now + WAR_MUSIC_HOLD_MS;
  return {
    combat: liveCombat || now < state.warMusicHoldUntil,
    tension: staged
  };
};
