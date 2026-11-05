import { MUSTER_ADVANCE_RANGE_STEPS, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY, type MusterState } from "@border-empires/shared";
import { keyForTile } from "../client-app-runtime-utils.js";
import { hostileMusterNearBorder, isFriendlyOwner, type HostileMusterAlertState } from "../client-hostile-muster-alerts/client-hostile-muster-alerts.js";
import type { ActiveBattleOverlay } from "../client-battle-overlay/client-battle-overlay.js";
import type { Tile } from "../client-types.js";

// Diplomacy filters for the war-music signals (client-war-music-signal.ts).
// War music is about *your* wars: a fight between two other empires, a truce
// partner's flag, or your own flag parked on a border shared only with allies
// and truce partners is not war, so none of them may start the war tracks.

export type MusterWarSignal = "combat" | "tension" | undefined;

const tileAt = (state: HostileMusterAlertState, x: number, y: number): Tile | undefined =>
  state.tiles.get(keyForTile(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)));

// Land owned by someone who isn't us, an ally, or a truce partner -- a
// barbarian or a rival empire, in an ownership state ADVANCE/MARCH attack
// (see isAttackableState in muster-advance-clear.ts). Neutral land is not hostile.
const isHostileTile = (state: HostileMusterAlertState, tile: Tile, nowMs: number): boolean =>
  Boolean(tile.ownerId && tile.ownershipState) && !isFriendlyOwner(state, tile.ownerId!, nowMs);

const isInFlight = (muster: MusterState): boolean => Boolean(muster.inFlight) || (muster.inFlightCount ?? 0) > 0;

// Whether an ADVANCE/MARCH flag is actually engaged: an attack it funded is
// in flight, or the sim has searched and found a target (cooling down or
// saving up for it). Not engaged: the last search found nothing to fight
// (`noTargetInRange`), or the sim hasn't evaluated the flag yet -- every
// ADVANCE/MARCH tick path sets inFlight or nextActionAt, so a flag with
// neither was only just raised. Counting that first beat as combat latched
// the combat hold even on a border with nothing to attack.
const isEngagedFlag = (muster: MusterState): boolean => {
  if (isInFlight(muster)) return true;
  return muster.nextActionAt !== undefined && muster.noTargetInRange !== true;
};

// The tile an in-flight action of this flag is aimed at (fightX/fightY), or
// undefined when the flag reports none or the tile isn't loaded.
const fightTile = (state: HostileMusterAlertState, muster: MusterState): Tile | undefined =>
  isInFlight(muster) && muster.fightX !== undefined && muster.fightY !== undefined ? tileAt(state, muster.fightX, muster.fightY) : undefined;

// The owners of the tiles `accept` picks that lie within
// MUSTER_ADVANCE_RANGE_STEPS steps of `flag`, where a step moves through the
// flag owner's own or neutral land -- the client mirror of the sim's
// nearestHostileWithinSteps (muster-advance-clear.ts), so land behind a truce
// partner's tiles, or across water or mountains, is out of reach. Dock/bridge
// links aren't modelled here; an attack across one is still caught through
// fightTile. Unloaded tiles block the walk. `stopAtFirst` ends the walk at the
// first match, for callers that only need to know whether anyone is in reach.
const ownersWithinFlagReach = (
  state: HostileMusterAlertState,
  flag: Tile,
  flagOwnerId: string,
  accept: (tile: Tile) => boolean,
  stopAtFirst: boolean
): Set<string> => {
  const found = new Set<string>();
  const visited = new Set<string>([keyForTile(flag.x, flag.y)]);
  let frontier: Tile[] = [flag];
  for (let depth = 0; depth < MUSTER_ADVANCE_RANGE_STEPS && frontier.length > 0; depth += 1) {
    const next: Tile[] = [];
    for (const node of frontier) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const x = wrapX(node.x + dx, WORLD_WIDTH);
          const y = wrapY(node.y + dy, WORLD_HEIGHT);
          const key = keyForTile(x, y);
          if (visited.has(key)) continue;
          visited.add(key);
          const tile = state.tiles.get(key);
          if (!tile || tile.terrain !== "LAND") continue;
          if (!tile.ownerId || tile.ownerId === flagOwnerId) {
            // A road; tiles found from it are depth + 2 steps away, so stop
            // extending once those would be beyond the cap.
            if (depth + 2 <= MUSTER_ADVANCE_RANGE_STEPS) next.push(tile);
            continue;
          }
          if (accept(tile)) {
            found.add(tile.ownerId);
            if (stopAtFirst) return found;
          }
        }
      }
    }
    frontier = next;
  }
  return found;
};

// Fogged hostile tiles are skipped: their owner is a stale snapshot.
const isLiveHostileTile = (state: HostileMusterAlertState, nowMs: number) => (tile: Tile): boolean =>
  !tile.fogged && isHostileTile(state, tile, nowMs);

// The hostile owners our own flag is part of a war with: its in-flight action
// is aimed at their land, its March target is their land, or their land is
// within its reach. `stopAtFirst` returns as soon as one is known.
const ownFlagOpponents = (state: HostileMusterAlertState, tile: Tile, muster: MusterState, nowMs: number, stopAtFirst: boolean): Set<string> => {
  const opponents = new Set<string>();
  const fight = fightTile(state, muster);
  if (fight?.ownerId && isHostileTile(state, fight, nowMs)) opponents.add(fight.ownerId);
  if (stopAtFirst && opponents.size > 0) return opponents;
  if (muster.mode === "MARCH" && muster.targetX !== undefined && muster.targetY !== undefined) {
    const target = tileAt(state, muster.targetX, muster.targetY);
    if (target?.ownerId && isHostileTile(state, target, nowMs)) opponents.add(target.ownerId);
  }
  if (stopAtFirst && opponents.size > 0) return opponents;
  for (const owner of ownersWithinFlagReach(state, tile, state.me ?? "", isLiveHostileTile(state, nowMs), stopAtFirst)) opponents.add(owner);
  return opponents;
};

const ownFlagFacesHostile = (state: HostileMusterAlertState, tile: Tile, muster: MusterState, nowMs: number): boolean =>
  ownFlagOpponents(state, tile, muster, nowMs, true).size > 0;

/**
 * The empires (never us, allies or truce partners) the muster flag on `tile`
 * puts us in conflict with, by the same tests as musterWarSignal -- the
 * per-player view of the war-music signal, for labelling who we are at war with.
 * A hostile flag counts when it fights our land, is staged near our border, or
 * has our land within its reach.
 */
export const musterWarOpponents = (state: HostileMusterAlertState, tile: Tile, muster: MusterState, nowMs: number): string[] => {
  if (!state.me) return [];
  if (muster.ownerId === state.me) {
    const advancing = muster.mode === "ADVANCE" || muster.mode === "MARCH";
    if (advancing && !isEngagedFlag(muster)) return [];
    return [...ownFlagOpponents(state, tile, muster, nowMs, false)];
  }
  if (tile.fogged || isFriendlyOwner(state, muster.ownerId, nowMs)) return [];
  const fight = fightTile(state, muster);
  const fightsUs = fight?.ownerId === state.me;
  const nearBorder = Boolean(hostileMusterNearBorder(state, tile, nowMs));
  const ourLandInReach =
    fightsUs || nearBorder || ownersWithinFlagReach(state, tile, muster.ownerId, (other) => other.ownerId === state.me, true).size > 0;
  return ourLandInReach ? [muster.ownerId] : [];
};

/**
 * The war-music signal the muster flag on `tile` contributes:
 *   - our own flag: combat while an engaged ADVANCE/MARCH faces hostile land,
 *     tension while a HOLD does. The sim's target scans already skip
 *     allied/truced tiles, but a flag can still report a busy-looking status
 *     with nothing hostile around (e.g. no manpower staged yet), so the music
 *     checks the flag's reach itself.
 *   - a hostile empire's flag (never an ally's or truce partner's, never a
 *     fogged one): combat while it is fighting our land, wherever it stands;
 *     tension while it is staged near our border (the hostile-muster alert's
 *     test) but not fighting us.
 */
export const musterWarSignal = (state: HostileMusterAlertState, tile: Tile, muster: MusterState, nowMs: number): MusterWarSignal => {
  const advancing = muster.mode === "ADVANCE" || muster.mode === "MARCH";
  if (muster.ownerId === state.me) {
    if (advancing && !isEngagedFlag(muster)) return undefined;
    if (!ownFlagFacesHostile(state, tile, muster, nowMs)) return undefined;
    return advancing ? "combat" : "tension";
  }
  if (tile.fogged || isFriendlyOwner(state, muster.ownerId, nowMs)) return undefined;
  if (advancing && state.me && fightTile(state, muster)?.ownerId === state.me) return "combat";
  return hostileMusterNearBorder(state, tile, nowMs) ? "tension" : undefined;
};

/** Whether a visible battle is one we're fighting, against someone who isn't an ally or truce partner. */
export const isOwnHostileBattle = (
  state: HostileMusterAlertState,
  battle: Pick<ActiveBattleOverlay, "attackerOwnerId" | "defenderOwnerId">,
  nowMs: number
): boolean => {
  if (!state.me) return false;
  if (battle.attackerOwnerId === state.me) return !isFriendlyOwner(state, battle.defenderOwnerId, nowMs);
  if (battle.defenderOwnerId === state.me) return !isFriendlyOwner(state, battle.attackerOwnerId, nowMs);
  return false;
};
