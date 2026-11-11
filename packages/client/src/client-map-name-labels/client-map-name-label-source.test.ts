import { describe, expect, it, vi } from "vitest";

const playerPath = { text: "MILO", points: [{ x: 0, y: 0 }, { x: 8, y: 0 }], heightTiles: 2, spanTiles: 10 };
vi.mock("./client-map-name-placements.js", () => ({
  createNamePlacementCache: () => ({ current: () => ({ version: 1, players: [{ ownerId: "p1", path: playerPath }], islands: [] }) }),
  islandLabelPath: () => playerPath
}));

const { createMapNameLabelSource } = await import("./client-map-name-labels.js");

const sourceAtZoom = (zoom: number) =>
  createMapNameLabelSource({
    state: { tiles: new Map(), tilesRevision: 0, zoom, islandLabels: [], me: "me", meName: "Me", playerNames: new Map(), leaderboard: undefined } as never,
    isExploredAt: () => true,
    wrapX: (x) => x,
    wrapY: (y) => y
  });

describe("createMapNameLabelSource realm names", () => {
  it("draws a fully faded-in realm name in solid ink with a strong halo, so it reads over any territory colour", () => {
    // Realm names used to draw at 0.82 ink alpha with a 0.38 halo, too faint over the owner tint.
    const [label] = sourceAtZoom(8).current(0).labels;
    expect(label?.kind).toBe("player");
    expect(label?.style.alpha).toBe(1);
    const haloAlpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(label?.style.stroke ?? "")?.[1]);
    expect(haloAlpha).toBeGreaterThanOrEqual(0.6);
  });
});
