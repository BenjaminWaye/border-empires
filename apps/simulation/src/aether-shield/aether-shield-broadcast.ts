// AETHER_SHIELDS push: tells each online player which OTHER players' Aether
// Towers are shielding (switched on, off cooldown, powered) land they can
// currently see, so the client's protection-field tint and target greying
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
// Cost (sim main thread): every ready tower stamps its protection square
// into a world-sized typed-array grid (TowerCoverageGrid), rebuilt only when
// the set of ready towers changes. A viewer's list is then one pass over
// their visible tiles: parse the key, skip it if no tower covers that cell
// (most tiles), else one tile-map read and a walk of the few covering towers. Each
// tick walks viewers round-robin and stops once it has visited
// VISIBLE_TILE_BUDGET_PER_TICK tiles, so a tick stays a few ms however many
// players are online; with many large-vision players online a given
// player's list refreshes every few ticks instead of every tick.
//
// Change-driven: a player is only sent a new list when it differs from the
// last one they were sent. A fresh connection gets the current list from the
// live-subscribe push (sendTo, live-subscribe-reach-push.ts) and, for a
// second tab or reconnect that skips that RPC, from the gateway's replay of
// the latest one (apps/realtime-gateway/src/player-message-replay). Entries
// are dropped for players who are no longer subscribed, so the map is bounded
// by online players.
import type { DomainTileState } from "@border-empires/game-domain";
import { OBSERVATORY_PROTECTION_RADIUS } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { ShieldingTower } from "./aether-shield.js";

export const AETHER_SHIELDS_MESSAGE_TYPE = "AETHER_SHIELDS";
/** Visible tiles a tick may walk before handing the remaining viewers to the next tick (a few ms at worst). */
export const VISIBLE_TILE_BUDGET_PER_TICK = 15_000;

export type AetherShieldsPayload = { type: typeof AETHER_SHIELDS_MESSAGE_TYPE; towers: ShieldingTower[] };

export type AetherShieldBroadcastDeps = {
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly viewerIds: () => Iterable<string>;
  readonly shieldingTowers: () => ShieldingTower[];
  readonly forEachVisibleKey: (viewerId: string, visit: (tileKey: string) => void) => void;
  readonly hasFullVision: (viewerId: string) => boolean;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: AetherShieldsPayload) => void;
};

/** "x,y" tile key -> world tile index, without allocating; -1 if malformed. */
export const tileIndexFromKey = (key: string): number => {
  let x = 0;
  let i = 0;
  for (; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    if (code === 44) break; // ","
    if (code < 48 || code > 57) return -1;
    x = x * 10 + (code - 48);
  }
  if (i === 0 || i >= key.length - 1) return -1;
  let y = 0;
  for (i += 1; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    if (code < 48 || code > 57) return -1;
    y = y * 10 + (code - 48);
  }
  return x < WORLD_WIDTH && y < WORLD_HEIGHT ? y * WORLD_WIDTH + x : -1;
};

/**
 * Which ready towers cover each world tile, as an intrusive linked list in
 * flat typed arrays: `head[tile]` is the first entry (valid only when
 * `epoch[tile]` is the current build, so a rebuild never has to clear the
 * grid), `next[entry]` the next, `towerAt[entry]` the tower's index in
 * `towers`. Buffers are reused; entries are bounded by towers x 41x41.
 */
export class TowerCoverageGrid {
  towers: readonly ShieldingTower[] = [];
  private readonly head = new Int32Array(WORLD_WIDTH * WORLD_HEIGHT);
  private readonly epoch = new Int32Array(WORLD_WIDTH * WORLD_HEIGHT);
  private build = 0;
  private next = new Int32Array(0);
  private towerAt = new Int32Array(0);

  rebuild(towers: readonly ShieldingTower[]): void {
    this.build += 1;
    const build = this.build;
    const side = OBSERVATORY_PROTECTION_RADIUS * 2 + 1;
    if (this.next.length < towers.length * side * side) {
      this.next = new Int32Array(towers.length * side * side);
      this.towerAt = new Int32Array(towers.length * side * side);
    }
    const { head, epoch, next, towerAt } = this;
    const columns = new Int32Array(side);
    let entry = 0;
    for (let towerIndex = 0; towerIndex < towers.length; towerIndex += 1) {
      const tower = towers[towerIndex]!;
      for (let d = 0; d < side; d += 1) columns[d] = (((tower.x + d - OBSERVATORY_PROTECTION_RADIUS) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
      for (let d = 0; d < side; d += 1) {
        const row = ((((tower.y + d - OBSERVATORY_PROTECTION_RADIUS) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT) * WORLD_WIDTH;
        for (let c = 0; c < side; c += 1) {
          const tile = row + columns[c]!;
          if (epoch[tile] !== build) {
            epoch[tile] = build;
            head[tile] = -1;
          }
          next[entry] = head[tile]!;
          towerAt[entry] = towerIndex;
          head[tile] = entry;
          entry += 1;
        }
      }
    }
    this.towers = towers;
  }

  /** True when some ready tower's square covers world tile `tile` (y * WORLD_WIDTH + x). */
  isCovered(tile: number): boolean {
    return this.epoch[tile] === this.build && this.head[tile] !== -1;
  }

  /** Calls `visit` with each tower covering world tile `tile`. */
  forEachCovering(tile: number, visit: (tower: ShieldingTower) => void): void {
    if (this.epoch[tile] !== this.build) return;
    for (let entry = this.head[tile]!; entry !== -1; entry = this.next[entry]!) visit(this.towers[this.towerAt[entry]!]!);
  }
}

/**
 * Other players' towers whose shielded land `viewerId` can see right now, in
 * `grid.towers` order, plus how many visible tiles it walked (for the tick budget).
 */
export const shieldingTowersVisibleTo = (
  viewerId: string,
  grid: TowerCoverageGrid,
  tiles: ReadonlyMap<string, DomainTileState>,
  forEachVisibleKey: (viewerId: string, visit: (tileKey: string) => void) => void,
  fullVision: boolean
): { towers: ShieldingTower[]; visitedTiles: number } => {
  if (fullVision) return { towers: grid.towers.filter((tower) => tower.ownerId !== viewerId), visitedTiles: 0 };
  const found = new Set<ShieldingTower>();
  let visitedTiles = 0;
  let ownerId: string | undefined;
  const collect = (tower: ShieldingTower): void => {
    // A tower shields only its own owner's land.
    if (tower.ownerId === ownerId) found.add(tower);
  };
  forEachVisibleKey(viewerId, (key) => {
    visitedTiles += 1;
    // Most visible tiles sit under no tower at all: rule them out from the
    // key alone, before paying for the tile-map lookup.
    const index = tileIndexFromKey(key);
    if (index < 0 || !grid.isCovered(index)) return;
    ownerId = tiles.get(key)?.ownerId;
    if (!ownerId || ownerId === viewerId) return;
    grid.forEachCovering(index, collect);
  });
  return { towers: found.size === 0 ? [] : grid.towers.filter((tower) => found.has(tower)), visitedTiles };
};

const signatureFor = (towers: readonly ShieldingTower[]): string =>
  towers.map((tower) => `${tower.x},${tower.y}:${tower.ownerId}`).join("|");

export class AetherShieldBroadcaster {
  private readonly lastSentByPlayer = new Map<string, string>();
  // Allocated on first use (a world-sized Int32Array), so a runtime with no
  // online players never pays for it.
  private grid: TowerCoverageGrid | undefined;
  private gridSignature: string | undefined;
  // Round-robin position: the first viewer the next tick starts from.
  private nextViewerId: string | undefined;

  constructor(private readonly deps: AetherShieldBroadcastDeps) {}

  /** Returns how many AETHER_SHIELDS messages it emitted. */
  tick(): number {
    const online = [...this.deps.viewerIds()];
    const onlineSet = new Set(online);
    for (const playerId of this.lastSentByPlayer.keys()) if (!onlineSet.has(playerId)) this.lastSentByPlayer.delete(playerId);
    if (online.length === 0) return 0;
    const grid = this.refreshGrid();
    const start = Math.max(0, this.nextViewerId === undefined ? 0 : online.indexOf(this.nextViewerId));
    let budget = VISIBLE_TILE_BUDGET_PER_TICK;
    let emitted = 0;
    let processed = 0;
    // At least one viewer per tick, so a single huge vision still progresses.
    while (processed < online.length && (processed === 0 || budget > 0)) {
      const viewerId = online[(start + processed) % online.length]!;
      const result = this.send(viewerId, grid, false);
      budget -= result.visitedTiles;
      if (result.sent) emitted += 1;
      processed += 1;
    }
    this.nextViewerId = online[(start + processed) % online.length];
    return emitted;
  }

  /** Sends `viewerId` their current list unconditionally -- for a fresh live subscribe. One pass over that player's visible tiles. */
  sendTo(viewerId: string): void {
    this.send(viewerId, this.refreshGrid(), true);
  }

  /** Tracked-player count, for tests and gauges. */
  size(): number {
    return this.lastSentByPlayer.size;
  }

  private refreshGrid(): TowerCoverageGrid {
    const towers = this.deps.shieldingTowers().sort((a, b) => a.x - b.x || a.y - b.y || a.ownerId.localeCompare(b.ownerId));
    const signature = signatureFor(towers);
    const grid = (this.grid ??= new TowerCoverageGrid());
    if (signature !== this.gridSignature) {
      grid.rebuild(towers);
      this.gridSignature = signature;
    }
    return grid;
  }

  private send(viewerId: string, grid: TowerCoverageGrid, force: boolean): { sent: boolean; visitedTiles: number } {
    const { towers, visitedTiles } = shieldingTowersVisibleTo(viewerId, grid, this.deps.tiles, this.deps.forEachVisibleKey, this.deps.hasFullVision(viewerId));
    const signature = signatureFor(towers);
    if (!force && this.lastSentByPlayer.get(viewerId) === signature) return { sent: false, visitedTiles };
    this.lastSentByPlayer.set(viewerId, signature);
    this.deps.emitPlayerMessage({ commandId: `aether-shields:${viewerId}`, playerId: viewerId }, { type: AETHER_SHIELDS_MESSAGE_TYPE, towers });
    return { sent: true, visitedTiles };
  }
}
