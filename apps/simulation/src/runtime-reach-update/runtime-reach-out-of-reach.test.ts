import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { OUT_OF_REACH_DECAY_MS, TOWN_REACH_RADIUS, type ReachAnchor } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";

import type { SimulationTileWireDelta } from "../runtime-types.js";
import {
  cancelOutOfReachDecayInAnchorDisk,
  outOfReachDecayDeadline,
  type OutOfReachDecayReachContext
} from "./runtime-reach-out-of-reach.js";

const NOW = 10_000;

const reachContext = (
  inReach: boolean,
  anchors: ReachAnchor[]
): OutOfReachDecayReachContext => ({
  isPlayerTileInReach: () => inReach,
  gatherReachAnchors: () => anchors,
  now: () => NOW
});

describe("outOfReachDecayDeadline", () => {
  it("returns no deadline for a tile inside the player's own reach", () => {
    expect(outOfReachDecayDeadline(reachContext(true, []), "p1", 10, 10)).toBeUndefined();
  });

  it("returns a deadline one decay window out for a tile in no-man's-land", () => {
    expect(outOfReachDecayDeadline(reachContext(false, []), "p1", 10, 10)).toBe(NOW + OUT_OF_REACH_DECAY_MS);
  });

  it("returns no deadline when only one other player's reach covers the tile", () => {
    // A single rival's reach is not a contest — pushing into their space
    // unsupported is exactly the case the penalty is meant to punish.
    const anchors: ReachAnchor[] = [{ x: 10, y: 10, ownerId: "p2", activatedAt: 1, kind: "TOWN" }];
    expect(outOfReachDecayDeadline(reachContext(false, anchors), "p1", 10, 10)).toBe(NOW + OUT_OF_REACH_DECAY_MS);
  });

  it("exempts a tile in an actively contested reach zone (2+ owners overlap)", () => {
    const anchors: ReachAnchor[] = [
      { x: 10, y: 10, ownerId: "p2", activatedAt: 1, kind: "TOWN" },
      { x: 10 + TOWN_REACH_RADIUS, y: 10, ownerId: "p3", activatedAt: 1, kind: "TOWN" }
    ];
    expect(outOfReachDecayDeadline(reachContext(false, anchors), "p1", 10, 10)).toBeUndefined();
  });
});

type Harness = {
  tiles: Map<string, DomainTileState>;
  events: SimulationEvent[];
  replaceTileState: ReturnType<typeof vi.fn>;
};

const cancelHarness = (tiles: Map<string, DomainTileState>): Harness => {
  const events: SimulationEvent[] = [];
  const replaceTileState = vi.fn((tileKey: string, tile: DomainTileState) => {
    tiles.set(tileKey, tile);
  });
  return { tiles, events, replaceTileState };
};

const runCancel = (h: Harness, anchor: ReachAnchor): number =>
  cancelOutOfReachDecayInAnchorDisk(
    {
      tiles: h.tiles,
      replaceTileState: h.replaceTileState,
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
      emitEvent: (event) => {
        h.events.push(event);
      }
    },
    anchor,
    "test-anchor-activation"
  );

const decayingTile = (x: number, y: number, overrides: Partial<DomainTileState> = {}): DomainTileState =>
  ({
    x,
    y,
    ownerId: "p1",
    ownershipState: "FRONTIER",
    frontierDecayAt: NOW + OUT_OF_REACH_DECAY_MS,
    frontierDecayKind: "OUT_OF_REACH",
    ...overrides
  }) as DomainTileState;

const anchor: ReachAnchor = { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" };

describe("cancelOutOfReachDecayInAnchorDisk", () => {
  it("clears the decay timer on the owner's decaying tiles inside the disk", () => {
    const tiles = new Map([["10,10", decayingTile(10, 10)]]);
    const h = cancelHarness(tiles);

    expect(runCancel(h, anchor)).toBe(1);
    const tile = tiles.get("10,10");
    expect(tile?.frontierDecayAt).toBeUndefined();
    expect(tile?.frontierDecayKind).toBeUndefined();
    expect(tile?.ownerId).toBe("p1"); // tile is kept, just no longer decaying
    expect(h.events).toHaveLength(1);
  });

  it("leaves tiles outside the anchor's disk alone", () => {
    const outsideKey = `${10 + TOWN_REACH_RADIUS + 1},10`;
    const tiles = new Map([[outsideKey, decayingTile(10 + TOWN_REACH_RADIUS + 1, 10)]]);
    const h = cancelHarness(tiles);

    expect(runCancel(h, anchor)).toBe(0);
    expect(tiles.get(outsideKey)?.frontierDecayKind).toBe("OUT_OF_REACH");
    expect(h.events).toHaveLength(0);
  });

  it("does not clear another player's decaying tile inside the disk", () => {
    const tiles = new Map([["10,10", decayingTile(10, 10, { ownerId: "p2" })]]);
    const h = cancelHarness(tiles);

    expect(runCancel(h, anchor)).toBe(0);
    expect(tiles.get("10,10")?.frontierDecayKind).toBe("OUT_OF_REACH");
  });

  it("never touches an ENCIRCLEMENT-marked tile", () => {
    const tiles = new Map([["10,10", decayingTile(10, 10, { frontierDecayKind: "ENCIRCLEMENT" })]]);
    const h = cancelHarness(tiles);

    expect(runCancel(h, anchor)).toBe(0);
    expect(tiles.get("10,10")?.frontierDecayKind).toBe("ENCIRCLEMENT");
  });

  it("ignores settled tiles", () => {
    const tiles = new Map([["10,10", decayingTile(10, 10, { ownershipState: "SETTLED" })]]);
    const h = cancelHarness(tiles);

    expect(runCancel(h, anchor)).toBe(0);
  });
});
