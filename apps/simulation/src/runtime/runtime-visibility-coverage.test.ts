import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";

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
