/**
 * Abandoning a tile (UNCAPTURE_TILE) releases the territory, not the
 * buildings on it. Regression cover for the reported bug: before this,
 * uncapturing wiped fort / Aether Tower / economic structure off the tile,
 * so a mis-click or a deliberate border tidy-up destroyed the build.
 */
import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { abandonedStructureFields } from "./capture-structures.js";
import type { DomainTileState } from "@border-empires/game-domain";

const tileWith = (fields: Partial<DomainTileState>): DomainTileState =>
  ({ x: 0, y: 0, terrain: "LAND", lastChangedAt: 0, ...fields }) as DomainTileState;

describe("abandonedStructureFields", () => {
  it("keeps a finished fort, tower and economic structure", () => {
    const kept = abandonedStructureFields(
      tileWith({
        fort: { ownerId: "p1", status: "active" },
        observatory: { ownerId: "p1", status: "active" },
        economicStructure: { ownerId: "p1", type: "MINTWORKS", status: "active" }
      } as Partial<DomainTileState>)
    );
    expect(kept.fort?.status).toBe("active");
    expect(kept.observatory?.status).toBe("active");
    expect(kept.economicStructure?.type).toBe("MINTWORKS");
  });

  it("razes siege outposts and relay beacons, matching what a capture razes", () => {
    const kept = abandonedStructureFields(
      tileWith({
        siegeOutpost: { ownerId: "p1", status: "active" },
        economicStructure: { ownerId: "p1", type: "RELAY_BEACON", status: "active" }
      } as Partial<DomainTileState>)
    );
    expect(kept.siegeOutpost).toBeUndefined();
    expect(kept.economicStructure).toBeUndefined();
  });

  it("drops half-built structures, which a capture also never hands over", () => {
    const kept = abandonedStructureFields(
      tileWith({
        fort: { ownerId: "p1", status: "under_construction" },
        observatory: { ownerId: "p1", status: "under_construction" },
        economicStructure: { ownerId: "p1", type: "MINTWORKS", status: "under_construction" }
      } as Partial<DomainTileState>)
    );
    expect(kept.fort).toBeUndefined();
    expect(kept.observatory).toBeUndefined();
    expect(kept.economicStructure).toBeUndefined();
  });
});

describe("UNCAPTURE_TILE through the runtime", () => {
  const buildRuntime = () =>
    new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 5_000, manpower: 5_000 })]]),
      initialState: {
        tiles: [
          {
            x: 20,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "MARKET", populationTier: "TOWN" }
          },
          {
            x: 21,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active", variant: "FORT" },
            observatory: { ownerId: "player-1", status: "active", activatedAt: 500 }
          }
        ],
        activeLocks: []
      }
    });

  const tileAt = (runtime: SimulationRuntime, x: number, y: number) =>
    (runtime as unknown as { state: { tiles: Map<string, DomainTileState> } }).state.tiles.get(`${x},${y}`);

  it("leaves the fort and Aether Tower standing on the abandoned tile", async () => {
    const runtime = buildRuntime();
    runtime.submitCommand({
      commandId: "abandon-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 21, y: 20 })
    });
    await Promise.resolve();

    const tile = tileAt(runtime, 21, 20);
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.ownershipState).toBeUndefined();
    expect(tile?.fort?.status).toBe("active");
    expect(tile?.observatory?.status).toBe("active");
  });

  it("keeps the abandoned tile neutral so nothing on it can be re-enabled by the old owner", async () => {
    const runtime = buildRuntime();
    runtime.submitCommand({
      commandId: "abandon-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 21, y: 20 })
    });
    await Promise.resolve();
    runtime.submitCommand({
      commandId: "abandon-2-toggle",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "SET_OBSERVATORY_ENABLED",
      payloadJson: JSON.stringify({ x: 21, y: 20, enabled: false })
    });
    await Promise.resolve();

    // The tower record survives (its ownerId is still the abandoner's) but the
    // tile is unowned, so it grants nothing and takes no orders from the
    // former owner -- the toggle is rejected and the status is untouched.
    expect(tileAt(runtime, 21, 20)?.observatory?.status).toBe("active");
    expect(tileAt(runtime, 21, 20)?.ownerId).toBeUndefined();
  });
});
