import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { AETHER_TOWER_SHOT_REFILL_MS } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { pickReadyOwnedObservatoryAny, pickReadyOwnedObservatoryForTarget } from "../runtime-ability-helpers.js";

// Every ability cast from an Aether Tower spends one of its shots: 3 per tower
// per rolling 24h, 6 with Oracle's Resonance Governor (aether-tower-shots.ts).
// Survey Sweep is the probe here because it targets the tower itself.

const makePlayer = (id: string, domainIds: string[] = []) => ({
  id,
  isAi: false,
  points: 1_000,
  manpower: 1_000,
  techIds: new Set<string>(["beacon-towers"]),
  domainIds: new Set<string>(domainIds),
  afcUpgradeRuleset: "afc-v1" as const,
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 100, UMBRITE: 0, SHARD: 0 }
});

const buildRuntime = (clock: { now: number }, domainIds: string[] = []): { runtime: SimulationRuntime; events: SimulationEvent[] } => {
  const runtime = new SimulationRuntime({
    now: () => clock.now,
    initialPlayers: new Map([["player-1", makePlayer("player-1", domainIds)]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
        // CRYSTAL supply so the tower isn't dormant.
        { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
      ],
      activeLocks: []
    }
  });
  const events: SimulationEvent[] = [];
  runtime.onEvent((event) => events.push(event));
  return { runtime, events };
};

let seq = 0;
const sweep = async (runtime: SimulationRuntime, events: SimulationEvent[], issuedAt: number): Promise<"resolved" | string> => {
  const commandId = `sweep-${++seq}`;
  runtime.submitCommand({ commandId, sessionId: "s", playerId: "player-1", clientSeq: seq, issuedAt, type: "SURVEY_SWEEP", payloadJson: JSON.stringify({ x: 0, y: 0 }) });
  await Promise.resolve();
  const outcome = events.find((event) => "commandId" in event && event.commandId === commandId && (event.eventType === "COMMAND_RESOLVED" || event.eventType === "COMMAND_REJECTED"));
  return outcome?.eventType === "COMMAND_REJECTED" ? outcome.message : "resolved";
};

const towerState = (runtime: SimulationRuntime): { shotsUsedAt?: number[]; cooldownUntil?: number } =>
  JSON.parse(runtime.exportState().tiles.find((tile) => tile.x === 0 && tile.y === 0)?.observatoryJson ?? "{}");

describe("Aether Tower shots", () => {
  it("fires 3 times, rejects the 4th, and gets a shot back 24h after the first", async () => {
    const clock = { now: 1_000 };
    const { runtime, events } = buildRuntime(clock);
    for (const at of [1_000, 2_000, 3_000]) {
      clock.now = at;
      expect(await sweep(runtime, events, at)).toBe("resolved");
    }
    expect(towerState(runtime)).toMatchObject({ shotsUsedAt: [1_000, 2_000, 3_000], cooldownUntil: 1_000 + AETHER_TOWER_SHOT_REFILL_MS });
    clock.now = 4_000;
    expect(await sweep(runtime, events, 4_000)).toBe("aether tower has no shots left");
    clock.now = 1_000 + AETHER_TOWER_SHOT_REFILL_MS;
    expect(await sweep(runtime, events, clock.now)).toBe("resolved");
    expect(towerState(runtime).shotsUsedAt).toEqual([2_000, 3_000, clock.now]);
  });

  it("holds 6 shots with Resonance Governor", async () => {
    const clock = { now: 1_000 };
    const { runtime, events } = buildRuntime(clock, ["afc-oracle-1", "afc-oracle-2"]);
    for (let shot = 1; shot <= 6; shot += 1) {
      clock.now = shot * 1_000;
      expect(await sweep(runtime, events, clock.now)).toBe("resolved");
    }
    clock.now = 7_000;
    expect(await sweep(runtime, events, clock.now)).toBe("aether tower has no shots left");
  });
});

describe("picking the tower a cast fires from", () => {
  const tower = (x: number, shotsUsedAt: number[]): DomainTileState =>
    ({ x, y: 0, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", observatory: { ownerId: "p", status: "active", shotsUsedAt } }) as DomainTileState;
  // Tower at x=5 is nearest the target but down to its last shot; x=10 is full.
  const tiles = new Map([["5,0", tower(5, [1, 2])], ["10,0", tower(10, [])], ["15,0", tower(15, [1, 2, 3])]]);
  const pick = { tiles, territoryTileKeys: new Set(tiles.keys()), playerId: "p", targetX: 0, targetY: 0, now: 10, range: 20, maxShots: 3, isStructureDormant: () => false };

  it("fires a targeted ability from the in-range tower with most shots left, so the nearer one keeps its shield", () => {
    expect(pickReadyOwnedObservatoryForTarget(pick)).toBe("10,0");
  });

  it("falls back to the nearest when shots are tied, and skips empty towers", () => {
    const tied = new Map([["5,0", tower(5, [1])], ["10,0", tower(10, [1])], ["15,0", tower(15, [1, 2, 3])]]);
    expect(pickReadyOwnedObservatoryForTarget({ ...pick, tiles: tied, territoryTileKeys: new Set(tied.keys()) })).toBe("5,0");
    expect(pickReadyOwnedObservatoryForTarget({ ...pick, territoryTileKeys: new Set(["15,0"]) })).toBeUndefined();
  });

  it("fires an untargeted ability from the fullest tower", () => {
    expect(pickReadyOwnedObservatoryAny(tiles, new Set(tiles.keys()), "p", 10, 3, () => false)).toBe("10,0");
  });
});
