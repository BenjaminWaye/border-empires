// Siphon siphon-mode lifecycle (docs/game-mechanics.md "Siphon").
//
// A siphon has no timer. It is two tile-resident halves — the caster's
// Observatory carries `observatory.siphon` (which tiles it drains) and each
// drained tile carries a `sabotage` stamp whose `observatoryTileKey` points
// back at that tower (see packages/shared/src/siphon-mode/siphon-mode.ts) —
// and it lasts until one of these events ends it:
//   - the caster sends CANCEL_SIPHON for that tower (runtime-siphon-command-handlers.ts),
//   - the caster's tower stops being an active tower they own on land they
//     own (destroyed, captured, removed, toggled off),
//   - a drained tile changes owner,
//   - the victim gets an Observatory ACTIVE (built, or switched back on)
//     whose protection radius (OBSERVATORY_PROTECTION_RADIUS) covers a
//     tile drained from them.
// Every tile write goes through SimulationRuntime.replaceTileState, which
// calls onTileReplaced below, so no write path can leave the two halves out
// of sync. Ending clears both halves; the slot caches of the caster and every
// victim are invalidated by those same tile writes (sabotage/observatory are
// economy-relevant fields — runtime-economy-cache-invalidation.ts), and a
// player-state update is pushed to each so dormancy flips show immediately.
import type { DomainTileState } from "@border-empires/game-domain";
import { OBSERVATORY_PROTECTION_RADIUS, SIPHON_COOLDOWN_MS } from "@border-empires/game-domain";
import { isSiphonModeSabotage, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { ObservatoryTileWriteDeps } from "../observatory-cooldown-stamp/observatory-cooldown-stamp.js";

export type SiphonEndReason = "cancelled" | "caster_observatory_lost" | "tile_owner_changed" | "victim_observatory";

export type SiphonEndRequest = {
  observatoryKey: string;
  casterId: string;
  tileKeys: readonly string[];
  reason: SiphonEndReason;
};

export type SiphonModeLifecycleDeps = ObservatoryTileWriteDeps & {
  now: () => number;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">) => void;
};

/** A tower keeps siphoning only while it is an active tower its caster owns, on land the caster owns. */
export const observatoryCanHoldSiphon = (tile: DomainTileState | undefined, casterId: string): boolean =>
  Boolean(tile?.observatory && tile.observatory.ownerId === casterId && tile.observatory.status === "active" && tile.ownerId === casterId);

/**
 * True when `ownerId` has an active Observatory whose protection radius covers
 * (x, y). Used both to end a siphon and, at cast time, to skip tiles that such
 * a tower already protects (a siphon there would end the moment it started).
 */
export const isCoveredByOwnersActiveObservatory = (
  tiles: ReadonlyMap<string, DomainTileState>,
  ownerId: string,
  x: number,
  y: number
): boolean => {
  for (let dy = -OBSERVATORY_PROTECTION_RADIUS; dy <= OBSERVATORY_PROTECTION_RADIUS; dy += 1) {
    for (let dx = -OBSERVATORY_PROTECTION_RADIUS; dx <= OBSERVATORY_PROTECTION_RADIUS; dx += 1) {
      const candidate = tiles.get(simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
      if (candidate?.observatory?.status === "active" && candidate.observatory.ownerId === ownerId && candidate.ownerId === ownerId) return true;
    }
  }
  return false;
};

const newlyActiveObservatoryOwner = (previous: DomainTileState | undefined, next: DomainTileState): string | undefined => {
  const observatory = next.observatory;
  if (!observatory || observatory.status !== "active" || next.ownerId !== observatory.ownerId) return undefined;
  const wasActiveForSameOwner =
    previous?.observatory?.status === "active" && previous.observatory.ownerId === observatory.ownerId && previous.ownerId === observatory.ownerId;
  return wasActiveForSameOwner ? undefined : observatory.ownerId;
};

/** Which siphons a single tile write ends (pure; see the file comment for the rules). */
export const siphonEndsForTileChange = (
  tiles: ReadonlyMap<string, DomainTileState>,
  tileKey: string,
  previous: DomainTileState | undefined,
  next: DomainTileState
): SiphonEndRequest[] => {
  const ends: SiphonEndRequest[] = [];
  const previousSiphon = previous?.observatory?.siphon;
  if (previous?.observatory && previousSiphon) {
    const casterId = previous.observatory.ownerId;
    if (!next.observatory?.siphon || !observatoryCanHoldSiphon(next, casterId)) {
      ends.push({ observatoryKey: tileKey, casterId, tileKeys: previousSiphon.tileKeys, reason: "caster_observatory_lost" });
    }
  }
  const previousSabotage = previous?.sabotage;
  if (previous && isSiphonModeSabotage(previousSabotage) && previous.ownerId !== next.ownerId) {
    const observatoryKey = previousSabotage.observatoryTileKey;
    const tileKeys = tiles.get(observatoryKey)?.observatory?.siphon?.tileKeys ?? [tileKey];
    ends.push({ observatoryKey, casterId: previousSabotage.ownerId, tileKeys: [...new Set([...tileKeys, tileKey])], reason: "tile_owner_changed" });
  }
  const victimId = newlyActiveObservatoryOwner(previous, next);
  if (victimId) {
    const seen = new Set<string>();
    for (let dy = -OBSERVATORY_PROTECTION_RADIUS; dy <= OBSERVATORY_PROTECTION_RADIUS; dy += 1) {
      for (let dx = -OBSERVATORY_PROTECTION_RADIUS; dx <= OBSERVATORY_PROTECTION_RADIUS; dx += 1) {
        const drained = tiles.get(simulationTileKey(wrapX(next.x + dx, WORLD_WIDTH), wrapY(next.y + dy, WORLD_HEIGHT)));
        const sabotage = drained?.sabotage;
        if (!drained || drained.ownerId !== victimId || !isSiphonModeSabotage(sabotage) || sabotage.ownerId === victimId) continue;
        if (seen.has(sabotage.observatoryTileKey)) continue;
        seen.add(sabotage.observatoryTileKey);
        const tileKeys = tiles.get(sabotage.observatoryTileKey)?.observatory?.siphon?.tileKeys ?? [simulationTileKey(drained.x, drained.y)];
        ends.push({ observatoryKey: sabotage.observatoryTileKey, casterId: sabotage.ownerId, tileKeys, reason: "victim_observatory" });
      }
    }
  }
  return ends;
};

export class SiphonModeLifecycle {
  // Drained synchronously by flush(); ending a siphon writes tiles, which
  // re-enters onTileReplaced, so follow-up ends queue here instead of
  // recursing. Never outlives one outermost replaceTileState call.
  private readonly pending: Array<SiphonEndRequest & { commandId: string }> = [];
  private flushing = false;

  constructor(private readonly deps: SiphonModeLifecycleDeps) {}

  /** Hook for SimulationRuntime.replaceTileState — must run after all other tile maintenance. */
  onTileReplaced(tileKey: string, previous: DomainTileState | undefined, next: DomainTileState, commandId: string): void {
    if (!previous?.observatory?.siphon && !previous?.sabotage?.observatoryTileKey && next.observatory?.status !== "active") return;
    for (const end of siphonEndsForTileChange(this.deps.tiles, tileKey, previous, next)) this.pending.push({ ...end, commandId });
    this.flush();
  }

  /** Pushes a player-state update to each player whose slot supply a siphon just moved. */
  emitSlotTransferUpdates(commandId: string, playerIds: Iterable<string>): void {
    for (const playerId of new Set(playerIds)) this.deps.emitPlayerStateUpdate({ commandId, playerId });
  }

  /** Ends one siphon now (idempotent). Returns false when there was nothing left to end. */
  endSiphon(request: SiphonEndRequest, commandId: string): boolean {
    this.pending.push({ ...request, commandId });
    return this.flush() > 0;
  }

  private flush(): number {
    if (this.flushing) return 0;
    this.flushing = true;
    let ended = 0;
    try {
      for (let next = this.pending.shift(); next; next = this.pending.shift()) {
        if (this.applyEnd(next, next.commandId)) ended += 1;
      }
    } finally {
      this.flushing = false;
    }
    return ended;
  }

  private applyEnd(request: SiphonEndRequest, commandId: string): boolean {
    const { tiles } = this.deps;
    const updated: DomainTileState[] = [];
    const victimIds = new Set<string>();
    // Drained tiles first: the tower write below re-enters onTileReplaced,
    // and by then there is nothing left for that nested end to clear.
    for (const tileKey of request.tileKeys) {
      const tile = tiles.get(tileKey);
      const sabotage = tile?.sabotage;
      if (!tile || !isSiphonModeSabotage(sabotage) || sabotage.observatoryTileKey !== request.observatoryKey || sabotage.ownerId !== request.casterId) continue;
      const cleared: DomainTileState = { ...tile, sabotage: undefined };
      this.deps.replaceTileState(tileKey, cleared, commandId);
      updated.push(cleared);
      if (tile.ownerId) victimIds.add(tile.ownerId);
    }
    const tower = tiles.get(request.observatoryKey);
    // No owner check on the record: a captured tower can carry the old
    // owner's siphon record over (structure fields are spread on capture).
    if (tower?.observatory?.siphon) {
      // The tower's cast cooldown starts when siphon mode ends, so
      // cancel-and-recast can't be used to hop the drain between targets.
      const cooldownUntil = tower.observatory.ownerId === request.casterId ? this.deps.now() + SIPHON_COOLDOWN_MS : tower.observatory.cooldownUntil;
      const released: DomainTileState = { ...tower, observatory: { ...tower.observatory, siphon: undefined, cooldownUntil } };
      this.deps.replaceTileState(request.observatoryKey, released, commandId);
      updated.push(released);
    }
    if (updated.length === 0) return false;
    this.deps.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId: request.casterId,
      tileDeltas: updated.map((tile) => this.deps.tileDeltaFromState(tile))
    });
    // Slot supply moved back from caster to victims: push both so dormancy flips show now.
    this.emitSlotTransferUpdates(commandId, [request.casterId, ...victimIds]);
    return true;
  }
}
