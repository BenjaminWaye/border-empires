import { ISLAND_NAME_FADE_MS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { buildIslandLabels as buildIslandLabelSet, islandLabelsForViewer, islandLabelsSignature } from "./island-labels.js";
import { buildIslandRegistry } from "./island-registry.js";
import type { IslandNamesWorld } from "./island-names-world.js";

const buildIslandLabels = (...args: Parameters<typeof buildIslandLabelSet>) => [...buildIslandLabelSet(...args).labels];
import { garrison, makePlayer, tilesFromRows } from "./island-names.test-helpers.js";

// One 5x2 island (10 LAND tiles) in a 7x4 world.
const setup = () => {
  const tiles = tilesFromRows(["LLLLL..", "LLLLL..", ".......", "......."]);
  const registry = buildIslandRegistry(tiles, 7, 4);
  const world: IslandNamesWorld = { registry, defaultNameFor: () => "Brassford Isle" };
  const namer = makePlayer("p1", { islandNames: [{ islandId: "0,0", name: "Isle of Waypoint", namedAt: 1 }] });
  const rival = makePlayer("p2");
  const players = new Map([[namer.id, namer], [rival.id, rival]]);
  return { tiles, world, namer, rival, players };
};

describe("buildIslandLabels", () => {
  it("shows the generated name for an unnamed island", () => {
    const { tiles, world, rival } = setup();
    const [label] = buildIslandLabels(world, tiles, new Map([[rival.id, rival]]), 0);
    expect(label).toMatchObject({ id: "0,0", name: "Brassford Isle", status: "default" });
    expect(label!.namerId).toBeUndefined();
  });

  it("keeps the chosen name as held, then contested, while the namer holds at least 60%", () => {
    const { tiles, world, players } = setup();
    garrison(tiles, "p1");
    expect(buildIslandLabels(world, tiles, players, 10)[0]).toMatchObject({ name: "Isle of Waypoint", status: "held", namerId: "p1" });
    garrison(tiles, "p2", (tile) => tile.x === 4); // rival takes 2 of 10
    expect(buildIslandLabels(world, tiles, players, 20)[0]).toMatchObject({ name: "Isle of Waypoint", status: "contested" });
  });

  it("fades below 60%, recovers if the namer climbs back, and reverts once the fade runs out", () => {
    const { tiles, world, namer, players } = setup();
    garrison(tiles, "p1");
    garrison(tiles, "p2", (tile) => tile.x >= 3); // namer keeps 6 of 10... then 4 of 10
    expect(buildIslandLabels(world, tiles, players, 100)[0]).toMatchObject({ status: "contested" });
    garrison(tiles, "p2", (tile) => tile.x >= 2);
    const fading = buildIslandLabels(world, tiles, players, 100)[0]!;
    expect(fading).toMatchObject({ name: "Isle of Waypoint", status: "fading", revertsAt: 100 + ISLAND_NAME_FADE_MS });
    expect(namer.islandNames?.[0]?.fadingSince).toBe(100);

    // Namer retakes the island: timer cleared.
    garrison(tiles, "p1");
    expect(buildIslandLabels(world, tiles, players, 200)[0]).toMatchObject({ status: "held" });
    expect(namer.islandNames?.[0]?.fadingSince).toBeUndefined();

    // Loses it again and never comes back: the name reverts after the fade.
    garrison(tiles, "p2");
    buildIslandLabels(world, tiles, players, 300);
    const reverted = buildIslandLabels(world, tiles, players, 300 + ISLAND_NAME_FADE_MS)[0]!;
    expect(reverted).toMatchObject({ name: "Brassford Isle", status: "default" });
    expect(namer.islandNames).toBeUndefined();
  });

  it("drops a claim on an island that no longer exists", () => {
    const { tiles, world, namer, players } = setup();
    namer.islandNames = [{ islandId: "9,9", name: "Lost Isle", namedAt: 1 }];
    buildIslandLabels(world, tiles, players, 0);
    expect(namer.islandNames).toBeUndefined();
  });
});

describe("islandLabelsSignature", () => {
  it("only changes when a chosen name or its state does", () => {
    const { tiles, world, players } = setup();
    garrison(tiles, "p1");
    const held = islandLabelsSignature(buildIslandLabels(world, tiles, players, 0));
    expect(islandLabelsSignature(buildIslandLabels(world, tiles, players, 5))).toBe(held);
    garrison(tiles, "p2", (tile) => tile.x === 0);
    expect(islandLabelsSignature(buildIslandLabels(world, tiles, players, 10))).not.toBe(held);
  });
});

describe("islandLabelsForViewer", () => {
  it("shows a chosen name only to the namer and players holding land on the island", () => {
    const { tiles, world, players } = setup();
    garrison(tiles, "p1", (tile) => tile.x !== 4);
    garrison(tiles, "p2", (tile) => tile.x === 4);
    players.set("p3", makePlayer("p3"));
    const set = buildIslandLabelSet(world, tiles, players, 0);
    expect(islandLabelsForViewer(set, "p1")[0]).toMatchObject({ name: "Isle of Waypoint", status: "contested", namerId: "p1" });
    expect(islandLabelsForViewer(set, "p2")[0]).toMatchObject({ name: "Isle of Waypoint", status: "contested" });
    const outsider = islandLabelsForViewer(set, "p3")[0]!;
    expect(outsider).toMatchObject({ name: "Brassford Isle", status: "default" });
    expect(outsider.namerId).toBeUndefined();
  });
});
