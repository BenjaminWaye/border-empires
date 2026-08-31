import type { Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createResourceBadgeOverlay, type ResourceBadgeOverlay } from "../client-map-3d-unfed-badge-overlay/client-map-3d-unfed-badge-overlay.js";
import { drawShardGlyph } from "../client-persistent-alerts/client-persistent-alerts.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import type { ClientShardRainAlert } from "../client-shard-alert/client-shard-alert.js";
import type { Tile } from "../client-types.js";

// Shard rain impact-site locator: same bobbing shield badge machinery as
// the resource badges in client-map-3d.ts, minus the prohibition slash
// (this points at "something worth looking at", not a shortage), a white
// shard icon instead of the CRYSTAL resource's blue gem emoji (a shard
// landing isn't a Crystal shortage, and the icon should match the actual
// white shard-site model in client-map-3d-shard-overlay.ts), and a darker,
// cooler shield than the default warm gold (which reads as "resource").
// Capped small since a rain only ever has a handful of sites
// (SHARD_RAIN_SITE_MAX + a per-player bonus — runtime-shard-rain-rules.ts),
// not one per tile.
const SHARD_RAIN_BADGE_MAX_SITES = 64;
// Must match TILE_CENTER_OFFSET in client-map-3d.ts (the offset from a
// tile's integer world coordinate to its rendered center).
const TILE_CENTER_OFFSET = 0.5;

export const createShardRainBadgeOverlay = (scene: Scene): ResourceBadgeOverlay =>
  createResourceBadgeOverlay(scene, SHARD_RAIN_BADGE_MAX_SITES, "", {
    drawProhibitionSlash: false,
    customIconDraw: drawShardGlyph,
    shieldColors: { fill: "#26333d", stroke: "#5c7c8a" }
  });

// A separate small loop over the handful of active sites, called from
// client-map-3d.ts's per-frame render pass, rather than a branch inside its
// main per-tile loop — that loop `continue`s past unexplored tiles before
// reaching any overlay code, but a rain site should still get its badge
// even on ground the player hasn't scouted yet.
// A site's shard is confirmed collected only once we have an unfogged read
// on that tile showing no shardSite -- an absent/fogged tile just means we
// haven't heard about it and the badge should keep showing.
const isShardSiteCollected = (tiles: ReadonlyMap<string, Tile>, x: number, y: number): boolean => {
  const tile = tiles.get(`${x},${y}`);
  return tile !== undefined && !tile.fogged && !tile.shardSite;
};

export const populateShardRainBadgeInstances = (
  overlay: ResourceBadgeOverlay,
  shardRainStatus: ClientShardRainAlert | undefined,
  deps: {
    camX: number;
    camY: number;
    halfW: number;
    halfH: number;
    elevationAt: (wx: number, wy: number) => number;
    tiles: ReadonlyMap<string, Tile>;
  }
): void => {
  if (shardRainStatus?.phase !== "started" || !shardRainStatus.sites || Date.now() >= shardRainStatus.expiresAt) return;
  for (const site of shardRainStatus.sites) {
    if (isShardSiteCollected(deps.tiles, site.x, site.y)) continue;
    const dx = toroidDelta(deps.camX, site.x, WORLD_WIDTH);
    const dy = toroidDelta(deps.camY, site.y, WORLD_HEIGHT);
    if (Math.abs(dx) > deps.halfW + 1 || Math.abs(dy) > deps.halfH + 1) continue;
    const surfaceY = Math.max(deps.elevationAt(site.x, site.y), -0.04) + 0.02;
    overlay.addInstance(dx + TILE_CENTER_OFFSET, dy + TILE_CENTER_OFFSET, surfaceY);
  }
};
