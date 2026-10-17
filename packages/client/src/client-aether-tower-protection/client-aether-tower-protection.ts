import { OBSERVATORY_PROTECTION_RADIUS } from "../client-constants.js";
import { chebyshevDistanceWrapped, observatoryProtectionActive } from "../client-observatory-cooldown/client-observatory-cooldown.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

// Aether Tower (OBSERVATORY) protection field overlay, shared by both map
// renderers (client-map-3d-aether-protection-overlay.ts on true-3D, the
// per-tile tint in client-runtime-loop.ts on the 2D fallback).
//
// Paints the tiles an Aether Tower currently shields from hostile Aether
// abilities, using the same rule the simulation enforces
// (apps/simulation/src/aether-shield/aether-shield.ts): a tower shields only
// tiles its OWNER holds, within the fixed OBSERVATORY_PROTECTION_RADIUS
// (tech range bonuses widen casting reach, not the shield), and only while
// it is active, off its own cooldown and not dormant. Other players' towers
// come from the server's AETHER_SHIELDS push (see aetherProtectionField), so
// a tower hidden in fog still tints whatever of its land you can see. Targeting
// (hostileAetherProtectionAt) reads the same field, so what's tinted red is
// exactly what greys out.
//
// Drawn as a glow (it brightens the tiles, so it never reads as the owner's
// land going dark) with a solid outline along the field's edge, so it reads
// as a bounded shield; the tile menu spells out the colours
// (client-tile-menu-observatory-lines.ts).
//
// Shown only while it is a relevant aid, so it doesn't permanently wash the
// map: while an Aether Tower is selected, while the tile menu's Aether
// ("crystal") tab is open, or while aiming an Aether ability.

export type AetherProtectionRelation = "friendly" | "enemy";

export type ProtectingAetherTower = {
  readonly x: number;
  readonly y: number;
  readonly ownerId: string;
  readonly relation: AetherProtectionRelation;
};

/** Protecting towers grouped by owner: a tile can only be shielded by its own owner's towers. */
export type AetherProtectionField = ReadonlyMap<string, readonly ProtectingAetherTower[]>;

export const AETHER_PROTECTION_FRIENDLY_COLOR = "#6ab4ff"; // matches the selected-tower range ring
export const AETHER_PROTECTION_ENEMY_COLOR = "#ff4d6d";

export const aetherProtectionColor = (relation: AetherProtectionRelation): string =>
  relation === "friendly" ? AETHER_PROTECTION_FRIENDLY_COLOR : AETHER_PROTECTION_ENEMY_COLOR;

type AetherProtectionShownState = Pick<ClientState, "selected" | "tiles" | "tileActionMenu" | "crystalTargeting">;

// Targeted abilities an enemy Aether Tower's shield blocks (server:
// isTileShieldedByEnemyObservatory callers). Aiming anything else -- Sky Dock
// bombard, levy, siege engine strike -- shows no field, since it would wrongly
// suggest the red tiles are off limits.
const SHIELD_BLOCKED_TARGETING: ReadonlySet<string> = new Set(["siphon", "aether_emp", "aether_bridge"]);

export const isAetherProtectionFieldShown = (state: AetherProtectionShownState, keyFor: (x: number, y: number) => string): boolean => {
  if (state.crystalTargeting.active) return SHIELD_BLOCKED_TARGETING.has(state.crystalTargeting.ability);
  if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.activeTab === "crystal") return true;
  if (!state.selected) return false;
  const selectedTile = state.tiles.get(keyFor(state.selected.x, state.selected.y));
  return Boolean(selectedTile?.observatory) && !selectedTile?.fogged;
};

type ActiveAetherTower = { readonly x: number; readonly y: number; readonly ownerId: string; readonly cooldownUntil: number };

// One-entry memo keyed on tilesRevision: the scan walks every known tile, but
// the rebuild-trigger check (client-map-3d-rebuild-triggers.ts) asks for the
// field every frame while it's shown. Cooldowns are re-checked per call
// against the live clock, so a tower coming off cooldown shows up without a
// tile change. chunkFullCount is part of the key because CHUNK_FULL /
// CHUNK_BATCH (client-network.ts applyChunkTiles) write state.tiles without
// bumping tilesRevision, so a tower loaded by a chunk would otherwise be
// missed until some unrelated tile delta arrived.
let activeTowersMemo: { tiles: ReadonlyMap<string, Tile>; revision: number; chunkCount: number; towers: ActiveAetherTower[] } | undefined;

const activeAetherTowers = (tiles: ReadonlyMap<string, Tile>, tilesRevision: number, chunkCount: number): ActiveAetherTower[] => {
  const memo = activeTowersMemo;
  if (memo && memo.tiles === tiles && memo.revision === tilesRevision && memo.chunkCount === chunkCount) return memo.towers;
  const towers: ActiveAetherTower[] = [];
  for (const tile of tiles.values()) {
    const observatory = tile.observatory;
    if (!observatory || observatory.status !== "active" || tile.fogged) continue;
    // A captured tile's leftover tower protects no one (server: owner must hold the tile).
    if (!tile.ownerId || observatory.ownerId !== tile.ownerId) continue;
    towers.push({ x: tile.x, y: tile.y, ownerId: tile.ownerId, cooldownUntil: observatory.cooldownUntil ?? 0 });
  }
  activeTowersMemo = { tiles, revision: tilesRevision, chunkCount, towers };
  return towers;
};

type AetherProtectionFieldState = Pick<ClientState, "tiles" | "tilesRevision" | "chunkFullCount" | "me" | "allies" | "dormantStructures" | "aetherShieldTowers">;

// One-entry memo: targeting asks for the field once per candidate tile
// (computeCrystalTargets walks the whole tile cache) and the tile menu several
// times per render. Keyed on everything the field reads, with the clock
// rounded to the second, so a tower's cooldown ends at most a second late.
// allies is compared by identity: the network handlers replace the array
// wholesale (client-diplomacy-notifications.ts, client-network-init-message.ts).
let fieldMemo: { key: readonly unknown[]; field: AetherProtectionField } | undefined;

/**
 * Every tower shielding its owner's tiles right now, grouped by owner. Your
 * own towers come from your tile map, which sees them exactly (dormancy
 * included). Everyone else's come from the server's AETHER_SHIELDS push once
 * it has arrived (client-aether-shield-state.ts) -- it knows towers hidden
 * in fog and enemy dormancy -- and from visible towers before that.
 */
export const aetherProtectionField = (state: AetherProtectionFieldState, nowMs: number): AetherProtectionField => {
  const key = [state.tiles, state.tilesRevision, state.chunkFullCount, state.aetherShieldTowers, state.dormantStructures, state.me, state.allies, Math.floor(nowMs / 1000)];
  if (fieldMemo && fieldMemo.key.every((part, index) => part === key[index])) return fieldMemo.field;
  const dormantKeys = new Set(state.dormantStructures.map((entry) => entry.key));
  const serverTowers = state.aetherShieldTowers;
  const field = new Map<string, ProtectingAetherTower[]>();
  const add = (x: number, y: number, ownerId: string): void => {
    const relation: AetherProtectionRelation = ownerId === state.me || state.allies.includes(ownerId) ? "friendly" : "enemy";
    const owned = field.get(ownerId);
    const entry = { x, y, ownerId, relation };
    if (owned) owned.push(entry);
    else field.set(ownerId, [entry]);
  };
  for (const tower of activeAetherTowers(state.tiles, state.tilesRevision, state.chunkFullCount)) {
    if (serverTowers && tower.ownerId !== state.me) continue;
    if (!observatoryProtectionActive(tower, nowMs)) continue;
    // dormantStructures only ever lists the local player's own structures.
    if (dormantKeys.has(`${tower.x},${tower.y}:observatory`)) continue;
    add(tower.x, tower.y, tower.ownerId);
  }
  for (const tower of serverTowers ?? []) {
    if (tower.ownerId === state.me) continue;
    // A listed tower in plain view that is visibly not shielding any more
    // (just cast and cooling down, switched off, lost) drops out at once
    // instead of waiting for the next push.
    const seen = state.tiles.get(`${tower.x},${tower.y}`);
    if (seen && !seen.fogged && !(seen.ownerId === tower.ownerId && seen.observatory?.status === "active" && observatoryProtectionActive(seen.observatory, nowMs))) continue;
    add(tower.x, tower.y, tower.ownerId);
  }
  fieldMemo = { key, field };
  return field;
};

// The 3D rebuild-trigger check asks for this every frame while the field is
// shown, but the field itself only changes about once a second (fieldMemo).
const fieldKeyCache = new WeakMap<AetherProtectionField, string>();

/** Stable snapshot of the field, so the 3D map can rebuild when a tower starts or stops protecting. */
export const aetherProtectionFieldKey = (field: AetherProtectionField): string => {
  const cached = fieldKeyCache.get(field);
  if (cached !== undefined) return cached;
  const keys: string[] = [];
  for (const towers of field.values()) for (const tower of towers) keys.push(`${tower.x},${tower.y}:${tower.relation}`);
  const key = keys.sort().join("|");
  fieldKeyCache.set(field, key);
  return key;
};

/** The tower (if any) shielding this tile -- only its owner's own towers count. */
export const tileAetherProtection = (
  tile: Pick<Tile, "x" | "y" | "ownerId"> | undefined,
  field: AetherProtectionField
): ProtectingAetherTower | undefined => {
  if (!tile?.ownerId) return undefined;
  const towers = field.get(tile.ownerId);
  if (!towers) return undefined;
  for (const tower of towers) {
    if (chebyshevDistanceWrapped(tower.x, tower.y, tile.x, tile.y) <= OBSERVATORY_PROTECTION_RADIUS) return tower;
  }
  return undefined;
};

/** The hostile tower (if any) blocking your Aether abilities on this tile -- what targeting greys out. */
export const hostileAetherProtectionAt = (
  state: AetherProtectionFieldState,
  tile: Pick<Tile, "x" | "y" | "ownerId">,
  nowMs: number
): ProtectingAetherTower | undefined => {
  const protector = tileAetherProtection(tile, aetherProtectionField(state, nowMs));
  return protector?.relation === "enemy" ? protector : undefined;
};

/** Sides of a shielded tile where the field's outline runs: the neighbour there isn't shielded the same way. */
export type AetherProtectionEdges = { readonly north: boolean; readonly east: boolean; readonly south: boolean; readonly west: boolean };

export const aetherProtectionEdges = (
  tile: Pick<Tile, "x" | "y">,
  protector: ProtectingAetherTower,
  field: AetherProtectionField,
  tileAt: (x: number, y: number) => Tile | undefined
): AetherProtectionEdges => {
  const sameShield = (dx: number, dy: number): boolean => {
    const x = (((tile.x + dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
    const y = (((tile.y + dy) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
    return tileAetherProtection(tileAt(x, y), field)?.relation === protector.relation;
  };
  return { north: !sameShield(0, -1), east: !sameShield(1, 0), south: !sameShield(0, 1), west: !sameShield(-1, 0) };
};

// 2D fallback renderer's counterpart of client-map-3d-aether-protection-overlay.ts:
// an additive glow over each shielded tile (so the owner's land brightens
// rather than darkens) plus a solid strip along every side where the field ends.
export const drawAetherProtectionTile2D = (
  ctx: CanvasRenderingContext2D,
  tile: Tile | undefined,
  field: AetherProtectionField | undefined,
  tileAt: (x: number, y: number) => Tile | undefined,
  px: number,
  py: number,
  size: number
): void => {
  if (!field || !tile) return;
  const protector = tileAetherProtection(tile, field);
  if (!protector) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = aetherProtectionColor(protector.relation);
  ctx.fillRect(px, py, size, size);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.95;
  const edges = aetherProtectionEdges(tile, protector, field, tileAt);
  const width = Math.max(2, Math.round(size * 0.1));
  if (edges.north) ctx.fillRect(px, py, size, width);
  if (edges.south) ctx.fillRect(px, py + size - width, size, width);
  if (edges.west) ctx.fillRect(px, py, width, size);
  if (edges.east) ctx.fillRect(px + size - width, py, width, size);
  ctx.restore();
};
