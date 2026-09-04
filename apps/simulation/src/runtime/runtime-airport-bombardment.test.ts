// Split out of runtime.test.ts to keep that file from crossing the repo's
// 500-line cap further (it was already well over before this split).
import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer } from "./runtime.test-helpers.js";

describe("simulation runtime", () => {
  it("resolves airport bombardment through rewrite tile deltas", async () => {
    // Force all per-tile rolls to hit (Math.random returns 1, always above miss threshold)
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000, strategicResources: { CRYSTAL: 200 } })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AIRPORT", status: "active" }
          },
          {
            x: 1,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
          },
          // Kept well clear of player-1's structure row: boot border seeding
          // contests a rival's undefended SETTLED tile inside an anchor's disk
          // (see runtime-reach-border-seed.ts), and player-1's only anchor is
          // the merged seed town at (10,10), which cannot defend row 0.
          { x: 2, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          {
            x: 2,
            y: 21,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "FRONTIER",
            muster: { ownerId: "player-2", amount: 15, mode: "HOLD", updatedAt: 500 }
          },
          // §5.4: CRYSTAL supply so AIRPORT/AETHER_TOWER aren't dormant.
          // AIRPORT demands 3 CRYSTAL slots and AETHER_TOWER another 1 (see
          // packages/shared/src/structure-slots/structure-slots.ts), so 4
          // GEMS tiles (1 CRYSTAL base slot each) are needed — 2 GEMS tiles
          // only ever supplied 2, silently dormanting one of the two
          // structures under the resource-slot tie-break.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          // §5.4: FOOD supply (FISH gives 2 base slots, §5.3) covering both
          // AETHER_TOWER's own 1 FOOD slot and the pre-existing seed-world
          // Nauticus town at (10,10) this suite always merges in (a lone
          // FARM/town tile supplying 1 against a 2-slot town demand) — a
          // single FARM tile here would leave that hidden town short and,
          // via the "newest first, key tie-break" dormancy rule, would
          // sometimes dormant the tower itself instead.
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });

    runtime.submitCommand({
      commandId: "bombard-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AIRPORT_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 20 })
    });

    await Promise.resolve();
    randSpy.mockRestore();

    // Bombing out (2,2)'s town clears its ownership mid-command, which
    // synchronously deactivates player-2's TOWN reach anchor there (same
    // replaceTileState-driven cascade the pre-existing activation/cancel
    // side effect already uses) — since (2,3) is still owned FRONTIER
    // ground at that instant, out-of-reach decay stamping fires its own
    // TILE_DELTA_BATCH for it before the bombardment loop reaches and
    // clears (2,21) itself moments later. So this command legitimately emits
    // more than one "bombard-1" batch; collect every tile delta from all of
    // them and de-dupe by (x, y), keeping the LAST value per key -- exactly
    // how a client applies incremental deltas -- to get the command's final
    // per-tile state.
    const deltaBatches = events.filter(
      (e) => e["eventType"] === "TILE_DELTA_BATCH" && e["commandId"] === "bombard-1"
    );
    expect(deltaBatches.length).toBeGreaterThan(0);
    const finalDeltaByKey = new Map<string, Record<string, unknown>>();
    for (const batch of deltaBatches) {
      for (const delta of batch["tileDeltas"] as Array<Record<string, unknown>>) {
        finalDeltaByKey.set(`${delta["x"]},${delta["y"]}`, delta);
      }
    }
    const tileDeltas = [...finalDeltaByKey.values()];

    // Stripped tiles should appear in the batch
    expect(tileDeltas).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 2, y: 20 }),
      expect.objectContaining({ x: 2, y: 21 })
    ]));

    // Structures are preserved — town on (2,20) survives
    const tile22Delta = tileDeltas.find((d) => d["x"] === 2 && d["y"] === 20);
    expect(tile22Delta).toBeDefined();
    expect(tile22Delta!["townJson"]).toBeDefined();
    expect(tile22Delta!["ownerId"]).toBeUndefined();

    // A muster flag staged on a bombed tile is destroyed along with its
    // manpower, not left behind on the now-neutral tile or refunded.
    const tile23Delta = tileDeltas.find((d) => d["x"] === 2 && d["y"] === 21);
    expect(tile23Delta).toBeDefined();
    expect(tile23Delta!["musterJson"]).toBeFalsy();
    const defender = runtime.exportState().players.find((p) => p.id === "player-2");
    expect(defender?.manpower).toBeLessThan(10_010);

    // Airport tile should include a bombardCooldownUntil in its economicStructureJson
    const airportDelta = tileDeltas.find((d) => d["x"] === 0 && d["y"] === 0);
    expect(airportDelta).toBeDefined();
    const airportStructureJson = airportDelta!["economicStructureJson"];
    expect(typeof airportStructureJson).toBe("string");
    const airportStructure = JSON.parse(airportStructureJson as string) as Record<string, unknown>;
    expect(typeof airportStructure["bombardCooldownUntil"]).toBe("number");
    expect(airportStructure["bombardCooldownUntil"] as number).toBeGreaterThan(1_000);
  });
});
