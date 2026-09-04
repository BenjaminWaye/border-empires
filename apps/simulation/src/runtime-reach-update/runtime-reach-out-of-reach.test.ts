import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { OUT_OF_REACH_DECAY_MS, TOWN_REACH_RADIUS, type ReachAnchor } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";

import type { SimulationTileWireDelta } from "../runtime-types.js";
import {
  cancelOutOfReachDecayInAnchorDisk,
  outOfReachDecayDeadline,
  stampOutOfReachDecayInAnchorDisk,
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

  it("also clears another player's decaying tile inside the disk — this anchor's reach now contests it", () => {
    // p2's tile sits inside p1's anchor's disk (e.g. an ATTACK capture,
    // never reach-gated). p1's anchor activating means the spot is now
    // covered by live reach, the same "no longer genuine no-man's-land"
    // exemption outOfReachDecayDeadline/tickOutOfReachDecay grant elsewhere
    // -- it should not keep visibly decaying (and pulsing) until expiry.
    const tiles = new Map([["10,10", decayingTile(10, 10, { ownerId: "p2" })]]);
    const h = cancelHarness(tiles);

    expect(runCancel(h, anchor)).toBe(1);
    const tile = tiles.get("10,10");
    expect(tile?.frontierDecayAt).toBeUndefined();
    expect(tile?.frontierDecayKind).toBeUndefined();
    expect(tile?.ownerId).toBe("p2");
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ playerId: "p2" });
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

const notDecayingTile = (x: number, y: number, overrides: Partial<DomainTileState> = {}): DomainTileState =>
  ({
    x,
    y,
    ownerId: "p1",
    ownershipState: "FRONTIER",
    frontierDecayAt: undefined,
    frontierDecayKind: undefined,
    ...overrides
  }) as DomainTileState;

type StampHarness = Harness & { registerOutOfReachDecay: ReturnType<typeof vi.fn> };

const stampHarness = (tiles: Map<string, DomainTileState>): StampHarness => {
  const events: SimulationEvent[] = [];
  const replaceTileState = vi.fn((tileKey: string, tile: DomainTileState) => {
    tiles.set(tileKey, tile);
  });
  return { tiles, events, replaceTileState, registerOutOfReachDecay: vi.fn() };
};

const runStamp = (
  h: StampHarness,
  anchor: ReachAnchor,
  options: { liveAnchors?: ReachAnchor[]; inReachFor?: (playerId: string, x: number, y: number) => boolean } = {}
): number =>
  stampOutOfReachDecayInAnchorDisk(
    {
      tiles: h.tiles,
      replaceTileState: h.replaceTileState,
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
      emitEvent: (event) => {
        h.events.push(event);
      },
      now: () => NOW,
      gatherReachAnchors: () => options.liveAnchors ?? [],
      isPlayerTileInReach: options.inReachFor ?? (() => false),
      registerOutOfReachDecay: h.registerOutOfReachDecay
    },
    anchor,
    "test-anchor-deactivation"
  );

describe("stampOutOfReachDecayInAnchorDisk", () => {
  it("stamps a fresh deadline on the owner's non-decaying FRONTIER tiles left in no-man's-land", () => {
    const tiles = new Map([["10,10", notDecayingTile(10, 10)]]);
    const h = stampHarness(tiles);

    expect(runStamp(h, anchor)).toBe(1);
    const tile = tiles.get("10,10");
    expect(tile?.frontierDecayAt).toBe(NOW + OUT_OF_REACH_DECAY_MS);
    expect(tile?.frontierDecayKind).toBe("OUT_OF_REACH");
    expect(h.registerOutOfReachDecay).toHaveBeenCalledWith("10,10", NOW + OUT_OF_REACH_DECAY_MS);
    expect(h.events).toHaveLength(1);
  });

  it("leaves a tile alone if it is still inside its owner's own persistent reach", () => {
    const tiles = new Map([["10,10", notDecayingTile(10, 10)]]);
    const h = stampHarness(tiles);

    expect(runStamp(h, anchor, { inReachFor: () => true })).toBe(0);
    expect(tiles.get("10,10")?.frontierDecayKind).toBeUndefined();
    expect(h.registerOutOfReachDecay).not.toHaveBeenCalled();
  });

  it("checks reach against the TILE's own owner, not the deactivating anchor's owner", () => {
    // A different player (p2) owns this tile (e.g. captured it via ATTACK,
    // which is never reach-gated) inside p1's anchor's disk. p2's OWN reach
    // still covers it even though p1's anchor just deactivated -- must not
    // be stamped just because p1 (the anchor owner) has no reach here.
    const tiles = new Map([["10,10", notDecayingTile(10, 10, { ownerId: "p2" })]]);
    const h = stampHarness(tiles);

    expect(runStamp(h, anchor, { inReachFor: (playerId) => playerId === "p2" })).toBe(0);
    expect(tiles.get("10,10")?.frontierDecayKind).toBeUndefined();
  });

  it("stamps a different player's tile in the disk once its contest count drops from 2 to 1", () => {
    // p2 owns a tile contested between p1 (the deactivating anchor's owner)
    // and p3. Once p1's anchor deactivates, only p3 covers it -- no longer
    // contested, and p2 has no reach of their own there, so it should decay.
    const tiles = new Map([["10,10", notDecayingTile(10, 10, { ownerId: "p2" })]]);
    const h = stampHarness(tiles);
    const liveAnchors: ReachAnchor[] = [{ x: 10, y: 10, ownerId: "p3", activatedAt: 1, kind: "TOWN" }];

    expect(runStamp(h, anchor, { liveAnchors })).toBe(1);
    const tile = tiles.get("10,10");
    expect(tile?.frontierDecayKind).toBe("OUT_OF_REACH");
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ playerId: "p2" });
  });

  it("groups tile deltas into one TILE_DELTA_BATCH event per distinct tile owner", () => {
    const tiles = new Map([
      ["10,10", notDecayingTile(10, 10, { ownerId: "p2" })],
      ["11,10", notDecayingTile(11, 10, { ownerId: "p3" })]
    ]);
    const h = stampHarness(tiles);

    expect(runStamp(h, anchor)).toBe(2);
    expect(h.events).toHaveLength(2);
    expect(h.events.map((e) => (e as { playerId: string }).playerId).sort()).toEqual(["p2", "p3"]);
  });

  it("never stamps a barbarian-owned tile", () => {
    const tiles = new Map([["10,10", notDecayingTile(10, 10, { ownerId: "barbarian-1" })]]);
    const h = stampHarness(tiles);

    expect(runStamp(h, anchor)).toBe(0);
    expect(tiles.get("10,10")?.frontierDecayKind).toBeUndefined();
  });

  it("exempts a tile in an actively contested reach zone (2+ live anchors overlap)", () => {
    const tiles = new Map([["10,10", notDecayingTile(10, 10)]]);
    const h = stampHarness(tiles);
    const liveAnchors: ReachAnchor[] = [
      { x: 10, y: 10, ownerId: "p2", activatedAt: 1, kind: "TOWN" },
      { x: 10 + TOWN_REACH_RADIUS, y: 10, ownerId: "p3", activatedAt: 1, kind: "TOWN" }
    ];
    expect(runStamp(h, anchor, { liveAnchors })).toBe(0);
    expect(tiles.get("10,10")?.frontierDecayKind).toBeUndefined();
  });

  it("leaves a tile alone that already carries a decay timer, of either kind", () => {
    const tiles = new Map([
      ["10,10", decayingTile(10, 10)],
      ["11,10", decayingTile(11, 10, { frontierDecayKind: "ENCIRCLEMENT" })]
    ]);
    const h = stampHarness(tiles);

    expect(runStamp(h, anchor)).toBe(0);
    expect(h.registerOutOfReachDecay).not.toHaveBeenCalled();
  });

  it("leaves tiles outside the anchor's disk alone", () => {
    const outsideKey = `${10 + TOWN_REACH_RADIUS + 1},10`;
    const tiles = new Map([[outsideKey, notDecayingTile(10 + TOWN_REACH_RADIUS + 1, 10)]]);
    const h = stampHarness(tiles);

    expect(runStamp(h, anchor)).toBe(0);
  });

  it("ignores settled tiles", () => {
    const tiles = new Map([["10,10", notDecayingTile(10, 10, { ownershipState: "SETTLED" })]]);
    const h = stampHarness(tiles);

    expect(runStamp(h, anchor)).toBe(0);
  });
});
