import { describe, expect, it, vi } from "vitest";
import { FRONTIER_CLAIM_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";

const makePlayer = (id: string, allies: string[] = []) => [
  id,
  {
    id,
    isAi: id.startsWith("ai-"),
    points: 100,
    manpower: 150,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>(allies)
  }
] as const;

type TileSeed = { x: number; y: number; ownerId?: string; ownershipState?: "SETTLED" | "FRONTIER"; campId?: string; town?: { name: string; type: "FARMING"; populationTier: "TOWN" } };

const makeRuntime = (players: ReadonlyArray<ReturnType<typeof makePlayer>>, tiles: TileSeed[], online: Set<string> = new Set(["player-1", "player-2"])) =>
  new SimulationRuntime({
    now: () => 1_000,
    isPlayerSubscribed: (playerId) => online.has(playerId),
    initialPlayers: new Map(players),
    seedTiles: new Map(),
    initialState: {
      tiles: tiles.map((t) => ({ terrain: "LAND" as const, ...t })),
      activeLocks: []
    }
  });

/** A one-tile camp at (x, y). */
const camp = (x: number, y: number): TileSeed => ({ x, y, ownerId: "barbarian-1", ownershipState: "SETTLED", campId: `${x},${y}` });
/** Frontier of the camp at `campKey`. */
const campLand = (x: number, y: number, campKey: string): TileSeed => ({ x, y, ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: campKey });
const settled = (x: number, y: number, ownerId: string): TileSeed => ({ x, y, ownerId, ownershipState: "SETTLED" });

// A camp acts only while a watcher (an AI, or a human with the game open) can
// see one of its tiles. The counts come from the same coverage the client's fog
// is built from (camp-awake-tracker.ts), updated on coverage edges, not scans.
describe("runtime.exportAwakeCampIds", () => {
  it("wakes only camps an online player can see", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1"), makePlayer("player-2"), makePlayer("barbarian-1")],
      [settled(50, 50, "player-1"), settled(200, 200, "player-2"), camp(51, 51), camp(100, 100)]
    );
    expect(runtime.exportAwakeCampIds()).toEqual(["51,51"]);
  });

  it("any tile of the camp counts, not just the camp tile", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1"), makePlayer("barbarian-1")],
      [settled(50, 50, "player-1"), camp(55, 50), campLand(54, 50, "55,50"), campLand(53, 50, "55,50"), campLand(52, 50, "55,50"), campLand(51, 50, "55,50")]
    );
    expect(runtime.exportAwakeCampIds()).toEqual(["55,50"]);
  });

  it("an offline human's land never wakes a camp, and logging in or out is picked up on the next side tick", () => {
    const online = new Set<string>();
    const runtime = makeRuntime([makePlayer("player-1"), makePlayer("barbarian-1")], [settled(50, 50, "player-1"), camp(51, 51)], online);
    expect(runtime.exportAwakeCampIds()).toEqual([]);
    online.add("player-1");
    runtime.tickSideTickers(1_000);
    expect(runtime.exportAwakeCampIds()).toEqual(["51,51"]);
    online.delete("player-1");
    runtime.tickSideTickers(1_000);
    expect(runtime.exportAwakeCampIds()).toEqual([]);
  });

  // Regression: the boot step used to ask who is online while the runtime was
  // still being constructed, before the service's subscription registry
  // existed (a temporal-dead-zone ReferenceError in every service boot).
  it("never asks who is online while the runtime is being constructed", () => {
    let constructed = false;
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      isPlayerSubscribed: (playerId) => {
        if (!constructed) throw new ReferenceError("Cannot access 'subscriptionRegistry' before initialization");
        return playerId === "player-1";
      },
      initialPlayers: new Map([makePlayer("player-1"), makePlayer("barbarian-1")]),
      seedTiles: new Map(),
      initialState: { tiles: [settled(50, 50, "player-1"), camp(51, 51)].map((t) => ({ terrain: "LAND" as const, ...t })), activeLocks: [] }
    });
    constructed = true;
    expect(runtime.exportAwakeCampIds()).toEqual(["51,51"]);
  });

  it("an AI's vision always wakes a camp", () => {
    const runtime = makeRuntime([makePlayer("ai-1"), makePlayer("barbarian-1")], [settled(50, 50, "ai-1"), camp(51, 51)], new Set());
    expect(runtime.exportAwakeCampIds()).toEqual(["51,51"]);
  });

  it("a FRONTIER claim only reveals its 1-tile halo, matching what the player sees", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1"), makePlayer("barbarian-1")],
      [{ x: 50, y: 50, ownerId: "player-1", ownershipState: "FRONTIER" }, camp(51, 50), camp(52, 50)]
    );
    expect(runtime.exportAwakeCampIds()).toEqual(["51,50"]);
  });

  it("a SETTLED town's +1 ring makes barb tiles visible one extra tile out", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1"), makePlayer("barbarian-1")],
      [
        { x: 50, y: 50, ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "FARMING", populationTier: "TOWN" } },
        settled(60, 60, "player-1"),
        camp(52, 52), // via the town's +1 ring
        camp(62, 62) // outside the plain tile's radius
      ]
    );
    const seen = runtime.exportAwakeCampIds();
    expect(seen).toContain("52,52");
    expect(seen).not.toContain("62,62");
  });

  it("an ally's vision counts, like it does for the client's fog", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1", ["player-2"]), makePlayer("player-2", ["player-1"]), makePlayer("barbarian-1")],
      [settled(50, 50, "player-2"), camp(51, 50)],
      new Set(["player-1"])
    );
    expect(runtime.exportAwakeCampIds()).toEqual(["51,50"]);
  });

  it("is empty with no camps, and ignores barbarian-owned vision", () => {
    const none = makeRuntime([makePlayer("player-1"), makePlayer("barbarian-1")], [settled(5, 5, "player-1")]);
    expect(none.exportAwakeCampIds()).toEqual([]);
    const onlyBarbs = makeRuntime(
      [makePlayer("barbarian-1"), makePlayer("barbarian-2" as never)],
      [camp(10, 10), { x: 11, y: 10, ownerId: "barbarian-2", ownershipState: "SETTLED", campId: "11,10" }]
    );
    expect(onlyBarbs.exportAwakeCampIds()).toEqual([]);
  });

  it("follows live ownership changes through coverage edges", async () => {
    vi.useFakeTimers();
    try {
      const runtime = makeRuntime(
        [makePlayer("player-1"), makePlayer("barbarian-1")],
        [settled(50, 50, "player-1"), { x: 51, y: 50 }, camp(53, 50), campLand(52, 50, "53,50")]
      );
      expect(runtime.exportAwakeCampIds()).toEqual([]);
      runtime.submitCommand({
        commandId: "c1",
        sessionId: "s",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 50, fromY: 50, toX: 51, toY: 50 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(FRONTIER_CLAIM_MS + 100);
      // The player now owns (51,50), which borders the barbarian at (52,50).
      // The camp's frontier at (52,50) is in view (its camp tile at (53,50) is not): the camp wakes.
      expect(runtime.exportAwakeCampIds()).toEqual(["53,50"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
