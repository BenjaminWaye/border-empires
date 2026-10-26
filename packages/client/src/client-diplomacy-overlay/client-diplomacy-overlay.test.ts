import { describe, expect, it, vi } from "vitest";
import { drawTileIntelOverlays2D, tileIntelDeps2D } from "../client-map-2d-tile-intel/client-map-2d-tile-intel.js";
import type { Tile } from "../client-types.js";
import { DIPLOMACY_OVERLAY_COLORS, diplomacyOverlayKey, diplomacyStanceLookup } from "./client-diplomacy-overlay.js";

const truce = (otherPlayerId: string) => ({ otherPlayerId, otherPlayerName: otherPlayerId, startedAt: 0, endsAt: 1, createdByPlayerId: "me" });

describe("diplomacy overlay stance", () => {
  const stanceOf = diplomacyStanceLookup({ me: "me", allies: ["a"], activeTruces: [truce("t")] });

  it("classes every other owner by your standing with them", () => {
    expect(["a", "t", "x", "barbarian-1"].map(stanceOf)).toEqual(["ally", "truce", "none", "barbarian"]);
  });

  it("leaves your own and unowned land untinted", () => {
    expect(stanceOf("me")).toBeUndefined();
    expect(stanceOf(undefined)).toBeUndefined();
  });

  it("keys the 3D rebuild only while the overlay is on", () => {
    expect(diplomacyOverlayKey({ me: "me", allies: ["a"], activeTruces: [], showDiplomacyOverlay: false })).toBe("");
    expect(diplomacyOverlayKey({ me: "me", allies: ["b", "a"], activeTruces: [truce("t")], showDiplomacyOverlay: true })).toBe("on:a,b|t");
  });
});

describe("2D diplomacy tint", () => {
  const fakeCtx = () => {
    const fills: string[] = [];
    const ctx = { fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), lineWidth: 1, strokeStyle: "" } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(ctx, "fillStyle", { set: (v: string) => fills.push(v), get: () => fills.at(-1) ?? "" });
    return { ctx, fills };
  };
  const state = { tiles: new Map<string, Tile>(), me: "me", showWeakDefensibility: false, showDiplomacyOverlay: true, allies: ["a"], activeTruces: [] };
  const base = { keyFor: (x: number, y: number) => `${x},${y}`, wrapX: (x: number) => x, wrapY: (y: number) => y, terrainAt: () => "LAND" as const };
  const allyTile: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: "a" };

  it("tints an ally's tile in the ally colour", () => {
    const { ctx, fills } = fakeCtx();
    drawTileIntelOverlays2D(ctx, allyTile, "visible", 0, 0, 20, tileIntelDeps2D(state, base, false));
    expect(fills[0]).toMatch(/^rgba\(111, 191, 115, 0\.36\)$/);
    expect(DIPLOMACY_OVERLAY_COLORS.ally).toBe("#6fbf73");
  });

  it("draws nothing in 2D while the 3D renderer owns the map, or over unexplored land", () => {
    const { ctx, fills } = fakeCtx();
    drawTileIntelOverlays2D(ctx, allyTile, "visible", 0, 0, 20, tileIntelDeps2D(state, base, true));
    drawTileIntelOverlays2D(ctx, allyTile, "unexplored", 0, 0, 20, tileIntelDeps2D(state, base, false));
    expect(fills).toEqual([]);
  });
});
