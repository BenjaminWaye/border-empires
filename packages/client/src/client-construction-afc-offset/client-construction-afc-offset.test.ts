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
    const state = { tilesRevision: 0, tiles: tilesOf(afcTile(110, 40, "me")) };
    expect(afcOffsetForSite(state, { x: 100, y: 50, ownerId: "me" }, 1)).toEqual({ dx: 10, dy: -10 });
  });

  it("goes the short way across the world seam", () => {
    const state = { tilesRevision: 0, tiles: tilesOf(afcTile(2, WORLD_HEIGHT - 1, "me")) };
    const offset = afcOffsetForSite(state, { x: WORLD_WIDTH - 3, y: 1, ownerId: "me" }, 2)!;
    expect(offset).toEqual({ dx: 5, dy: -2 });
  });

  it("uses the owner's own AFC, not the viewer's: other players' sites fly from their AFC when it is loaded", () => {
    const state = { tilesRevision: 0, tiles: tilesOf(afcTile(10, 10, "me"), afcTile(60, 60, "rival")) };
    expect(afcOffsetForSite(state, { x: 50, y: 50, ownerId: "rival" }, 3)).toEqual({ dx: 10, dy: 10 });
    expect(afcOffsetForSite(state, { x: 50, y: 50, ownerId: "me" }, 3)).toEqual({ dx: -40, dy: -40 });
  });

  it("picks the home AFC by earliest activation when an owner has several", () => {
    const state = { tilesRevision: 0, tiles: tilesOf(afcTile(30, 30, "me", 500), afcTile(80, 80, "me", 100)) };
    expect(afcOffsetForSite(state, { x: 70, y: 70, ownerId: "me" }, 4)).toEqual({ dx: 10, dy: 10 });
  });

  it("returns undefined when the owner's AFC is not known (no stand-in)", () => {
    expect(afcOffsetForSite({ tilesRevision: 0, tiles: tilesOf(afcTile(1, 1, "someone-else")) }, { x: 5, y: 5, ownerId: "me" }, 5)).toBeUndefined();
    expect(afcOffsetForSite({ tilesRevision: 0, tiles: new Map() }, { x: 5, y: 5, ownerId: "me" }, 6)).toBeUndefined();
  });

  const countingState = (...tiles: Tile[]) => {
    const counter = { scans: 0 };
    const map = tilesOf(...tiles);
    const originalEntries = map[Symbol.iterator].bind(map);
    map[Symbol.iterator] = () => {
      counter.scans += 1;
      return originalEntries();
    };
    return { counter, state: { tilesRevision: 0, tiles: map } };
  };

  // Regression: every terrain rebuild (camera pans included) rescanned every loaded tile.
  it("does not rescan the map on a rebuild when no tile changed", () => {
    const { counter, state } = countingState(afcTile(10, 10, "me"), afcTile(60, 60, "rival-a"), afcTile(90, 20, "rival-b"));
    for (let rebuild = 0; rebuild < 50; rebuild += 1) {
      for (const ownerId of ["me", "rival-a", "rival-b", "nobody"]) afcOffsetForSite(state, { x: 20, y: 5, ownerId }, 1_000 + rebuild * 16);
    }
    expect(counter.scans).toBe(1);
  });

  it("rescans after tiles changed, but at most once per interval", () => {
    const { counter, state } = countingState(afcTile(10, 10, "me"));
    afcOffsetForSite(state, { x: 0, y: 0, ownerId: "me" }, 0);
    state.tilesRevision += 1;
    afcOffsetForSite(state, { x: 0, y: 0, ownerId: "me" }, 5_000);
    expect(counter.scans).toBe(1);
    state.tiles.set("40,40", afcTile(40, 40, "rival"));
    expect(afcOffsetForSite(state, { x: 0, y: 0, ownerId: "rival" }, 5_000)).toBeUndefined(); // not picked up yet
    expect(afcOffsetForSite(state, { x: 0, y: 0, ownerId: "rival" }, 10_000)).toEqual({ dx: 40, dy: 40 });
    expect(counter.scans).toBe(2);
  });

  it("drops a cached AFC at once when its tile no longer holds it", () => {
    const { state } = countingState(afcTile(10, 10, "me", 100), afcTile(30, 30, "me", 200));
    expect(afcOffsetForSite(state, { x: 0, y: 0, ownerId: "me" }, 0)).toEqual({ dx: 10, dy: 10 });
    state.tiles.set("10,10", { ...afcTile(10, 10, "rival"), afc: undefined } as unknown as Tile);
    expect(afcOffsetForSite(state, { x: 0, y: 0, ownerId: "me" }, 1)).toEqual({ dx: 30, dy: 30 });
  });

  it("does not leak a cached AFC between different tile maps that share a rebuild stamp", () => {
    expect(afcOffsetForSite({ tilesRevision: 0, tiles: tilesOf(afcTile(10, 10, "me")) }, { x: 0, y: 0, ownerId: "me" }, 9)).toEqual({ dx: 10, dy: 10 });
    expect(afcOffsetForSite({ tilesRevision: 0, tiles: new Map() }, { x: 0, y: 0, ownerId: "me" }, 9)).toBeUndefined();
  });
});

describe("constructionSiteForRebuild", () => {
  const building = (): Tile =>
    ({ x: 50, y: 50, terrain: "LAND", ownerId: "me", economicStructure: { ownerId: "me", type: "FARMSTEAD", status: "under_construction", startedAt: Date.now() - HOUR, completesAt: Date.now() + 7 * HOUR } }) as unknown as Tile;

  it("returns the site with the AFC offset attached", () => {
    const site = constructionSiteForRebuild({ tilesRevision: 0, tiles: tilesOf(afcTile(44, 47, "me")) }, building(), "economicStructure", 10);
    expect(site).toMatchObject({ field: "economicStructure", afcOffset: { dx: -6, dy: -3 } });
  });

  it("returns a site with no offset when no AFC is known, and nothing for a finished structure", () => {
    expect(constructionSiteForRebuild({ tilesRevision: 0, tiles: new Map() }, building(), "economicStructure", 11)?.afcOffset).toBeUndefined();
    const done = { x: 1, y: 1, terrain: "LAND", economicStructure: { ownerId: "me", type: "FARMSTEAD", status: "active" } } as unknown as Tile;
    expect(constructionSiteForRebuild({ tilesRevision: 0, tiles: new Map() }, done, "economicStructure", 12)).toBeUndefined();
  });
});
