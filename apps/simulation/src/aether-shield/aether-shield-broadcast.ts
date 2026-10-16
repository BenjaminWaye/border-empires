// AETHER_SHIELDS push: tells each online player which OTHER players' Aether
// Towers are ready (switched on, off cooldown) and cover land they can
// currently see, flagging the unpowered ones (`dormant`: they block Siphon
// only), so the client's protection-field tint and target greying
// (packages/client/src/client-aether-tower-protection) are right even for a
// tower hidden in fog, and for enemy power state the client can't know.
//
// Visibility gate: a tower is sent to a viewer only when at least one tile it
// shields (its owner's land inside the protection square) is visible to that
// viewer -- the same land a cast attempt there would already reveal as
// protected. The tower's own position comes along with it (the client needs
// it to draw the square), but a tower whose shielded land the viewer can't
// see at all is never sent. Full-vision viewers (Astral Dock launch) get
// every tower, as they already see every tile.
//
// Cost per tick: one pass over every ready tower's protection square to index
// the land it covers, then one pass over each online viewer's visible tiles
// -- not viewers x towers x square.
//
// Change-driven: a player is only sent a new list when it differs from the
// last one they were sent, plus a slower refresh so a second tab/device that
// attached after the last change catches up. Entries are dropped for players
// who are no longer subscribed, so the map is bounded by online players and a
// returning player gets a fresh list on their first tick back.
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { someProtectionSquareKey, type ShieldingTower } from "./aether-shield.js";

export const AETHER_SHIELDS_MESSAGE_TYPE = "AETHER_SHIELDS";
/** Re-send an unchanged list this often, for sockets that attached after the last change. */
export const AETHER_SHIELDS_REFRESH_MS = 15_000;

export type AetherShieldsPayload = { type: typeof AETHER_SHIELDS_MESSAGE_TYPE; towers: ShieldingTower[] };

export type AetherShieldBroadcastDeps = {
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly viewerIds: () => Iterable<string>;
  readonly shieldingTowers: () => ShieldingTower[];
  readonly forEachVisibleKey: (viewerId: string, visit: (tileKey: string) => void) => void;
  readonly hasFullVision: (viewerId: string) => boolean;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: AetherShieldsPayload) => void;
};

/** Tile keys of the owner's own land inside a tower's protection square: what it actually shields. */
export const shieldedTileKeysForTower = (tiles: ReadonlyMap<string, DomainTileState>, tower: ShieldingTower): string[] => {
  const keys: string[] = [];
  someProtectionSquareKey(tower.x, tower.y, (key) => {
    if (tiles.get(key)?.ownerId === tower.ownerId) keys.push(key);
    return false;
  });
  return keys;
};

/** Every tower's shielded land, inverted: tile key -> the towers covering it. */
export const indexTowersByShieldedKey = (tiles: ReadonlyMap<string, DomainTileState>, towers: readonly ShieldingTower[]): Map<string, ShieldingTower[]> => {
  const index = new Map<string, ShieldingTower[]>();
  for (const tower of towers) {
    for (const key of shieldedTileKeysForTower(tiles, tower)) {
      const covering = index.get(key);
      if (covering) covering.push(tower);
      else index.set(key, [tower]);
    }
  }
  return index;
};

/** Other players' towers whose shielded land `viewerId` can see right now, in `towers` order. */
export const shieldingTowersVisibleTo = (
  viewerId: string,
  towers: readonly ShieldingTower[],
  towersByShieldedKey: ReadonlyMap<string, readonly ShieldingTower[]>,
  forEachVisibleKey: (viewerId: string, visit: (tileKey: string) => void) => void,
  fullVision: boolean
): ShieldingTower[] => {
  if (fullVision) return towers.filter((tower) => tower.ownerId !== viewerId);
  const seen = new Set<ShieldingTower>();
  forEachVisibleKey(viewerId, (key) => {
    for (const tower of towersByShieldedKey.get(key) ?? []) if (tower.ownerId !== viewerId) seen.add(tower);
  });
  return towers.filter((tower) => seen.has(tower));
};

const signatureFor = (towers: readonly ShieldingTower[]): string =>
  towers.map((tower) => `${tower.x},${tower.y}:${tower.ownerId}${tower.dormant ? ":dormant" : ""}`).join("|");

export class AetherShieldBroadcaster {
  private readonly lastSentByPlayer = new Map<string, { signature: string; at: number }>();

  constructor(private readonly deps: AetherShieldBroadcastDeps) {}

  /** Returns how many AETHER_SHIELDS messages it emitted. */
  tick(now: number): number {
    const online = new Set(this.deps.viewerIds());
    for (const playerId of this.lastSentByPlayer.keys()) if (!online.has(playerId)) this.lastSentByPlayer.delete(playerId);
    if (online.size === 0) return 0;
    const towers = this.deps.shieldingTowers().sort((a, b) => a.x - b.x || a.y - b.y || a.ownerId.localeCompare(b.ownerId));
    const towersByShieldedKey = indexTowersByShieldedKey(this.deps.tiles, towers);
    let emitted = 0;
    for (const viewerId of online) {
      const visible = shieldingTowersVisibleTo(viewerId, towers, towersByShieldedKey, this.deps.forEachVisibleKey, this.deps.hasFullVision(viewerId));
      const signature = signatureFor(visible);
      const last = this.lastSentByPlayer.get(viewerId);
      if (last && last.signature === signature && now - last.at < AETHER_SHIELDS_REFRESH_MS) continue;
      this.lastSentByPlayer.set(viewerId, { signature, at: now });
      this.deps.emitPlayerMessage({ commandId: `aether-shields:${viewerId}:${now}`, playerId: viewerId }, { type: AETHER_SHIELDS_MESSAGE_TYPE, towers: visible });
      emitted += 1;
    }
    return emitted;
  }

  /** Tracked-player count, for tests and gauges. */
  size(): number {
    return this.lastSentByPlayer.size;
  }
}
