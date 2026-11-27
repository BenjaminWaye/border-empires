import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { isMiniMapAlliedTile, miniMapTintsOwner } from "./client-minimap-known-territory.js";
import { drawMiniMapTileLayer } from "./client-minimap-tile-layer.js";
import { makeFakeCtx } from "./client-minimap.test-helpers.js";

let drawMiniMap: typeof import("./client-minimap.js").drawMiniMap;

beforeAll(async () => {
  Object.assign(globalThis, { Image: class { decoding = ""; src = ""; } });
  ({ drawMiniMap } = await import("./client-minimap.js"));
});

const tile = (x: number, y: number, over: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...over });
const mapOf = (tiles: Tile[]): Map<string, Tile> => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
const ALLIES = new Set(["ally"]);
const colorOf = (ownerId: string): string => (ownerId === "ally" ? "#ff8800" : ownerId === "me" ? "#3366cc" : "#aa0000");
const visibility = (_x: number, _y: number, t?: Tile) => (t && !t.fogged ? ("visible" as const) : t ? ("fogged" as const) : ("unexplored" as const));

// Regression (playtest pt-explorer day 5): after allying Lantern Accord, its profile's Show on map found its land at
// (450, 301), and that land widened the overview's frame, but the overview never drew it: fogged tiles got no
// owner tint and were dimmed, so a far-off ally's remembered land was invisible.
describe("minimap: allies' known territory", () => {
  it("tints an ally's tile even under fog; a fogged rival tile stays untinted", () => {
    expect(miniMapTintsOwner({ ownerId: "ally", fogged: true }, ALLIES)).toBe(true);
    expect(miniMapTintsOwner({ ownerId: "rival", fogged: true }, ALLIES)).toBe(false);
    expect(miniMapTintsOwner({ ownerId: "rival", fogged: false }, ALLIES)).toBe(true);
    expect(miniMapTintsOwner({ fogged: false }, ALLIES)).toBe(false);
    expect(isMiniMapAlliedTile({ ownerId: "ally" }, undefined)).toBe(false);
  });

  it("tile by tile: a fogged ally tile is drawn in the ally's colour and not dimmed", () => {
    const ctx = makeFakeCtx();
    const tiles = mapOf([tile(1, 1, { ownerId: "ally", ownershipState: "SETTLED", fogged: true }), tile(3, 3, { ownerId: "rival", fogged: true })]);
    drawMiniMapTileLayer(ctx, { x0: 0, y0: 0, w: 10, h: 10 }, 100, 100, {
      tiles,
      keyFor: (x, y) => `${x},${y}`,
      terrainColorAt: () => "#228822",
      overlayColor: colorOf,
      tileVisibilityStateAt: visibility,
      withAlpha: (hex, a) => `${hex}@${a}`,
      alliedOwnerIds: ALLIES
    });
    expect(ctx.fillRectCalls).toContainEqual({ x: 10, y: 10, w: 10, h: 10, style: "#ff8800@0.72" });
    expect(ctx.fillRectCalls.some((c) => c.x === 10 && c.y === 10 && c.style === "rgba(0,0,0,0.62)")).toBe(false);
    expect(ctx.fillRectCalls.some((c) => c.style.startsWith("#aa0000"))).toBe(false);
    expect(ctx.fillRectCalls).toContainEqual({ x: 30, y: 30, w: 10, h: 10, style: "rgba(0,0,0,0.62)" });
  });

  it("zoomed far out (whole-world base): a far-off ally's fogged land is tinted and not blacked out by the fog pass", () => {
    const ctx = makeFakeCtx();
    const contentCtx = makeFakeCtx();
    const own = [tile(5, 5, { ownerId: "me", ownershipState: "SETTLED" })];
    const ally: Tile[] = [];
    for (let dx = 0; dx < 20; dx += 1) for (let dy = 0; dy < 20; dy += 1) ally.push(tile(300 + dx, 150 + dy, { ownerId: "ally", ownershipState: "SETTLED", fogged: true }));
    const w = 64, h = 64;
    drawMiniMap({
      nowMs: 10_000,
      state: { camX: 5, camY: 5, zoom: 1, replayActive: false, replayIndex: 0, replayOwnershipByTile: new Map(), fogDisabled: false, tiles: mapOf([...own, ...ally]), dockPairs: [], tilesRevision: 0 },
      canvas: { width: 200, height: 200 } as HTMLCanvasElement,
      miniMapEl: { width: w, height: h } as HTMLCanvasElement,
      miniMapCtx: ctx,
      miniMapContentEl: { width: w, height: h } as HTMLCanvasElement,
      miniMapContentCtx: contentCtx,
      miniMapBase: { width: w, height: h } as HTMLCanvasElement,
      miniMapBaseReady: true,
      miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1, tilesRevision: -1 },
      contentCache: { computedAt: 0 },
      parseKey: (key) => { const [x = 0, y = 0] = key.split(",").map(Number); return { x, y }; },
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: visibility,
      effectiveOverlayColor: colorOf,
      isDockRouteVisibleForPlayer: () => false,
      replayCurrentEvent: () => undefined,
      alliedOwnerIds: ALLIES
    });
    const tints = contentCtx.fillRectCalls.filter((c) => c.style.startsWith("rgba(255, 136, 0"));
    expect(tints.length).toBe(ally.length);
    // The fog pass leaves the ally's block alone: no fog run starts inside it.
    const block = tints.reduce((b, c) => ({ x0: Math.min(b.x0, c.x), x1: Math.max(b.x1, c.x + c.w), y0: Math.min(b.y0, c.y), y1: Math.max(b.y1, c.y + c.h) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
    const fog = contentCtx.fillRectCalls.filter((c) => c.style === "rgba(0,0,0,0.62)" || c.style === "#000000");
    const coversInside = fog.some((c) => c.y > block.y0 && c.y < block.y1 - 1 && c.x < block.x1 - 1 && c.x + c.w > block.x0 + 1);
    expect(coversInside).toBe(false);
  });
});
