import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { chebyshevWithWrap, isAetherTowerSuppressed, WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import { observatoryCastRadiusFor } from "../runtime-ability-helpers.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";

export interface AfcDetectedFlag { x: number; y: number; ownerId: string }
const CELL_SIZE = 16;
export const MAX_AFC_DETECTED_FLAGS = 1024;
const MAX_INDEXED_FLAGS = 16_384;
const MAX_CACHED_VIEWS = 4096;
export const oracleDetectionDiagnostics = { indexedFlags: 0, cachedViews: 0, indexLimitHits: 0, viewLimitHits: 0, cacheEvictions: 0 };
type SignalIndex = Map<string, AfcDetectedFlag[]>;
const cellKey = (x: number, y: number): string => `${x},${y}`;
const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export interface AfcOracleDetectionDeps {
  players: () => ReadonlyMap<string, DomainPlayer>;
  tiles: () => ReadonlyMap<string, DomainTileState>;
  flagsByOwner: () => ReadonlyMap<string, ReadonlySet<string>>;
  towersByOwner: () => ReadonlyMap<string, ReadonlySet<string>>;
  now: () => number;
  isTowerDormant: (ownerId: string, key: string) => boolean;
  emit: (playerId: string, flags: readonly AfcDetectedFlag[]) => void;
  scheduleSoon: (task: () => void) => void;
}

/** Index only flag signals. Never walk the world tile map, or put hidden tile records on the wire. */
export function buildAfcSignalIndex(tiles: ReadonlyMap<string, DomainTileState>, flagsByOwner: ReadonlyMap<string, ReadonlySet<string>>): SignalIndex {
  const index: SignalIndex = new Map();
  let count = 0;
  for (const [ownerId, keys] of flagsByOwner) for (const key of keys) {
    const tile = tiles.get(key);
    if (!tile || tile.ownerId !== ownerId || tile.muster?.ownerId !== ownerId) continue;
    if (count >= MAX_INDEXED_FLAGS) { oracleDetectionDiagnostics.indexLimitHits += 1; oracleDetectionDiagnostics.indexedFlags = count; return index; }
    const bucket = cellKey(Math.floor(tile.x / CELL_SIZE), Math.floor(tile.y / CELL_SIZE));
    const signals = index.get(bucket) ?? [];
    signals.push({ x: tile.x, y: tile.y, ownerId });
    index.set(bucket, signals);
    count += 1;
  }
  oracleDetectionDiagnostics.indexedFlags = count;
  return index;
}

export function afcDetectionsForPlayer(player: DomainPlayer, deps: AfcOracleDetectionDeps, index: SignalIndex): AfcDetectedFlag[] {
  if (!player.domainIds?.has("afc-oracle-5")) return [];
  const tiles = deps.tiles();
  const signals = new Map<string, AfcDetectedFlag>();
  const now = deps.now();
  const range = observatoryCastRadiusFor(player);
  for (const key of deps.towersByOwner().get(player.id) ?? []) {
    const tile = tiles.get(key);
    const tower = tile?.observatory;
    if (!tile || tile.ownerId !== player.id || tower?.ownerId !== player.id || tower.status !== "active" || isAetherTowerSuppressed(tower, now) || deps.isTowerDormant(player.id, key)) continue;
    const towerRange = range + (tile.naturalWonder?.type === "WATCHTOWER_ENGINE" ? 10 : 0);
    const radius = Math.ceil(towerRange / CELL_SIZE) + 1;
    const cx = Math.floor(tile.x / CELL_SIZE);
    const cy = Math.floor(tile.y / CELL_SIZE);
    const visitedCells = new Set<string>();
    for (let dx = -radius; dx <= radius; dx += 1) for (let dy = -radius; dy <= radius; dy += 1) {
      const bucket = cellKey(wrap(cx + dx, Math.ceil(WORLD_WIDTH / CELL_SIZE)), wrap(cy + dy, Math.ceil(WORLD_HEIGHT / CELL_SIZE)));
      if (visitedCells.has(bucket)) continue;
      visitedCells.add(bucket);
      for (const signal of index.get(bucket) ?? []) {
        if (signal.ownerId === player.id || isAlliedOrTruced(player, signal.ownerId) || chebyshevWithWrap(tile.x, tile.y, signal.x, signal.y) > towerRange) continue;
        const signalKey = `${signal.x},${signal.y}`;
        if (signals.size >= MAX_AFC_DETECTED_FLAGS && !signals.has(signalKey)) { oracleDetectionDiagnostics.viewLimitHits += 1; continue; }
        signals.set(signalKey, signal);
      }
    }
  }
  return [...signals.values()].sort((a, b) => a.x - b.x || a.y - b.y || a.ownerId.localeCompare(b.ownerId));
}

/** Bounded derived views; coordinates invalidate on movement, ownership, alliance, tower state, or expiry. */
export class AfcOracleDetectionTracker {
  private readonly signatures = new Map<string, { signature: string; flags: readonly AfcDetectedFlag[] }>();
  private queued = false;
  private enabled = false;
  constructor(private readonly deps: AfcOracleDetectionDeps) {}
  cachedFlagsFor(playerId: string): readonly AfcDetectedFlag[] { return this.signatures.get(playerId)?.flags ?? []; }
  queueRefresh(): void {
    if (this.queued || (!this.enabled && this.signatures.size === 0)) return;
    this.queued = true;
    this.deps.scheduleSoon(() => { this.queued = false; this.refreshAll(); });
  }
  sendTo(playerId: string): void {
    const player = this.deps.players().get(playerId);
    if (!player) return;
    if (!player.domainIds?.has("afc-oracle-5")) { if (this.signatures.delete(playerId)) this.deps.emit(playerId, []); return; }
    this.enabled = true;
    this.publish(player, buildAfcSignalIndex(this.deps.tiles(), this.deps.flagsByOwner()), true);
  }
  refreshAll(): void {
    const players = this.deps.players();
    const eligible = [...players.values()].filter(player => player.domainIds?.has("afc-oracle-5") || this.signatures.has(player.id));
    this.enabled = eligible.some(player => player.domainIds?.has("afc-oracle-5"));
    if (!eligible.length) return;
    const index = buildAfcSignalIndex(this.deps.tiles(), this.deps.flagsByOwner());
    for (const player of eligible) this.publish(player, index, false);
    for (const id of this.signatures.keys()) if (!players.has(id)) this.signatures.delete(id);
    oracleDetectionDiagnostics.cachedViews = this.signatures.size;
  }
  private publish(player: DomainPlayer, index: SignalIndex, force: boolean): void {
    if (!player.domainIds?.has("afc-oracle-5")) {
      this.signatures.delete(player.id); this.deps.emit(player.id, []); return;
    }
    const flags = afcDetectionsForPlayer(player, this.deps, index);
    const signature = JSON.stringify(flags);
    if (!force && this.signatures.get(player.id)?.signature === signature) return;
    if (!this.signatures.has(player.id) && this.signatures.size >= MAX_CACHED_VIEWS) {
      const oldest = this.signatures.keys().next().value;
      if (oldest !== undefined) this.signatures.delete(oldest);
      oracleDetectionDiagnostics.cacheEvictions += 1;
    }
    this.signatures.set(player.id, { signature, flags });
    oracleDetectionDiagnostics.cachedViews = this.signatures.size;
    this.deps.emit(player.id, flags);
  }
}
