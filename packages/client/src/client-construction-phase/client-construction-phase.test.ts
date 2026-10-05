import { structureBuildDurationMs } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  CONSTRUCTION_CRATES_PER_PHASE,
  CONSTRUCTION_PHASES,
  constructionCratesAt,
  constructionSiteForTile,
  crewSizeForManpower
} from "./client-construction-phase.js";

const HOUR = 3_600_000;
const baseTile = (): Tile => ({ x: 1, y: 1, terrain: "LAND" }) as Tile;
const mintworks = (over: Record<string, unknown>): Tile =>
  ({ ...baseTile(), economicStructure: { ownerId: "me", type: "MINTWORKS", status: "under_construction", ...over } }) as Tile;

describe("constructionSiteForTile", () => {
  it("returns nothing for a tile with no in-flight structure", () => {
    expect(constructionSiteForTile(baseTile(), 0)).toBeUndefined();
    const active = { ...baseTile(), economicStructure: { ownerId: "me", type: "MINTWORKS", status: "active" } } as Tile;
    expect(constructionSiteForTile(active, 0)).toBeUndefined();
  });

  it("uses startedAt..completesAt so a multi-hour build advances one phase at a time", () => {
    const tile = mintworks({ startedAt: 0, completesAt: 8 * HOUR });
    const at = (hours: number) => constructionSiteForTile(tile, hours * HOUR)!;
    expect(at(0)).toMatchObject({ phase: 0, visibleBands: 1, stalled: false });
    expect(at(1.9).phase).toBe(0);
    expect(at(2.0)).toMatchObject({ phase: 1, visibleBands: 2 });
    expect(at(5.9)).toMatchObject({ phase: 2, visibleBands: 3 });
    expect(at(7.99)).toMatchObject({ phase: CONSTRUCTION_PHASES - 1, visibleBands: CONSTRUCTION_PHASES });
  });

  it("carries the construction window so per-frame animation can follow the clock", () => {
    const site = constructionSiteForTile(mintworks({ startedAt: 1_000, completesAt: 9_000 }), 2_000)!;
    expect(site).toMatchObject({ startedAtMs: 1_000, completesAtMs: 9_000 });
  });

  it("reports the next phase boundary and clears it once the window elapses", () => {
    const tile = mintworks({ startedAt: 1_000, completesAt: 1_000 + 8 * HOUR });
    expect(constructionSiteForTile(tile, 1_000)!.nextPhaseAtMs).toBe(1_000 + 2 * HOUR);
    expect(constructionSiteForTile(tile, 1_000 + 2 * HOUR + 5)!.nextPhaseAtMs).toBe(1_000 + 4 * HOUR);
    const done = constructionSiteForTile(tile, 1_000 + 8 * HOUR + 1)!;
    expect(done.nextPhaseAtMs).toBeUndefined();
    expect(done.stalled).toBe(true);
    expect(done.fraction).toBe(1);
  });

  it("plays removal in reverse: bands come down and crates pile up", () => {
    const tile = mintworks({ status: "removing", startedAt: 0, completesAt: 8 * HOUR });
    expect(constructionSiteForTile(tile, 0)).toMatchObject({ direction: "remove", visibleBands: CONSTRUCTION_PHASES });
    expect(constructionSiteForTile(tile, 7.9 * HOUR)).toMatchObject({ visibleBands: 1 });
  });

  it("falls back to the estimated duration for records without startedAt", () => {
    const duration = structureBuildDurationMs("MINTWORKS");
    const tile = mintworks({ completesAt: 10_000 + duration });
    const site = constructionSiteForTile(tile, 10_000 + duration / 2)!;
    expect(site.fraction).toBeCloseTo(0.5, 5);
    expect(site.phase).toBe(2);
  });

  it("clamps a clock that is behind startedAt to the first phase", () => {
    const tile = mintworks({ startedAt: 5 * HOUR, completesAt: 9 * HOUR });
    expect(constructionSiteForTile(tile, 0)).toMatchObject({ fraction: 0, phase: 0, stalled: false });
  });

  it("recognises fort, observatory and siege records too", () => {
    const fort = { ...baseTile(), fort: { ownerId: "me", status: "under_construction", variant: "FORT", startedAt: 0, completesAt: HOUR } } as Tile;
    expect(constructionSiteForTile(fort, 0)).toMatchObject({ field: "fort", structureType: "FORT" });
    const obs = { ...baseTile(), observatory: { ownerId: "me", status: "under_construction", startedAt: 0, completesAt: HOUR } } as Tile;
    expect(constructionSiteForTile(obs, 0)).toMatchObject({ field: "observatory" });
    const siege = { ...baseTile(), siegeOutpost: { ownerId: "me", status: "removing", variant: "SIEGE_TOWER", startedAt: 0, completesAt: HOUR } } as Tile;
    expect(constructionSiteForTile(siege, 0)).toMatchObject({ field: "siegeOutpost", direction: "remove" });
  });
});

describe("constructionSiteForTile field filter", () => {
  it("ignores another slot's in-flight record when asked for one structure", () => {
    const tile = {
      ...baseTile(),
      fort: { ownerId: "me", status: "under_construction", variant: "FORT", startedAt: 0, completesAt: HOUR },
      economicStructure: { ownerId: "me", type: "MINTWORKS", status: "active" }
    } as Tile;
    expect(constructionSiteForTile(tile, 0)).toMatchObject({ field: "fort" });
    expect(constructionSiteForTile(tile, 0, "economicStructure")).toBeUndefined();
    expect(constructionSiteForTile(tile, 0, "fort")).toMatchObject({ field: "fort" });
  });

  it("finds the economic structure's own record even when a fort is also in flight", () => {
    const tile = {
      ...baseTile(),
      fort: { ownerId: "me", status: "under_construction", variant: "FORT", startedAt: 0, completesAt: HOUR },
      economicStructure: { ownerId: "me", type: "MINTWORKS", status: "under_construction", startedAt: 0, completesAt: 8 * HOUR }
    } as Tile;
    expect(constructionSiteForTile(tile, 0, "economicStructure")).toMatchObject({ field: "economicStructure", structureType: "MINTWORKS" });
  });
});

describe("constructionCratesAt", () => {
  it("consumes one crate per step within a phase and restocks at the next phase (build)", () => {
    // 16h window => one step per hour, four steps per phase.
    const crates = [0, 1, 2, 3, 4].map((h) => constructionCratesAt("build", 0, 16 * HOUR, h * HOUR + 1));
    expect(crates).toEqual([CONSTRUCTION_CRATES_PER_PHASE, 3, 2, 1, CONSTRUCTION_CRATES_PER_PHASE]);
  });

  it("piles crates up as parts are packed during removal", () => {
    const crates = [0, 1, 2, 3, 4].map((h) => constructionCratesAt("remove", 0, 16 * HOUR, h * HOUR + 1));
    expect(crates).toEqual([1, 2, 3, 4, 1]);
  });

  it("stays in range for a stalled (overdue) build", () => {
    expect(constructionCratesAt("build", 0, HOUR, 100 * HOUR)).toBe(1);
  });
});

describe("crewSizeForManpower", () => {
  it("scales with manpower and stays within 2..6 figures", () => {
    expect(crewSizeForManpower(0)).toBe(2);
    expect(crewSizeForManpower(50)).toBe(2);
    expect(crewSizeForManpower(100)).toBe(4);
    expect(crewSizeForManpower(10_000)).toBe(6);
  });
});
