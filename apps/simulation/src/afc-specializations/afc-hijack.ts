// Resonance Hijack (AFC Oracle V). A House that holds the upgrade may target a
// hostile Aether Tower that has no shot left or is suppressed by Counterphase.
// Casting spends one of the caster tower's shots and starts a takeover: the
// target tower is suppressed (no casting, no shield) until the takeover ends,
// and the casting tower's coordinates are sent to the victim through fog.
// When the timer runs out with the casting tower still owned, active, powered
// and unsuppressed, the target tower and its tile change hands; otherwise the
// takeover fails and the target unlocks at once.
//
// State lives only on the target tower (`observatory.hijack`), so snapshots
// carry it and nothing else needs persisting or rebuilding at boot. The
// resolver walks the active-tower index from the existing 1s Aether Tower
// ticker; there is no per-hijack timer or growable side map.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  AFC_SPECIALIZATION_BALANCE, aetherTowerHasShot, isAetherTowerSuppressed, isObservatoryInSiphonMode,
  type ObservatoryHijack
} from "@border-empires/shared";
import type { RuntimeAbilityCommandContext } from "../runtime-ability-command-handlers.js";
import { parseTilePayload } from "../runtime-command-parsers.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { attackAlertDisplayName } from "../runtime-frontier-command.js";
import { additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";
import { afcPlayerStatePayload } from "./afc-player-state.js";

export interface AfcHijackView {
  targetX: number; targetY: number; casterX: number; casterY: number;
  attackerId: string; victimId: string; startedAt: number; endsAt: number;
}
export type AfcHijackOutcome = { targetX: number; targetY: number; casterX: number; casterY: number; attackerId: string; victimId: string; status: "succeeded" | "failed" };
export interface AfcHijackPayload { type: "AFC_HIJACKS"; hijacks: AfcHijackView[] }

export interface AfcHijackDeps {
  tiles: ReadonlyMap<string, DomainTileState>;
  players: ReadonlyMap<string, DomainPlayer>;
  activeObservatoriesByOwner: () => ReadonlyMap<string, ReadonlySet<string>>;
  isStructureDormant: (playerId: string, tileKey: string, field: "observatory") => boolean;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string, options?: { bfsCap?: number }) => void;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">) => void;
  /** An attack or claim is resolving on the tile: a finished takeover waits for it instead of racing the capture. */
  isTileLocked: (tileKey: string) => boolean;
}

/** A takeover the tick has not resolved this long after it should have ended is treated as abandoned, never landed late. */
export const HIJACK_RESOLVE_GRACE_MS = 60_000;

const keyOf = (x: number, y: number): string => `${x},${y}`;
const viewOf = (tile: DomainTileState, hijack: ObservatoryHijack): AfcHijackView => ({
  targetX: tile.x, targetY: tile.y, casterX: hijack.casterX, casterY: hijack.casterY,
  attackerId: hijack.byPlayerId, victimId: tile.ownerId ?? "", startedAt: hijack.startedAt, endsAt: hijack.endsAt
});

/** Every in-progress hijack, read from the active-tower index (bounded by tower count). */
export function activeAfcHijacks(deps: Pick<AfcHijackDeps, "tiles" | "activeObservatoriesByOwner">, now: number): AfcHijackView[] {
  const views: AfcHijackView[] = [];
  for (const keys of deps.activeObservatoriesByOwner().values()) for (const key of keys) {
    const tile = deps.tiles.get(key);
    const hijack = tile?.observatory?.hijack;
    if (tile && hijack && hijack.startedAt <= now) views.push(viewOf(tile, hijack));
  }
  return views;
}

/** Push each involved House its current hijacks (a full replacement list, replayed to new tabs), plus a one-shot outcome. */
export function sendAfcHijacks(deps: Pick<AfcHijackDeps, "tiles" | "activeObservatoriesByOwner" | "emitPlayerMessage" | "players">, playerIds: Iterable<string>, now: number, outcome?: AfcHijackOutcome, skipWhenNone = false): void {
  const all = activeAfcHijacks(deps, now);
  for (const playerId of new Set(playerIds)) {
    if (!playerId || deps.players.get(playerId)?.isAi) continue;
    const payload: AfcHijackPayload = { type: "AFC_HIJACKS", hijacks: all.filter(view => view.attackerId === playerId || view.victimId === playerId) };
    // A fresh client starts with no hijacks, so a subscribe-time push is only needed when one involves this House.
    if (skipWhenNone && !payload.hijacks.length && !outcome) continue;
    deps.emitPlayerMessage({ commandId: `afc-hijacks:${playerId}:${now}`, playerId }, { ...payload });
    if (outcome) deps.emitPlayerMessage({ commandId: `afc-hijack-outcome:${playerId}:${now}`, playerId }, { type: "AFC_HIJACK_OUTCOME", ...outcome });
  }
}

export interface StartHijackContext {
  abilities: RuntimeAbilityCommandContext;
  maxShotsFor: (ownerId: string) => number;
  hijackDeps: () => AfcHijackDeps;
}
export function startResonanceHijack(context: StartHijackContext, command: CommandEnvelope, actor: DomainPlayer, reject: (message: string) => void): void {
  const { abilities } = context;
  if (additiveEffectForPlayer(actor, "resonanceHijack") <= 0) return reject("requires Resonance Hijack");
  const now = abilities.now();
  const readyAt = actor.afcCampaign?.hijackReadyAt ?? 0;
  if (readyAt > now) return reject(`Resonance Hijack recharges in ${Math.ceil((readyAt - now) / 3_600_000)}h`);
  const payload = parseTilePayload(command.payloadJson);
  if (!payload) return reject("invalid tower coordinates");
  const key = keyOf(payload.x, payload.y);
  const target = abilities.tiles.get(key);
  const tower = target?.observatory;
  if (!target || !tower || target.terrain !== "LAND" || !target.ownerId || target.ownerId === actor.id || tower.ownerId !== target.ownerId ||
    tower.status !== "active" || isAlliedOrTruced(actor, target.ownerId)) return reject("select a hostile active Aether Tower");
  if (target.town || target.afc) return reject("towers in towns or AFCs cannot be hijacked");
  if (tower.hijack && now <= tower.hijack.endsAt + HIJACK_RESOLVE_GRACE_MS) return reject("that tower is already being hijacked");
  if (!isAetherTowerSuppressed(tower, now) && aetherTowerHasShot(tower, context.maxShotsFor(target.ownerId), now)) {
    return reject("the tower still has a shot left: wait until it is empty, or suppress it with Counterphase");
  }
  if (abilities.isTileShieldedByEnemyAegisDome(actor.id, target.x, target.y)) return reject("blocked by an Aegis Dome");
  const casterKey = abilities.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, now);
  const caster = casterKey ? abilities.tiles.get(casterKey) : undefined;
  if (!casterKey || !caster) return reject("no ready Aether Tower in range");
  if (isObservatoryInSiphonMode(tower) && tower.siphon) {
    abilities.siphonModeLifecycle.endSiphon({ observatoryKey: key, casterId: target.ownerId, tileKeys: tower.siphon.tileKeys, reason: "caster_observatory_lost" }, command.commandId);
  }
  const latest = abilities.tiles.get(key);
  if (!latest?.observatory) return reject("the target tower is no longer available");
  const endsAt = now + AFC_SPECIALIZATION_BALANCE.hijackTakeoverMs;
  const prior = latest.observatory.suppressedUntil;
  const hijack: ObservatoryHijack = { byPlayerId: actor.id, victimId: target.ownerId, casterX: caster.x, casterY: caster.y, startedAt: now, endsAt, ...(prior !== undefined && prior > now ? { priorSuppressedUntil: prior } : {}) };
  const locked: DomainTileState = { ...latest, observatory: { ...latest.observatory, suppressedUntil: Math.max(latest.observatory.suppressedUntil ?? 0, endsAt), hijack } };
  abilities.replaceTileState(key, locked, command.commandId);
  abilities.spendObservatoryShot(casterKey, now, command.commandId, actor.id);
  (actor.afcCampaign ??= {}).hijackReadyAt = now + AFC_SPECIALIZATION_BALANCE.hijackCooldownMs;
  abilities.emitEvent({ eventType: "DOMAIN_UPDATE", commandId: command.commandId, playerId: actor.id, payloadJson: JSON.stringify(afcPlayerStatePayload(actor)) });
  abilities.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: actor.id, tileDeltas: [abilities.tileDeltaFromState(locked)] });
  abilities.emitEvent({
    eventType: "PLAYER_MESSAGE", commandId: command.commandId, playerId: target.ownerId, messageType: "AETHER_HIJACK_ALERT",
    payloadJson: JSON.stringify({ type: "AETHER_HIJACK_ALERT", attackerId: actor.id, attackerName: attackAlertDisplayName(actor.id, actor.name), x: target.x, y: target.y, casterX: caster.x, casterY: caster.y, endsAt })
  });
  sendAfcHijacks(context.hijackDeps(), [actor.id, target.ownerId], now);
  abilities.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

/** Whether the casting tower can still carry the takeover. */
function casterHolds(deps: AfcHijackDeps, hijack: ObservatoryHijack, now: number): boolean {
  const casterKey = keyOf(hijack.casterX, hijack.casterY);
  const caster = deps.tiles.get(casterKey);
  const tower = caster?.observatory;
  return Boolean(caster && tower && caster.ownerId === hijack.byPlayerId && tower.ownerId === hijack.byPlayerId && tower.status === "active" &&
    !isAetherTowerSuppressed(tower, now) && !deps.isStructureDormant(hijack.byPlayerId, casterKey, "observatory"));
}

/** Resolve finished or broken takeovers. Returns the number still running (a gauge). */
export function tickResonanceHijacks(deps: AfcHijackDeps, now: number): number {
  let running = 0;
  const finished: Array<{ key: string; tile: DomainTileState; hijack: ObservatoryHijack; succeeded: boolean }> = [];
  for (const keys of deps.activeObservatoriesByOwner().values()) for (const key of keys) {
    const tile = deps.tiles.get(key);
    const hijack = tile?.observatory?.hijack;
    if (!tile || !hijack) continue;
    // The tower must still belong to the House it was being taken from, and that House must still be hostile.
    const attacker = deps.players.get(hijack.byPlayerId);
    const ownerChanged = !tile.ownerId || tile.ownerId === hijack.byPlayerId || (hijack.victimId !== undefined && tile.ownerId !== hijack.victimId);
    const nowFriendly = Boolean(attacker && tile.ownerId && isAlliedOrTruced(attacker, tile.ownerId));
    const abandoned = now > hijack.endsAt + HIJACK_RESOLVE_GRACE_MS;
    if (ownerChanged || nowFriendly || abandoned || !casterHolds(deps, hijack, now)) finished.push({ key, tile, hijack, succeeded: false });
    else if (now >= hijack.endsAt && !deps.isTileLocked(key)) finished.push({ key, tile, hijack, succeeded: true });
    else running += 1;
  }
  for (const { key, tile, hijack, succeeded } of finished) {
    const commandId = `afc-hijack:${key}:${now}`;
    const victimId = tile.ownerId ?? "";
    const observatory = tile.observatory!;
    const { hijack: _cleared, ...rest } = observatory;
    let next: DomainTileState;
    if (succeeded) {
      const { muster: _muster, fort: _fort, frontierDecayAt: _decay, frontierDecayKind: _kind, captureHoldUntil: _hold, ...base } = tile;
      next = { ...base, ownerId: hijack.byPlayerId, ownershipState: "SETTLED", observatory: { ...rest, ownerId: hijack.byPlayerId, suppressedUntil: undefined } };
    } else {
      // Hand back any Counterphase suppression that was running before the hijack, if it has not expired since.
      const restored = (hijack.priorSuppressedUntil ?? 0) > now ? hijack.priorSuppressedUntil : undefined;
      next = { ...tile, observatory: { ...rest, suppressedUntil: restored } };
    }
    deps.replaceTileState(key, next, commandId);
    const musterCleared = succeeded && Boolean(tile.muster);
    deps.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: hijack.byPlayerId, tileDeltas: [{ ...deps.tileDeltaFromState(next), ...(musterCleared ? { musterJson: "" } : {}) }] });
    // A captured muster flag is destroyed with its manpower; every viewer's cached flag must clear (same as Aether Purge).
    if (musterCleared) deps.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: `${commandId}:bc`, playerId: "__broadcast__", tileDeltas: [{ x: next.x, y: next.y, ownerId: next.ownerId, ownershipState: next.ownershipState, musterJson: "" }] });
    if (succeeded && victimId) deps.applyEncirclement([key], victimId, commandId, { bfsCap: 2000 });
    if (succeeded) for (const playerId of [hijack.byPlayerId, victimId]) if (playerId && !deps.players.get(playerId)?.isAi) deps.emitPlayerStateUpdate({ commandId, playerId });
    sendAfcHijacks(deps, [hijack.byPlayerId, victimId], now, { targetX: tile.x, targetY: tile.y, casterX: hijack.casterX, casterY: hijack.casterY, attackerId: hijack.byPlayerId, victimId, status: succeeded ? "succeeded" : "failed" });
  }
  return running;
}
