import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import {
  TERRITORY_AUTO_COMMAND_PREFIX,
  TERRITORY_AUTO_SESSION_PREFIX,
  lockSourceFromCommandId,
  lockSourceFromSessionId
} from "../runtime-types.js";

// Regression: passive defensive fire from forts and siege/light outposts
// (sweep) creates playerId-scoped combat locks via territory-automation,
// arriving every ~3 s as long as a valid target is in range. Before this
// fix, those locks made the AI strategic planner see `active_lock` every
// tick and emit a noop forever, starving the AI of all EXPAND/SETTLE/ATTACK
// commands. Symptom in prod: ai-2 stuck on `active_lock` in
// sim_ai_noop_recent indefinitely. Player-issued frontier locks must still
// gate the planner.
describe("planner active-lock gating", () => {
  const seedPlayer = (id: string) => ({
    id,
    isAi: id.startsWith("ai-"),
    points: 1_000,
    manpower: 500,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>(),
    strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
  });

  const buildRuntime = (
    commandId: string,
    overrides: { source?: "player" | "automation" } = {}
  ): SimulationRuntime =>
    new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([["ai-2", seedPlayer("ai-2")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-2", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: [
          {
            commandId,
            playerId: "ai-2",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 11,
            targetY: 10,
            originKey: "10,10",
            targetKey: "11,10",
            // Far enough in the future that the setTimeout has not fired.
            resolvesAt: 120_000,
            ...(overrides.source ? { source: overrides.source } : {})
          }
        ]
      }
    });

  it("ignores automation-source locks when reporting hasActiveLock to the planner", () => {
    const runtime = buildRuntime("explicit-automation-lock", { source: "automation" });
    const [view] = runtime.exportPlannerPlayerViews(["ai-2"]);
    expect(view).toBeDefined();
    expect(view?.hasActiveLock).toBe(false);
  });

  it("still gates the planner on player-issued frontier locks", () => {
    const runtime = buildRuntime("player-issued-attack-1", { source: "player" });
    const [view] = runtime.exportPlannerPlayerViews(["ai-2"]);
    expect(view).toBeDefined();
    expect(view?.hasActiveLock).toBe(true);
  });

  it("hydrates source from the territory-auto commandId prefix when snapshots predate the field", () => {
    // Back-compat: old snapshots have no `source` and must be migrated by
    // sniffing the commandId. createLocksFromInitialState does this once at
    // hydration; the live runtime then reads source directly.
    const runtime = buildRuntime(`${TERRITORY_AUTO_COMMAND_PREFIX}fort:ai-2:11,10:60000:1`);
    const [view] = runtime.exportPlannerPlayerViews(["ai-2"]);
    expect(view?.hasActiveLock).toBe(false);
  });

  it("defaults legacy non-prefixed snapshot locks to player source", () => {
    const runtime = buildRuntime("legacy-player-command-no-source");
    const [view] = runtime.exportPlannerPlayerViews(["ai-2"]);
    expect(view?.hasActiveLock).toBe(true);
  });
});

// The /debug/players HTTP route mirrors `exportPlayerDebugSnapshot()`. The
// two lock fields must report different things so operators can tell
// "planner is gated by a real attack" apart from "passive fort fire is
// happening." plannerBlocked = player-issued lock; hasAnyLock = anything.
describe("debug snapshot lock fields", () => {
  const seedPlayer = (id: string) => ({
    id,
    isAi: id.startsWith("ai-"),
    points: 1_000,
    manpower: 500,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>(),
    strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
  });

  const runtimeWithLock = (lockSource: "player" | "automation"): SimulationRuntime =>
    new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([["ai-2", seedPlayer("ai-2")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-2", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: [
          {
            commandId: "test-lock-1",
            playerId: "ai-2",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 11,
            targetY: 10,
            originKey: "10,10",
            targetKey: "11,10",
            resolvesAt: 120_000,
            source: lockSource
          }
        ]
      }
    });

  it("reports plannerBlocked=false but hasAnyLock=true for an automation lock", () => {
    const snapshot = runtimeWithLock("automation").exportPlayerDebugSnapshot();
    const aiTwo = snapshot.find((p) => p.id === "ai-2");
    expect(aiTwo?.plannerBlocked).toBe(false);
    expect(aiTwo?.hasAnyLock).toBe(true);
  });

  it("reports plannerBlocked=true and hasAnyLock=true for a player-issued lock", () => {
    const snapshot = runtimeWithLock("player").exportPlayerDebugSnapshot();
    const aiTwo = snapshot.find((p) => p.id === "ai-2");
    expect(aiTwo?.plannerBlocked).toBe(true);
    expect(aiTwo?.hasAnyLock).toBe(true);
  });
});

// Producer-side contract: territory-automation must emit (a) a session id
// the runtime recognises as `automation`, and (b) a command id with the
// hydration-fallback prefix. If either drifts, the planner gate breaks
// silently — these assertions lock the contract down.
describe("territory-automation source contract", () => {
  it("classifies the territory-automation session prefix as automation", () => {
    expect(lockSourceFromSessionId(`${TERRITORY_AUTO_SESSION_PREFIX}player-1`)).toBe("automation");
  });

  it("classifies every other session prefix as player", () => {
    expect(lockSourceFromSessionId("ai-runtime:player-1")).toBe("player");
    expect(lockSourceFromSessionId("user:player-1")).toBe("player");
    expect(lockSourceFromSessionId("")).toBe("player");
  });

  it("matches the territory-auto command-id prefix to automation (hydration fallback)", () => {
    expect(lockSourceFromCommandId(`${TERRITORY_AUTO_COMMAND_PREFIX}fort:player-1:1,1:0:1`)).toBe(
      "automation"
    );
    expect(lockSourceFromCommandId("user-command-1")).toBe("player");
  });
});
