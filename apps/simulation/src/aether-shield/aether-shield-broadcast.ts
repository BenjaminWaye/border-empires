// AETHER_SHIELDS push: tells each online player which OTHER players' Aether
// Towers are shielding land they can currently see, so the client's
// protection-field tint (packages/client/src/client-aether-tower-protection)
// is right even for a tower hidden in fog, and for an enemy tower that is
// dormant or on cooldown, which the client has no way to know.
//
// Visibility gate: a tower is sent to a viewer only when at least one tile it
// shields (its owner's land inside the protection square) is visible to that
// viewer -- the same land a cast attempt there would already reveal as
// protected. The tower's own position comes along with it (the client needs
// it to draw the square), but a tower whose shielded land the viewer can't
// see at all is never sent. Full-vision viewers (Astral Dock launch) get
// every tower, as they already see every tile.
//
// Change-driven: a player is only sent a new list when it differs from the
// last one they were sent, plus a slow refresh so a second tab/device that
// attached after the last change catches up. Entries are dropped for players
// who are no longer subscribed, so the map is bounded by online players and a
// returning player gets a fresh list on their first tick back.
import type { DomainTileState } from "@border-empires/game-domain";
import { OBSERVATORY_PROTECTION_RADIUS } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { ShieldingTower } from "./aether-shield.js";

export const AETHER_SHIELDS_MESSAGE_TYPE = "AETHER_SHIELDS";
/** Re-send an unchanged list this often, for sockets that attached after the last change. */
export const AETHER_SHIELDS_REFRESH_MS = 60_000;

export type AetherShieldsPayload = { type: typeof AETHER_SHIELDS_MESSAGE_TYPE; towers: ShieldingTower[] };

export type AetherShieldBroadcastDeps = {
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly viewerIds: () => Iterable<string>;
  readonly shieldingTowers: () => ShieldingTower[];
  readonly isVisible: (viewerId: string, tileKey: string) => boolean;
  readonly hasFullVision: (viewerId: string) => boolean;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: AetherShieldsPayload) => void;
};

/** Tile keys of the owner's own land inside a tower's protection square: what it actually shields. */
export const shieldedTileKeysForTower = (tiles: ReadonlyMap<string, DomainTileState>, tower: ShieldingTower): string[] => {
  const keys: string[] = [];
  for (let dy = -OBSERVATORY_PROTECTION_RADIUS; dy <= OBSERVATORY_PROTECTION_RADIUS; dy += 1) {
    for (let dx = -OBSERVATORY_PROTECTION_RADIUS; dx <= OBSERVATORY_PROTECTION_RADIUS; dx += 1) {
      const key = simulationTileKey(wrapX(tower.x + dx, WORLD_WIDTH), wrapY(tower.y + dy, WORLD_HEIGHT));
      if (tiles.get(key)?.ownerId === tower.ownerId) keys.push(key);
    }
  }
  return keys;
};

/** Other players' shielding towers whose shielded land `viewerId` can see right now. */
export const shieldingTowersVisibleTo = (
  viewerId: string,
  towers: readonly ShieldingTower[],
  shieldedKeysFor: (tower: ShieldingTower) => readonly string[],
  isVisible: (viewerId: string, tileKey: string) => boolean,
  fullVision: boolean
): ShieldingTower[] =>
  towers.filter((tower) => tower.ownerId !== viewerId && (fullVision || shieldedKeysFor(tower).some((key) => isVisible(viewerId, key))));

const signatureFor = (towers: readonly ShieldingTower[]): string =>
  towers.map((tower) => `${tower.x},${tower.y}:${tower.ownerId}`).join("|");

export class AetherShieldBroadcaster {
  private readonly lastSentByPlayer = new Map<string, { signature: string; at: number }>();

  constructor(private readonly deps: AetherShieldBroadcastDeps) {}

  /** Returns how many AETHER_SHIELDS messages it emitted. */
  tick(now: number): number {
    const towers = this.deps.shieldingTowers().sort((a, b) => a.x - b.x || a.y - b.y || a.ownerId.localeCompare(b.ownerId));
    // Shielded land per tower, computed lazily and shared by every viewer this tick.
    const shieldedKeysByTower = new Map<ShieldingTower, string[]>();
    const shieldedKeysFor = (tower: ShieldingTower): string[] => {
      let keys = shieldedKeysByTower.get(tower);
      if (!keys) {
        keys = shieldedTileKeysForTower(this.deps.tiles, tower);
        shieldedKeysByTower.set(tower, keys);
      }
      return keys;
    };
    const online = new Set(this.deps.viewerIds());
    for (const playerId of this.lastSentByPlayer.keys()) if (!online.has(playerId)) this.lastSentByPlayer.delete(playerId);
    let emitted = 0;
    for (const viewerId of online) {
      const visible = shieldingTowersVisibleTo(viewerId, towers, shieldedKeysFor, this.deps.isVisible, this.deps.hasFullVision(viewerId));
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
