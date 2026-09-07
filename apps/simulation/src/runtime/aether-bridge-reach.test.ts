import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// Covers the Aether Bridge landing-tile reach grant: casting a bridge grants
// reach on exactly the tile it lands on (radius 0, not an area), through the
// same anchor-activation path every other reach anchor uses -- so a
// genuinely unowned landing tile is auto-claimed FRONTIER for free and
// instantly (the same beachhead a captured dock gets), even when that
// unowned ground merely sits inside another player's reach/border (reported
// live: a player's bridge onto empty land silently did nothing because it
// happened to be within a rival's town reach -- fixed by gating the grant on
// actual tile ownership, not border coverage). Landing on a tile another
// player actually OWNS still only opens an attack lane. Unlike every other
// anchor kind, this grant is time-bound to the bridge's own lifetime: see
// SimulationRuntime.grantAetherBridgeReach/tickAetherBridgeReachExpiry.

const tileAt = (runtime: SimulationRuntime, x: number, y: number): { ownerId?: string; ownershipState?: string } | undefined => {
  const internal = runtime as unknown as { state: { tiles: Map<string, { ownerId?: string; ownershipState?: string }> } };
  return internal.state.tiles.get(`${x},${y}`);
};

// (0,5) is Chebyshev distance 5 from home (0,0) -- outside player-1's own
// TOWN_REACH_RADIUS (3), so the bridge grant is the only thing that could
// ever put it in player-1's border. 4 sea tiles between them (y=1..4) is
// exactly AETHER_BRIDGE_MAX_SEA_TILES.
const buildNeutralLandingRuntime = (nowFn: () => number) =>
  new SimulationRuntime({
    now: nowFn,
    initialPlayers: new Map([
      [
        "player-1",
        buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
      ]
    ]),
    initialState: {
      tiles: [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
        { x: 0, y: 1, terrain: "SEA" },
        { x: 0, y: 2, terrain: "SEA" },
        { x: 0, y: 3, terrain: "SEA" },
        { x: 0, y: 4, terrain: "SEA" },
        { x: 0, y: 5, terrain: "LAND" },
        // §5.4: CRYSTAL supply so the Observatory isn't dormant.
        { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
      ],
      activeLocks: []
    }
  });

describe("aether bridge landing-tile reach grant", () => {
  it("auto-claims a genuinely neutral landing tile as FRONTIER the instant the bridge lands", async () => {
    const runtime = buildNeutralLandingRuntime(() => 1_000);
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 5 })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "bridge-1")).toBe(true);

    const landing = tileAt(runtime, 0, 5);
    expect(landing?.ownerId).toBe("player-1");
    expect(landing?.ownershipState).toBe("FRONTIER");

    // Reach is granted on exactly the landing tile, not an area around it --
    // a neighbor of the landing tile is not reachable via the bridge grant.
    const reach = new Set(runtime.reachTileKeysForPlayer("player-1"));
    expect(reach.has("0,5")).toBe(true);
    expect(reach.has("0,6")).toBe(false);
  });

  it("withdraws the landing-tile reach once the bridge expires, so an unsettled claim decays normally", async () => {
    let clock = 1_000;
    const runtime = buildNeutralLandingRuntime(() => clock);
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 5 })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "bridge-1")).toBe(true);
    expect(runtime.reachTileKeysForPlayer("player-1")).toContain("0,5");

    clock = 1_000_000_000; // well past AETHER_BRIDGE_DURATION_MS -- bridge is now expired
    runtime.tickAetherBridgeReachExpiry(clock);

    // The reach grant is time-bound to the bridge's own lifetime -- it
    // retreats once the bridge expires, unlike a real structure's anchor.
    expect(runtime.reachTileKeysForPlayer("player-1")).not.toContain("0,5");
  });

  it("auto-claims a neutral landing tile even when it sits inside another player's reach/border (not owned by them)", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ],
        ["player-2", buildPlayer("player-2", { points: 20_000, manpower: 10_000 })]
      ]),
      initialState: {
        tiles: [
          // player-1's home is distance 5 from the target -- outside their
          // own TOWN_REACH_RADIUS (3) -- so any border coverage the target
          // ends up with beforehand can only be player-2's, not a seeding
          // artifact of player-1's own home reach spanning the water gap.
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "SEA" },
          { x: 0, y: 4, terrain: "SEA" },
          // Bridge target: neutral land, unowned by anyone.
          { x: 0, y: 5, terrain: "LAND" },
          // Neutral stepping stone, land-connecting the target to player-2's
          // town so player-2's TOWN_REACH_RADIUS (3) genuinely covers it.
          { x: 0, y: 6, terrain: "LAND" },
          // player-2's town: distance 2 from the target, well within reach,
          // but the target itself is never owned by player-2.
          { x: 0, y: 7, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { name: "Rival", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const internal = runtime as unknown as { reachBorder: Map<string, string> };
    // Confirm the premise: before the bridge, the target is genuinely inside
    // player-2's border, not player-1's or nobody's.
    expect(internal.reachBorder.get("0,5")).toBe("player-2");

    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 5 })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "bridge-1")).toBe(true);

    const landing = tileAt(runtime, 0, 5);
    expect(landing?.ownerId).toBe("player-1");
    expect(landing?.ownershipState).toBe("FRONTIER");
  });

  it("opens an attack lane but grants no reach and does not touch ownership when the bridge lands on a tile another player actually owns", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ],
        [
          "player-2",
          buildPlayer("player-2", { points: 20_000, manpower: 10_000 })
        ]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          // Bridge lands on player-2's own settled coastal town, well inside
          // their border -- casting here should only open an attack lane,
          // never grant reach or touch player-2's ownership.
          { x: 0, y: 3, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { name: "Rival", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 3 })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "bridge-1")).toBe(true);

    const landing = tileAt(runtime, 0, 3);
    expect(landing?.ownerId).toBe("player-2");
    expect(landing?.ownershipState).toBe("SETTLED");

    const reach = new Set(runtime.reachTileKeysForPlayer("player-1"));
    expect(reach.has("0,3")).toBe(false);

    runtime.submitCommand({
      commandId: "attack-via-bridge",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 0, toY: 3 })
    });
    await Promise.resolve();

    // The crossing lane itself is still open (isAetherBridgeCrossingTarget is
    // untouched by this change) -- the attack still fails here, but only on
    // an unrelated concern (no muster stationed at the origin in this test's
    // minimal setup), never on adjacency.
    const rejection = events.find((e) => e.eventType === "COMMAND_REJECTED" && e.commandId === "attack-via-bridge") as { code?: string } | undefined;
    expect(rejection?.code).not.toBe("NOT_ADJACENT");
  });
});
