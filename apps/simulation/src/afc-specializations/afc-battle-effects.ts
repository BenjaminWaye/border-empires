import { afcCampaignGuardCounters } from "./afc-diagnostics.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { AFC_CAMPAIGN_RECORD_LIMIT, afcMomentumStacks, afcMomentumAfterVictory, isFortDefending } from "@border-empires/shared";
import { additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import type { LockRecord, LockedCombatResolution } from "../runtime-types.js";

export function flagMomentumAttackMult(player: DomainPlayer | undefined, flag: DomainTileState["muster"], now: number): number {
  if (!player || flag?.ownerId !== player.id) return 1;
  return 1 + afcMomentumStacks(flag.momentum, now) * additiveEffectForPlayer(player, "flagMomentumAttackPerStack");
}

export function fortWardRechargeAt(players: ReadonlyMap<string, DomainPlayer>, key: string): number {
  let until = 0;
  for (const player of players.values()) until = Math.max(until, player.afcCampaign?.fortWardRecharges?.[key] ?? 0);
  return until;
}
export function fortWardIsReady(players: ReadonlyMap<string, DomainPlayer>, tile: DomainTileState | undefined, now: number): boolean {
  const owner = tile?.ownerId ? players.get(tile.ownerId) : undefined;
  return Boolean(owner && tile?.fort && tile.ownershipState === "SETTLED" && tile.fort.ownerId === owner.id && isFortDefending(tile.fort) && (tile.fort.disabledUntil ?? 0) <= now &&
    additiveEffectForPlayer(owner, "fortWardRechargeMs") > 0 && fortWardRechargeAt(players, `${tile.x},${tile.y}`) <= now);
}

export interface AfcBattleMutationContext {
  players: ReadonlyMap<string, DomainPlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  replaceTileState: (key: string, tile: DomainTileState, commandId?: string) => void;
  onStateEviction?: (kind: "ward" | "war", count: number) => void;
}
/** TTL and a direct hard bound; callers expose any eviction via runtime diagnostics. */
export function pruneAfcRecords(records: Record<string, number>, now: number, onEviction: (count: number) => void): void {
  for (const [key, until] of Object.entries(records)) if (until <= now) delete records[key];
  const entries = Object.entries(records).sort((a, b) => b[1] - a[1]);
  if (entries.length > AFC_CAMPAIGN_RECORD_LIMIT) {
    for (const [key] of entries.slice(AFC_CAMPAIGN_RECORD_LIMIT)) delete records[key];
    onEviction(entries.length - AFC_CAMPAIGN_RECORD_LIMIT);
  }
}
export function consumeFortWard(context: AfcBattleMutationContext, tile: DomainTileState, commandId: string): number {
  const player = context.players.get(tile.ownerId!)!;
  const campaign = player.afcCampaign ??= {};
  const recharges = campaign.fortWardRecharges ??= {};
  recharges[`${tile.x},${tile.y}`] = context.now() + additiveEffectForPlayer(player, "fortWardRechargeMs");
  pruneAfcRecords(recharges, context.now(), count => { afcCampaignGuardCounters.wardEvictions += count; context.onStateEviction?.("ward", count); });
  // The charge lives in campaign state so demolishing/rebuilding/transferring a fort cannot reset it.
  context.replaceTileState(`${tile.x},${tile.y}`, { ...tile }, commandId);
  return recharges[`${tile.x},${tile.y}`]!;
}

export function awardFlagMomentum(context: AfcBattleMutationContext, lock: LockRecord, resolution: LockedCombatResolution | undefined, garrisoned: boolean): DomainTileState | undefined {
  const player = context.players.get(lock.playerId);
  const source = resolution?.momentumSource;
  if (!player || !source || additiveEffectForPlayer(player, "flagMomentumAttackPerStack") <= 0) return;
  const tile = context.tiles.get(source.key);
  if (tile?.ownerId !== player.id || tile.muster?.ownerId !== player.id || (tile.muster.setAt ?? 0) !== source.setAt) return;
  const momentum = afcMomentumAfterVictory(tile.muster.momentum, garrisoned, context.now());
  const muster = { ...tile.muster };
  if (momentum) muster.momentum = momentum;
  else delete muster.momentum;
  const next = { ...tile, muster };
  context.replaceTileState(source.key, next, lock.commandId);
  return next;
}

export interface BreakthroughContext {
  players: ReadonlyMap<string, DomainPlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  isLocked: (key: string) => boolean;
  isProtected: (attackerId: string, x: number, y: number) => boolean;
  now: number;
}
/** Pick once at lock creation. The chosen target is stored with the combat roll for replay. */
export function pickBreakthroughTarget(context: BreakthroughContext, attacker: DomainPlayer | undefined, primary: DomainTileState | undefined): { key: string; ownerId: string } | undefined {
  if (!attacker || !primary?.ownerId || primary.ownershipState !== "SETTLED" || additiveEffectForPlayer(attacker, "breakthroughBonusTiles") <= 0) return undefined;
  if (isAlliedOrTruced(attacker, primary.ownerId)) return undefined;
  const candidates: string[] = [];
  forEachFrontierNeighbor(primary.x, primary.y, (x, y) => {
    const key = `${x},${y}`;
    const tile = context.tiles.get(key);
    if (tile?.terrain !== "LAND" || tile.ownerId !== primary.ownerId || context.isLocked(key) || context.isProtected(attacker.id, x, y) || fortWardIsReady(context.players, tile, context.now)) return;
    candidates.push(key);
  });
  const key = candidates[Math.floor(Math.random() * candidates.length)];
  return key ? { key, ownerId: primary.ownerId } : undefined;
}
