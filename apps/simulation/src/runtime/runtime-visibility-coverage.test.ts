import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { stampVisibilityAndMergeFogDeltas } from "../tile-delta-visibility-stamp.js";
import { VisibilityCoverageTracker } from "../visibility-coverage-cache.js";

// Integration coverage for the incremental VisibilityCoverageTracker wired
// into SimulationRuntime (see ../visibility-coverage-cache.ts): alliance
// formation/breakage and tech-driven vision-radius changes must update what
// filterTileDeltasForPlayer reveals immediately, without a stale cache.
describe("simulation runtime — incremental visibility coverage", () => {
  it("filterTileDeltasForPlayer reveals and hides ally territory as alliance is formed and broken", async () => {
    const makePlayer = (id: string) => ({
      id,
      isAi: false,
      points: 100,
      manpower: 100,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local",
      allies: new Set<string>()
    });
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        // Far enough apart that player-1's own vision radius (4) never
        // reaches player-2's territory — only alliance can reveal it.
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 100, y: 100, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    const delta = { x: 100, y: 100, terrain: "LAND" as const, ownerId: "player-2" };

    expect(runtime.filterTileDeltasForPlayer([delta], "player-1")).toEqual([]);

    runtime.submitCommand({
      commandId: "ally-vision-1",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: true })
    });
    await Promise.resolve();

    expect(runtime.filterTileDeltasForPlayer([delta], "player-1")).toEqual([delta]);
    // Alliance vision is bidirectional.
    expect(
      runtime.filterTileDeltasForPlayer(
        [{ x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1" }],
        "player-2"
      )
    ).toEqual([{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1" }]);

    runtime.submitCommand({
      commandId: "ally-vision-2",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 2_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: false })
    });
    await Promise.resolve();

    expect(runtime.filterTileDeltasForPlayer([delta], "player-1")).toEqual([]);
  });

  it("filterTileDeltasForPlayer widens visibility immediately after a vision-radius tech is chosen", async () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100_000,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 100, SUPPLY: 0, SHARD: 0 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });
    // Base vision radius is 4 — a delta 5 tiles out should start invisible.
    const delta = { x: 15, y: 10, terrain: "LAND" as const };
    expect(runtime.filterTileDeltasForPlayer([delta], "player-1")).toEqual([]);

    // "cartography" grants visionRadiusBonus: 1, has no prereqs.
    runtime.submitCommand({
      commandId: "choose-tech-vision-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "CHOOSE_TECH",
      payloadJson: JSON.stringify({ techId: "cartography" })
    });
    await Promise.resolve();

    expect(runtime.filterTileDeltasForPlayer([delta], "player-1")).toEqual([delta]);
  });

  // Production wires onVisibilityAudit unconditionally on every
  // SimulationRuntime instance (an always-on anti-cheat "was this reveal
  // attributed" signal, not a tests/diagnostics-only flag — see
  // simulation-service.ts). filterTileDeltasForPlayer must still use the O(1)
  // coverage-cache path in that case, not silently fall back to the
  // O(territory) per-delta scan. Asserted via the audit reason tag: the fast
  // path emits the coarse "coverage-cache" tag, while the old (broken)
  // behavior would have emitted "radius:self" from the lazy scan.
  it("uses the coverage-cache fast path for filterTileDeltasForPlayer even when onVisibilityAudit is wired", () => {
    const audits: Array<{ tileKey: string; reasons: string[] }> = [];
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      onVisibilityAudit: (sample) => audits.push({ tileKey: sample.tileKey, reasons: sample.reasons }),
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ],
        [
          "player-2",
          {
            id: "player-2",
            isAi: false,
            points: 100,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const delta = { x: 12, y: 10, terrain: "LAND" as const, ownerId: "player-2" };
    const filtered = runtime.filterTileDeltasForPlayer([delta], "player-1");

    expect(filtered).toEqual([delta]);
    const audit = audits.find((entry) => entry.tileKey === "12,10");
    expect(audit).toBeDefined();
    expect(audit?.reasons).toEqual(["coverage-cache"]);
  });

  // SYNC_ALLIANCE is excluded from the clientSeq replay-dedup gate
  // (submitCommand only dedupes by exact commandId), so a retried delivery
  // with a new commandId reaches handleSyncAllianceCommand twice. allies.add
  // is naturally idempotent; syncAllianceChange's refcount bookkeeping is
  // not, unless gated on an actual state transition. Regression test for
  // that gate: a duplicate "allied:true" must not leave a phantom refcount
  // that survives a single "allied:false".
  it("does not double-count coverage refcounts when SYNC_ALLIANCE is delivered twice", async () => {
    const makePlayer = (id: string) => ({
      id,
      isAi: false,
      points: 100,
      manpower: 100,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local",
      allies: new Set<string>()
    });
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 100, y: 100, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    const delta = { x: 100, y: 100, terrain: "LAND" as const, ownerId: "player-2" };

    // Two distinct commandIds delivering the same "allied:true" transition —
    // simulates a retried submission (a real retry is a new network
    // round-trip after a timeout, so each submission is awaited before the
    // next — the queue drains one command per microtask tick).
    for (const commandId of ["ally-dup-1", "ally-dup-1-retry"]) {
      runtime.submitCommand({
        commandId,
        sessionId: "system-runtime:social",
        playerId: "player-1",
        clientSeq: 0,
        issuedAt: 1_000,
        type: "SYNC_ALLIANCE",
        payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: true })
      });
      await Promise.resolve();
    }
    expect(runtime.filterTileDeltasForPlayer([delta], "player-1")).toEqual([delta]);

    runtime.submitCommand({
      commandId: "ally-dup-2",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 2_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: false })
    });
    await Promise.resolve();

    // A single un-ally must fully clear visibility — no phantom refcount
    // left over from the duplicate "allied:true" delivery.
    expect(runtime.filterTileDeltasForPlayer([delta], "player-1")).toEqual([]);
  });
});

// Fog-of-war v1: regression coverage for the "witness-flip-then-fog"
// mechanism (VisionTransitionAccumulator + tile-delta-visibility-stamp.ts).
// Reproduces the bug-report shape (player loses their only tile while it
// simultaneously leaves their own vision coverage on the same tick — e.g.
// the reported player-2/(32,91) case): the tracker must surface a
// leave-vision transition for the losing viewer, and the wire delta built
// from current tile state must carry the NEW owner, not silence.
//
// Exercised directly against VisibilityCoverageTracker (the actual hook —
// see runtime.ts's live tileOwnershipChanged call site) rather than through
// full SimulationRuntime combat commands: a minimal 2-tile test world
// triggers unrelated auto-respawn/elimination side effects in the runtime
// (no legitimate unowned land for the loser to respawn onto), which is a
// test-fixture artifact, not part of the mechanism under test.
describe("fog-of-war — vision-leave transitions carry the post-mutation tile state", () => {
  it("emits exactly one leave-vision transition for the previous owner when they lose their sole covering tile", () => {
    const territoryByPlayer = new Map<string, Set<string>>([
      ["player-1", new Set(["10,10"])],
      ["player-2", new Set(["10,11"])]
    ]);
    const tracker = new VisibilityCoverageTracker(450, 450, {
      visionRadiusForPlayer: () => 4,
      getPlayer: (id) => ({ id, allies: new Set() }),
      territoryTileKeysForPlayer: (id) => territoryByPlayer.get(id) ?? new Set()
    });
    tracker.tileOwnershipChanged(undefined, "player-1", 10, 10);
    tracker.tileOwnershipChanged(undefined, "player-2", 10, 11);
    expect(tracker.isVisible("player-2", "10,11")).toBe(true);

    // player-1 captures player-2's sole tile — player-2's coverage of it
    // (their only source) must drop to zero this same call.
    const left = new Map<string, Set<string>>();
    const entered = new Map<string, Set<string>>();
    territoryByPlayer.set("player-2", new Set());
    territoryByPlayer.set("player-1", new Set(["10,10", "10,11"]));
    tracker.tileOwnershipChanged("player-2", "player-1", 10, 11, {
      onEnter: (viewerId, tileKey) => (entered.get(viewerId) ?? entered.set(viewerId, new Set()).get(viewerId)!).add(tileKey),
      onLeave: (viewerId, tileKey) => (left.get(viewerId) ?? left.set(viewerId, new Set()).get(viewerId)!).add(tileKey)
    });

    expect(left.get("player-2")?.has("10,11")).toBe(true);
    // player-1 already had (10,11) itself covered (their own territory's
    // dilation from (10,10) already reaches it), so their new-owner
    // footprint there just bumps an existing refcount at that cell — no
    // 0→1 edge, hence no onEnter for (10,11) specifically (their footprint
    // does newly reach further perimeter cells, which is expected).
    expect(entered.get("player-1")?.has("10,11") ?? false).toBe(false);
    expect(tracker.isVisible("player-2", "10,11")).toBe(false);
    // player-1 already had this cell covered from their own territory — no
    // spurious leave for the winner.
    expect(left.get("player-1")).toBeUndefined();
  });
});

describe("stampVisibilityAndMergeFogDeltas", () => {
  it("stamps VISIBLE on normal deltas and merges a full FOG delta for a tile that left vision but has no delta in the batch", () => {
    const wireByKey = new Map([["5,5", { x: 5, y: 5, ownerId: "player-1", ownershipState: "SETTLED" as const }]]);
    const result = stampVisibilityAndMergeFogDeltas([{ x: 1, y: 1, ownerId: "player-2" }], {
      leftVisionTileKeys: new Set(["5,5"]),
      enteredVisionTileKeys: undefined,
      wireDeltaForTileKey: (key) => wireByKey.get(key),
      tileKeyFor: (x, y) => `${x},${y}`
    });
    expect(result).toEqual([
      { x: 1, y: 1, ownerId: "player-2", visibilityState: "VISIBLE" },
      { x: 5, y: 5, ownerId: "player-1", ownershipState: "SETTLED", visibilityState: "FOG" }
    ]);
  });

  it("prefers the full FOG-stamped delta over a redacted stub already present in the filtered batch for the same tile", () => {
    const wireByKey = new Map([["2,2", { x: 2, y: 2, ownerId: "player-3", ownershipState: "SETTLED" as const, fortJson: "{}" }]]);
    const result = stampVisibilityAndMergeFogDeltas([{ x: 2, y: 2 }], {
      leftVisionTileKeys: new Set(["2,2"]),
      enteredVisionTileKeys: undefined,
      wireDeltaForTileKey: (key) => wireByKey.get(key),
      tileKeyFor: (x, y) => `${x},${y}`
    });
    expect(result).toEqual([{ x: 2, y: 2, ownerId: "player-3", ownershipState: "SETTLED", fortJson: "{}", visibilityState: "FOG" }]);
  });

  // Regression for the "fog stopped clearing on EXPAND" incident: EXPAND's
  // resolution event only carries the captured tile itself in tileDeltas
  // (see runtime-lock-resolution.ts), so the leading-edge fringe of newly
  // visible fog around it must be reconstructed here from the vision
  // transition accumulator, or it silently never reaches the client.
  it("merges a full VISIBLE reveal delta for a tile that newly entered vision but has no delta in the batch", () => {
    const wireByKey = new Map([["9,9", { x: 9, y: 9, terrain: "LAND" as const }]]);
    const result = stampVisibilityAndMergeFogDeltas([{ x: 3, y: 3, ownerId: "player-2", ownershipState: "FRONTIER" as const }], {
      leftVisionTileKeys: undefined,
      enteredVisionTileKeys: new Set(["9,9"]),
      wireDeltaForTileKey: (key) => wireByKey.get(key),
      tileKeyFor: (x, y) => `${x},${y}`
    });
    expect(result).toEqual([
      { x: 3, y: 3, ownerId: "player-2", ownershipState: "FRONTIER", visibilityState: "VISIBLE" },
      { x: 9, y: 9, terrain: "LAND", visibilityState: "VISIBLE" }
    ]);
  });

  it("does not double-emit a tile that is both the batch's own delta and newly entered vision", () => {
    const wireByKey = new Map([["3,3", { x: 3, y: 3, ownerId: "player-2", ownershipState: "FRONTIER" as const }]]);
    const result = stampVisibilityAndMergeFogDeltas([{ x: 3, y: 3, ownerId: "player-2", ownershipState: "FRONTIER" as const }], {
      leftVisionTileKeys: undefined,
      enteredVisionTileKeys: new Set(["3,3"]),
      wireDeltaForTileKey: (key) => wireByKey.get(key),
      tileKeyFor: (x, y) => `${x},${y}`
    });
    expect(result).toEqual([{ x: 3, y: 3, ownerId: "player-2", ownershipState: "FRONTIER", visibilityState: "VISIBLE" }]);
  });
});
