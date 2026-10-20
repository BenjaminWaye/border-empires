import type { ClientState } from "../client-state/client-state.js";
import type { MusterState } from "@border-empires/shared";
import { isOwnHostileBattle, isWarRelevantMuster } from "./client-war-music-hostility.js";

// How long war (combat) music keeps playing after the last live combat
// signal (an ADVANCE/MARCH flag or an active battle) drops out. Without
// this, a manual attack that resolves in a couple of seconds flips the
// soundtrack straight back to peaceful/tension music, which reads as the
// track jumping around; holding combat music for a while after the last
// attack lets it settle instead.
const WAR_MUSIC_HOLD_MS = 2 * 60 * 1000;

// Whether an ADVANCE/MARCH flag is actually engaged: an attack it funded is
// in flight, or the sim has searched and found a target (cooling down or
// saving up for it). Not engaged: the last search found nothing to fight
// (`noTargetInRange`), or the sim hasn't evaluated the flag yet -- every
// ADVANCE/MARCH tick path sets inFlight or nextActionAt, so a flag with
// neither was only just raised. Counting that first beat as combat latched
// WAR_MUSIC_HOLD_MS of war music even on a border with nothing to attack.
const isEngagedFlag = (muster: MusterState): boolean => {
  if (muster.inFlight || (muster.inFlightCount ?? 0) > 0) return true;
  return muster.nextActionAt !== undefined && muster.noTargetInRange !== true;
};

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
//     An ADVANCE/MARCH flag the server reports as idle with nothing to
//     fight (`noTargetInRange` and no attack in flight) does NOT count:
//     the sim's target scan skips allied/truced players' tiles, so a flag
//     parked on a border with a truce partner sits in exactly this state
//     forever, and treating it as combat kept war music playing through
//     the whole truce.
//   - tension: a flag is raised but still HOLD (staged, not yet advancing) —
//     the "war is coming" stance.
//
// Both signals only count *our* wars (client-war-music-hostility.ts): our
// own flags with hostile land in reach, a hostile empire's flag staged near
// our border, and battles we're fighting against a non-ally/non-truce
// partner. Other empires' fights we merely watch, truce partners' flags, and
// flags of ours facing only allies/truce partners stay calm.
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
    if (muster.mode === "ADVANCE" || muster.mode === "MARCH") {
      if (!advancing && isEngagedFlag(muster) && isWarRelevantMuster(state, tile, muster, now)) advancing = true;
    } else if (muster.mode === "HOLD") {
      if (!staged && isWarRelevantMuster(state, tile, muster, now)) staged = true;
    }
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
