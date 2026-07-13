import { describe, expect, it, vi } from "vitest";
import { emitTownCaptureIfCaptured, type PreviousTileSnapshot } from "./client-town-capture-detect.js";
import type { TownCaptureInfo } from "./client-town-capture.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const townTile = (overrides: Partial<Tile> = {}): Tile =>
  ({
    x: 10,
    y: 20,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "FRONTIER",
    town: {
      name: "Ironwick",
      type: "MARKET",
      baseGoldPerMinute: 2,
      supportCurrent: 0,
      supportMax: 0,
      goldPerMinute: 0,
      cap: 100,
      isFed: false,
      population: 8_000,
      maxPopulation: 100_000,
      populationTier: "CITY",
      connectedTownCount: 0,
      connectedTownBonus: 0,
      hasMarket: true,
      marketActive: false,
      hasGranary: false,
      granaryActive: false,
      hasBank: false,
      bankActive: false
    },
    ...overrides
  }) as Tile;

describe("emitTownCaptureIfCaptured", () => {
  it("shows the capture overlay when a town flips from an enemy owner to the local player", () => {
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const tiles = new Map<string, Tile>([["10,20", townTile()]]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [{ x: 10, y: 20 }],
        previousTileByKey: new Map([["10,20", { ownerId: "enemy-1" }]]),
        tiles,
        me: "me",
        meName: "Iron Dominion",
        keyFor,
        onJumpToTown: vi.fn()
      },
      { showOverlay }
    );

    expect(showOverlay).toHaveBeenCalledTimes(1);
    const info = showOverlay.mock.calls[0]![0];
    expect(info.x).toBe(10);
    expect(info.y).toBe(20);
    expect(info.townName).toBe("Ironwick");
    expect(info.populationTier).toBe("CITY");
    expect(info.population).toBe(8_000);
    expect(info.maxPopulation).toBe(100_000);
    expect(info.empireName).toBe("Iron Dominion");
    expect(info.ownedTownCount).toBe(0);
    expect(info.destroyed).toBe(false);
  });

  it("falls back to 'Your Empire' when the local player has no display name yet", () => {
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const tiles = new Map<string, Tile>([["10,20", townTile()]]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [{ x: 10, y: 20 }],
        previousTileByKey: new Map([["10,20", { ownerId: "enemy-1" }]]),
        tiles,
        me: "me",
        meName: "",
        keyFor,
        onJumpToTown: vi.fn()
      },
      { showOverlay }
    );
    expect(showOverlay.mock.calls[0]![0].empireName).toBe("Your Empire");
  });

  it("invokes onJumpToTown with the captured tile's coordinates", () => {
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const onJumpToTown = vi.fn();
    const tiles = new Map<string, Tile>([["10,20", townTile()]]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [{ x: 10, y: 20 }],
        previousTileByKey: new Map([["10,20", { ownerId: "enemy-1" }]]),
        tiles,
        me: "me",
        meName: "Iron Dominion",
        keyFor,
        onJumpToTown
      },
      { showOverlay }
    );
    showOverlay.mock.calls[0]![0].onJumpToTown();
    expect(onJumpToTown).toHaveBeenCalledWith(10, 20);
  });

  it("counts the player's other settled towns, excluding the just-captured tile", () => {
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const tiles = new Map<string, Tile>([
      ["10,20", townTile()],
      ["1,1", townTile({ x: 1, y: 1, ownershipState: "SETTLED" })],
      ["2,2", townTile({ x: 2, y: 2, ownershipState: "SETTLED" })],
      // Not settled yet — should not count.
      ["3,3", townTile({ x: 3, y: 3, ownershipState: "FRONTIER" })],
      // Owned by someone else — should not count.
      ["4,4", townTile({ x: 4, y: 4, ownerId: "enemy-2", ownershipState: "SETTLED" })]
    ]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [{ x: 10, y: 20 }],
        previousTileByKey: new Map([["10,20", { ownerId: "enemy-1" }]]),
        tiles,
        me: "me",
        meName: "Iron Dominion",
        keyFor,
        onJumpToTown: vi.fn()
      },
      { showOverlay }
    );
    expect(showOverlay.mock.calls[0]![0].ownedTownCount).toBe(2);
  });

  it("does not trigger for a newly revealed tile with no previously cached tile", () => {
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const tiles = new Map<string, Tile>([["10,20", townTile()]]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [{ x: 10, y: 20 }],
        previousTileByKey: new Map(),
        tiles,
        me: "me",
        meName: "Iron Dominion",
        keyFor,
        onJumpToTown: vi.fn()
      },
      { showOverlay }
    );
    expect(showOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger when the tile already belonged to the local player", () => {
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const tiles = new Map<string, Tile>([["10,20", townTile()]]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [{ x: 10, y: 20 }],
        previousTileByKey: new Map([["10,20", { ownerId: "me" }]]),
        tiles,
        me: "me",
        meName: "Iron Dominion",
        keyFor,
        onJumpToTown: vi.fn()
      },
      { showOverlay }
    );
    expect(showOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger for a captured tile that had no town before or after", () => {
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const { town: _omitTown, ...noTownTile } = townTile();
    const tiles = new Map<string, Tile>([["10,20", noTownTile as Tile]]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [{ x: 10, y: 20 }],
        previousTileByKey: new Map([["10,20", { ownerId: "enemy-1" }]]),
        tiles,
        me: "me",
        meName: "Iron Dominion",
        keyFor,
        onJumpToTown: vi.fn()
      },
      { showOverlay }
    );
    expect(showOverlay).not.toHaveBeenCalled();
  });

  it("only announces the first captured town in a multi-tile batch", () => {
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const tiles = new Map<string, Tile>([
      ["10,20", townTile()],
      ["30,40", townTile({ x: 30, y: 40, town: { ...townTile().town!, name: "Brassumstead" } })]
    ]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [
          { x: 10, y: 20 },
          { x: 30, y: 40 }
        ],
        previousTileByKey: new Map([
          ["10,20", { ownerId: "enemy-1" }],
          ["30,40", { ownerId: "enemy-1" }]
        ]),
        tiles,
        me: "me",
        meName: "Iron Dominion",
        keyFor,
        onJumpToTown: vi.fn()
      },
      { showOverlay }
    );
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(showOverlay.mock.calls[0]![0].townName).toBe("Ironwick");
  });

  it("still shows a destroyed-settlement overlay when combat wipes a SETTLEMENT-tier town on capture", () => {
    // SETTLEMENT-tier towns don't survive an ATTACK capture server-side (see
    // apps/simulation/src/runtime-capture-aftermath.ts) — the tile ends up with
    // no `.town` at all, even though a real capture just happened.
    const showOverlay = vi.fn<(info: TownCaptureInfo) => void>();
    const { town: _omitTown, ...capturedTileWithNoTown } = townTile({ ownershipState: "FRONTIER" });
    const tiles = new Map<string, Tile>([["10,20", capturedTileWithNoTown as Tile]]);
    const previousTown: NonNullable<Tile["town"]> = {
      name: "Mudflat Camp",
      type: "MARKET",
      baseGoldPerMinute: 1,
      supportCurrent: 0,
      supportMax: 0,
      goldPerMinute: 0,
      cap: 100,
      isFed: false,
      population: 900,
      maxPopulation: 1_500,
      populationTier: "SETTLEMENT",
      connectedTownCount: 0,
      connectedTownBonus: 0,
      hasMarket: false,
      marketActive: false,
      hasGranary: false,
      granaryActive: false,
      hasBank: false,
      bankActive: false
    };
    const previousTileByKey = new Map<string, PreviousTileSnapshot>([["10,20", { ownerId: "enemy-1", town: previousTown }]]);
    emitTownCaptureIfCaptured(
      {
        tileUpdates: [{ x: 10, y: 20 }],
        previousTileByKey,
        tiles,
        me: "me",
        meName: "Iron Dominion",
        keyFor,
        onJumpToTown: vi.fn()
      },
      { showOverlay }
    );

    expect(showOverlay).toHaveBeenCalledTimes(1);
    const info = showOverlay.mock.calls[0]![0];
    expect(info.destroyed).toBe(true);
    expect(info.townName).toBe("Mudflat Camp");
    expect(info.populationTier).toBe("SETTLEMENT");
    expect(info.population).toBe(900);
  });
});
