import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { MUSTER_MAX_TILES } from "@border-empires/shared";
import { additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import type { LockRecord } from "../runtime-types.js";

/**
 * How many muster flags this player can have active at once (base +
 * tech/domain/wonder bonuses) — the same calc handleSetMusterCommand uses to
 * gate a new flag. Shared here so the accumulation tick can divide a
 * player's manpower cap evenly across their unlocked flag slots instead of
 * letting a single flag draw down the whole cap (see musterFlagCapShare).
 */
export const playerMusterFlagLimit = (
  actor: Pick<DomainPlayer, "techIds" | "domainIds"> & { wonderMusterExtraFlag?: number }
): number => MUSTER_MAX_TILES + additiveEffectForPlayer(actor, "musterMaxTilesAdd") + (actor.wonderMusterExtraFlag ?? 0);

// Distance threshold beyond which ADVANCE/MARCH search slows to a reduced
// cadence. Must stay BELOW ADVANCE_MAX_RANGE_TILES or the reduced cadence
// becomes unreachable: the only caller compares `best.hops > this`, and
// best.hops is itself capped at ADVANCE_MAX_RANGE_TILES, so a threshold at or
// above the cap silently makes every in-range target fire every tick and turns
// ADVANCE_FAR_COOLDOWN_MS into dead code. Kept at half the cap, preserving the
// original "near fires every tick, far is throttled" split (this was 15 against
// a cap of 60 before the cap dropped to 10).
export const ADVANCE_THROTTLE_DIST = 5;
// How long to wait before re-searching when the front is far away (ms).
export const ADVANCE_FAR_COOLDOWN_MS = 3_000;
// How long to wait before re-searching when nothing attackable was found at all (ms).
export const ADVANCE_EMPTY_COOLDOWN_MS = 10_000;
// Hard range cap for muster auto-fire (both ADVANCE and MARCH), in BFS hops
// through owned territory (a dock link counts as one hop, not the real
// distance it crosses, so a legitimate cross-water flag is never penalized by
// this cap). Once every nearer front is locked/contested, auto-fire would
// otherwise keep walking its BFS outward and eventually strike whatever
// unlocked tile it finds first, however far away — this caps that so a flag
// idles instead of launching a moon-shot attack on the far side of the empire.
//
// This is a *traversal* bound, not just a filter on the chosen candidate: the
// BFS stops enqueuing past it. That distinction is the whole point — as a
// result-only filter (what this was until the 2026-09-10 prod incident) each
// raised flag still walked the player's entire connected territory every tick
// and threw the far results away, which saturated the sim's single shared CPU
// under live load and surfaced to players as "sim unavailable".
//
// 10 matches player expectation: a muster flag is a local front-line order, and
// nobody expects a flag to reach further than ~10 tiles in any direction. Keep
// this small — search cost grows with the *area* covered, so raising it back to
// the old 60 is ~36x the work per flag per tick, not 6x.
export const ADVANCE_MAX_RANGE_TILES = 10;

export type MusterAdvanceCooldowns = Map<string, number>; // musterTileKey -> nextSearchAt (ms)

/**
 * Returns the active lock currently funded from `musterTileKey` (attacks
 * record the flag that paid for them on LockRecord.musterSourceKey), or
 * undefined when the flag has no attack in flight. Every lock in the map is
 * scanned rather than a single lookup because a lock is stored under its
 * origin and target tile keys — the muster flag tile isn't necessarily either.
 */
export const lockSourcedFromMusterTile = (
  locksByTile: ReadonlyMap<string, LockRecord>,
  musterTileKey: string
): LockRecord | undefined => {
  for (const lock of locksByTile.values()) {
    if (lock.musterSourceKey === musterTileKey) return lock;
  }
  return undefined;
};

type MusterStatusPatch = {
  inFlight: boolean;
  nextActionAt: number | undefined;
  fightX?: number | undefined;
  fightY?: number | undefined;
  // True when the cooldown being set is because the last search found
  // nothing attackable within ADVANCE_MAX_RANGE_TILES at all — as opposed to
  // a cooldown set because a real (just-distant) target was found. Only
  // meaningful alongside a nextActionAt cooldown; omit/false otherwise.
  noTargetInRange?: boolean | undefined;
  // True when a reachable enemy tile exists within range but this flag can't
  // afford to attack it (including having 0 manpower staged). Mutually
  // exclusive with noTargetInRange — see MusterState's doc comment.
  insufficientManpower?: boolean | undefined;
};

type MusterStatusSyncDeps<TDelta> = {
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: {
    eventType: "TILE_DELTA_BATCH";
    commandId: string;
    playerId: string;
    tileDeltas: TDelta[];
  }) => void;
  tileDeltaFromState: (tile: DomainTileState) => TDelta;
};

/**
 * Stamps a muster flag's ADVANCE/MARCH auto-fire status (`inFlight`,
 * `nextActionAt`) onto the tile and, if either value actually changed,
 * replaces the tile state and emits a small delta so the client's HUD/tile
 * label can show "Fighting at (x,y)" / "Traveling to (x,y)" / "Planning next
 * move — Ns" instead of only ever "Advancing"/"Holding". A no-op when
 * nothing changed, so this doesn't turn every idle tick into network chatter.
 */
export const syncMusterStatus = <TDelta>(
  deps: MusterStatusSyncDeps<TDelta>,
  tile: DomainTileState,
  originKey: string,
  playerId: string,
  nowMs: number,
  patch: MusterStatusPatch
): void => {
  const muster = tile.muster;
  if (!muster) return;
  if (
    (muster.inFlight ?? false) === patch.inFlight &&
    muster.nextActionAt === patch.nextActionAt &&
    muster.fightX === patch.fightX &&
    muster.fightY === patch.fightY &&
    (muster.noTargetInRange ?? false) === (patch.noTargetInRange ?? false) &&
    (muster.insufficientManpower ?? false) === (patch.insufficientManpower ?? false)
  ) {
    return;
  }
  const updatedTile: DomainTileState = {
    ...tile,
    muster: {
      ...muster,
      inFlight: patch.inFlight || undefined,
      nextActionAt: patch.nextActionAt,
      fightX: patch.fightX,
      fightY: patch.fightY,
      noTargetInRange: patch.noTargetInRange || undefined,
      insufficientManpower: patch.insufficientManpower || undefined
    }
  };
  deps.replaceTileState(originKey, updatedTile);
  deps.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `muster-status:${playerId}:${originKey}:${nowMs}`,
    playerId,
    tileDeltas: [deps.tileDeltaFromState(updatedTile)]
  });
};
