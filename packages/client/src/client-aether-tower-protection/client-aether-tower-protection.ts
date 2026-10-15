import { OBSERVATORY_PROTECTION_RADIUS } from "../client-constants.js";
import { chebyshevDistanceWrapped, observatoryProtectionActive } from "../client-observatory-cooldown/client-observatory-cooldown.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Aether Tower (OBSERVATORY) protection field overlay, shared by both map
// renderers (client-map-3d-aether-protection-overlay.ts on true-3D, the
// per-tile tint in client-runtime-loop.ts on the 2D fallback).
//
// Paints the tiles an Aether Tower currently shields from hostile Aether
// abilities, using the same rule the simulation enforces
// (isTileShieldedByEnemyObservatory, runtime-ability-helpers.ts): a tower
// shields only tiles its OWNER holds, within the fixed
// OBSERVATORY_PROTECTION_RADIUS (tech range bonuses widen casting reach, not
// the shield), and only while it is active and off its own cooldown. Towers
// the client can't currently see (fogged) are left out -- there is no
// omniscient prediction here, only what's on the client's own tile map.
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

export const isAetherProtectionFieldShown = (state: AetherProtectionShownState, keyFor: (x: number, y: number) => string): boolean => {
  if (state.crystalTargeting.active) return true;
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
// tile change.
let activeTowersMemo: { tiles: ReadonlyMap<string, Tile>; revision: number; towers: ActiveAetherTower[] } | undefined;

const activeAetherTowers = (tiles: ReadonlyMap<string, Tile>, tilesRevision: number): ActiveAetherTower[] => {
  if (activeTowersMemo && activeTowersMemo.tiles === tiles && activeTowersMemo.revision === tilesRevision) return activeTowersMemo.towers;
  const towers: ActiveAetherTower[] = [];
  for (const tile of tiles.values()) {
    const observatory = tile.observatory;
    if (!observatory || observatory.status !== "active" || tile.fogged) continue;
    // A captured tile's leftover tower protects no one (server: owner must hold the tile).
    if (!tile.ownerId || observatory.ownerId !== tile.ownerId) continue;
    towers.push({ x: tile.x, y: tile.y, ownerId: tile.ownerId, cooldownUntil: observatory.cooldownUntil ?? 0 });
  }
  activeTowersMemo = { tiles, revision: tilesRevision, towers };
  return towers;
};

type AetherProtectionFieldState = Pick<ClientState, "tiles" | "tilesRevision" | "me" | "allies" | "dormantStructures">;

/** Every currently-known tower that is shielding its owner's tiles right now, grouped by owner. */
export const aetherProtectionField = (state: AetherProtectionFieldState, nowMs: number): AetherProtectionField => {
  const dormantKeys = new Set(state.dormantStructures.map((entry) => entry.key));
  const field = new Map<string, ProtectingAetherTower[]>();
  for (const tower of activeAetherTowers(state.tiles, state.tilesRevision)) {
    if (!observatoryProtectionActive(tower, nowMs)) continue;
    // dormantStructures only ever lists the local player's own structures.
    if (dormantKeys.has(`${tower.x},${tower.y}:observatory`)) continue;
    const relation: AetherProtectionRelation = tower.ownerId === state.me || state.allies.includes(tower.ownerId) ? "friendly" : "enemy";
    const owned = field.get(tower.ownerId);
    const entry = { x: tower.x, y: tower.y, ownerId: tower.ownerId, relation };
    if (owned) owned.push(entry);
    else field.set(tower.ownerId, [entry]);
  }
  return field;
};

/** Stable snapshot of the field, so the 3D map can rebuild when a tower starts or stops protecting. */
export const aetherProtectionFieldKey = (field: AetherProtectionField): string => {
  const keys: string[] = [];
  for (const towers of field.values()) for (const tower of towers) keys.push(`${tower.x},${tower.y}:${tower.relation}`);
  return keys.sort().join("|");
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

/** 2D fallback renderer's counterpart of the 3D tile wash. */
export const drawAetherProtectionTile2D = (
  ctx: CanvasRenderingContext2D,
  tile: Tile | undefined,
  field: AetherProtectionField | undefined,
  px: number,
  py: number,
  size: number
): void => {
  if (!field) return;
  const protector = tileAetherProtection(tile, field);
  if (!protector) return;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = aetherProtectionColor(protector.relation);
  ctx.fillRect(px, py, size, size);
  ctx.restore();
};
