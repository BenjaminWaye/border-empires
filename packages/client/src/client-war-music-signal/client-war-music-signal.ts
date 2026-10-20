import type { ClientState } from "../client-state/client-state.js";
import { isOwnHostileBattle, musterWarSignal } from "./client-war-music-hostility.js";

// How long war (combat) music keeps playing after the last live combat
// signal (an engaged ADVANCE/MARCH flag or a battle we're fighting) drops
// out. Without this, a manual attack that resolves in a couple of seconds
// flips the soundtrack straight back to peaceful/tension music, which reads
// as the track jumping around; holding combat music for a while after the
// last attack lets it settle instead.
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
//   - combat: an engaged ADVANCE/MARCH flag of ours facing hostile land, or
//     a hostile empire's flag fighting our land. Battles we're fighting are
//     OR'd in to catch a manual (non-muster) attack, which can start a
//     skirmish with no muster flag involved at all. Once true, combat is
//     latched via `state.warMusicHoldUntil` for WAR_MUSIC_HOLD_MS after the
//     last time it was live, so the track doesn't jump straight back out of
//     war music the instant a single attack resolves.
//   - tension: a HOLD flag of ours facing hostile land (staged, not yet
//     advancing), or a hostile empire's flag staged near our border — the
//     "war is coming" stance.
//
// Both signals only count *our* wars (see musterWarSignal and
// isOwnHostileBattle in client-war-music-hostility.ts): other empires' fights
// we merely watch, allies' and truce partners' flags, and flags of ours
// facing only allies/truce partners or neutral land stay calm.
export const computeWarMusicSignals = (
  state: Pick<ClientState, "tiles" | "activeBattles" | "warMusicHoldUntil" | "me" | "allies" | "activeTruces">,
  now: number = Date.now()
): {
  combat: boolean;
  tension: boolean;
} => {
  let advancing = false;
  let staged = false;
  for (const tile of state.tiles.values()) {
    const muster = tile.muster;
    if (!muster) continue;
    const signal = musterWarSignal(state, tile, muster, now);
    if (signal === "combat") advancing = true;
    else if (signal === "tension") staged = true;
    if (advancing && staged) break;
  }
  let ownBattle = false;
  for (const battle of state.activeBattles.values()) {
    if (isOwnHostileBattle(state, battle, now)) {
      ownBattle = true;
      break;
    }
  }
  const liveCombat = advancing || ownBattle;
  if (liveCombat) state.warMusicHoldUntil = now + WAR_MUSIC_HOLD_MS;
  return {
    combat: liveCombat || now < state.warMusicHoldUntil,
    tension: staged
  };
};
