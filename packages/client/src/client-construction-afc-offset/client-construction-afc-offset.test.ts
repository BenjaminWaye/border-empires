import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { afcOffsetForSite, constructionSiteForRebuild } from "./client-construction-afc-offset.js";

const HOUR = 3_600_000;
const afcTile = (x: number, y: number, ownerId: string, activatedAt = 1): Tile =>
  ({ x, y, terrain: "LAND", ownerId, afc: { ownerId, status: "active", activatedAt } }) as unknown as Tile;
const tilesOf = (...tiles: Tile[]): Map<string, Tile> => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

describe("afcOffsetForSite", () => {
  it("points from the site to its owner's AFC", () => {
    const state = { tiles: tilesOf(afcTile(110, 40, "me")) };
    expect(afcOffsetForSite(state, { x: 100, y: 50, ownerId: "me" }, 1)).toEqual({ dx: 10, dy: -10 });
  });

  it("goes the short way across the world seam", () => {
    const state = { tiles: tilesOf(afcTile(2, WORLD_HEIGHT - 1, "me")) };
    const offset = afcOffsetForSite(state, { x: WORLD_WIDTH - 3, y: 1, ownerId: "me" }, 2)!;
    expect(offset).toEqual({ dx: 5, dy: -2 });
  });

  it("uses the owner's own AFC, not the viewer's: other players' sites fly from their AFC when it is loaded", () => {
    const state = { tiles: tilesOf(afcTile(10, 10, "me"), afcTile(60, 60, "rival")) };
    expect(afcOffsetForSite(state, { x: 50, y: 50, ownerId: "rival" }, 3)).toEqual({ dx: 10, dy: 10 });
    expect(afcOffsetForSite(state, { x: 50, y: 50, ownerId: "me" }, 3)).toEqual({ dx: -40, dy: -40 });
  });

  it("picks the home AFC by earliest activation when an owner has several", () => {
    const state = { tiles: tilesOf(afcTile(30, 30, "me", 500), afcTile(80, 80, "me", 100)) };
    expect(afcOffsetForSite(state, { x: 70, y: 70, ownerId: "me" }, 4)).toEqual({ dx: 10, dy: 10 });
  });

  it("returns undefined when the owner's AFC is not known (no stand-in)", () => {
    expect(afcOffsetForSite({ tiles: tilesOf(afcTile(1, 1, "someone-else")) }, { x: 5, y: 5, ownerId: "me" }, 5)).toBeUndefined();
    expect(afcOffsetForSite({ tiles: new Map() }, { x: 5, y: 5, ownerId: "me" }, 6)).toBeUndefined();
  });

  it("scans the map once per rebuild, however many sites and owners it asks about", () => {
    let scans = 0;
    const counting = tilesOf(afcTile(10, 10, "me"), afcTile(60, 60, "rival-a"), afcTile(90, 20, "rival-b"));
    const originalEntries = counting[Symbol.iterator].bind(counting);
    counting[Symbol.iterator] = () => {
      scans += 1;
      return originalEntries();
    };
    const state = { tiles: counting };
    for (let i = 0; i < 20; i += 1) {
      for (const ownerId of ["me", "rival-a", "rival-b", "nobody"]) afcOffsetForSite(state, { x: 20 + i, y: 5, ownerId }, 7);
    }
    expect(scans).toBe(1); // one pass for all four owners and 80 lookups
    afcOffsetForSite(state, { x: 1, y: 1, ownerId: "me" }, 8); // next rebuild rescans
    expect(scans).toBe(2);
  });

  it("does not leak a cached AFC between different tile maps that share a rebuild stamp", () => {
    expect(afcOffsetForSite({ tiles: tilesOf(afcTile(10, 10, "me")) }, { x: 0, y: 0, ownerId: "me" }, 9)).toEqual({ dx: 10, dy: 10 });
    expect(afcOffsetForSite({ tiles: new Map() }, { x: 0, y: 0, ownerId: "me" }, 9)).toBeUndefined();
  });
});

describe("constructionSiteForRebuild", () => {
  const building = (): Tile =>
    ({ x: 50, y: 50, terrain: "LAND", ownerId: "me", economicStructure: { ownerId: "me", type: "FARMSTEAD", status: "under_construction", startedAt: Date.now() - HOUR, completesAt: Date.now() + 7 * HOUR } }) as unknown as Tile;

  it("returns the site with the AFC offset attached", () => {
    const site = constructionSiteForRebuild({ tiles: tilesOf(afcTile(44, 47, "me")) }, building(), "economicStructure", 10);
    expect(site).toMatchObject({ field: "economicStructure", afcOffset: { dx: -6, dy: -3 } });
  });

  it("returns a site with no offset when no AFC is known, and nothing for a finished structure", () => {
    expect(constructionSiteForRebuild({ tiles: new Map() }, building(), "economicStructure", 11)?.afcOffset).toBeUndefined();
    const done = { x: 1, y: 1, terrain: "LAND", economicStructure: { ownerId: "me", type: "FARMSTEAD", status: "active" } } as unknown as Tile;
    expect(constructionSiteForRebuild({ tiles: new Map() }, done, "economicStructure", 12)).toBeUndefined();
  });
});
