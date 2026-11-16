import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { createFreshPlotTracker, townBuildPlots, townPlotsStatHtml } from "./client-hud-v2-town-plots.js";

const town: Tile = {
  x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  town: { name: "Bryn", type: "MARKET", populationTier: "TOWN" } as unknown as NonNullable<Tile["town"]>
};

const structure = (status: string): NonNullable<Tile["economicStructure"]> =>
  ({ ownerId: "me", type: "MARKET", status }) as unknown as NonNullable<Tile["economicStructure"]>;

const ring = (overrides: Record<string, Partial<Tile>> = {}): Map<string, Tile> => {
  const tiles = new Map<string, Tile>([["10,10", town]]);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (dx === 0 && dy === 0) continue;
    const key = `${10 + dx},${10 + dy}`;
    tiles.set(key, { x: 10 + dx, y: 10 + dy, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...overrides[key] });
  }
  return tiles;
};

const states = (tiles: Map<string, Tile>, queued: string[] = []) =>
  Object.fromEntries((townBuildPlots(tiles, town, "me", new Set(queued)) ?? []).map((p) => [p.key, p.state]));

describe("town build plots", () => {
  it("classifies each support plot", () => {
    const tiles = ring({
      "9,9": { economicStructure: structure("active") },
      "10,9": { economicStructure: structure("under_construction") },
      "11,9": { ownershipState: "FRONTIER" }
    });
    const s = states(tiles, ["9,10"]);
    expect(s).toMatchObject({ "9,9": "built", "10,9": "building", "11,9": "locked", "9,10": "building", "11,10": "open" });
    expect(Object.values(s).filter((v) => v === "open")).toHaveLength(4);
  });

  // Review regression: sea, mountains and rivals' tiles were counted as "needs garrison", which the player can never act on.
  it("counts only ground the player could build on", () => {
    const tiles = ring({
      "9,9": { terrain: "SEA", ownerId: undefined },
      "10,9": { terrain: "MOUNTAIN", ownerId: undefined },
      "11,9": { ownerId: "rival" },
      "9,10": { ownerId: undefined, ownershipState: undefined }
    } as unknown as Record<string, Partial<Tile>>);
    const s = states(tiles);
    expect(s["9,9"]).toBeUndefined();
    expect(s["10,9"]).toBeUndefined();
    expect(s["11,9"]).toBeUndefined();
    expect(s["9,10"]).toBe("locked");
    expect(Object.keys(s)).toHaveLength(5);
  });

  // Review regression: a plot already being garrisoned read "garrison this tile", inviting a second garrison.
  it("shows a plot being garrisoned as in progress, not as needing a garrison", () => {
    const tiles = ring({ "11,9": { ownershipState: "FRONTIER" }, "11,10": { ownershipState: "FRONTIER", optimisticPending: "settle" } });
    expect(states(tiles, ["11,9"])).toMatchObject({ "11,9": "building", "11,10": "building" });
    expect(states(tiles)["11,9"]).toBe("locked");
  });

  it("has no plots for a Settlement", () => {
    const settlement = { ...town, town: { ...town.town!, populationTier: "SETTLEMENT" as const } };
    expect(townBuildPlots(ring(), settlement, "me", new Set())).toBeUndefined();
    expect(townPlotsStatHtml(undefined)).toContain("—");
  });

  it("highlights the plot a Place press just filled, then lets it fade", () => {
    const track = createFreshPlotTracker();
    const before = townBuildPlots(ring(), town, "me", new Set())!;
    expect(track("10,10", before, 0).size).toBe(0);
    const after = townBuildPlots(ring(), town, "me", new Set(["9,9"]))!;
    expect([...track("10,10", after, 100)]).toEqual(["9,9"]);
    // Still highlighted on the re-renders that follow, then cleared.
    expect([...track("10,10", after, 1_000)]).toEqual(["9,9"]);
    expect(track("10,10", after, 4_000).size).toBe(0);
    const html = townPlotsStatHtml(after, new Set(["9,9"]));
    expect(html).toContain("7 open");
    expect(html).toContain("v2t-plot-new");
  });

  it("reads Full once every plot is taken", () => {
    const all = ["9,9", "10,9", "11,9", "9,10", "11,10", "9,11", "10,11", "11,11"];
    expect(townPlotsStatHtml(townBuildPlots(ring(), town, "me", new Set(all)))).toContain(">Full<");
  });

  // Playtest day 1: a town whose plots all still needed a garrison read "Full", so the Manufactory step looked impossible.
  it("does not read Full while plots still need a garrison", () => {
    const frontier = Object.fromEntries(["9,9", "10,9", "11,9", "9,10", "11,10", "9,11", "10,11", "11,11"].map((k) => [k, { ownershipState: "FRONTIER" as const }]));
    const html = townPlotsStatHtml(townBuildPlots(ring(frontier), town, "me", new Set()));
    expect(html).not.toContain(">Full<");
    expect(html).toContain(">0 open<");
    expect(html).toContain("8 to garrison");
  });
});
