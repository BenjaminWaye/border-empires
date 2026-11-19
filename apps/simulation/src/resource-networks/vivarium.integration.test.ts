import { afterEach, describe, expect, it, vi } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, RESOURCE_NETWORKS, lastManpowerRefillAtMs, structureBuildDurationMs } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildLivePlayerEconomySnapshot } from "../live-economy-snapshot.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// Vivarium: each active copy in a town's support ring covers one of that
// town's luxury biota slots, so it draws one fewer from biota sites.
const boundary = lastManpowerRefillAtMs("p", 100 * MANPOWER_REFILL_WINDOW_MS);
const BIOTA_TECH = RESOURCE_NETWORKS.LUXURY_BIOTA.tech;
const land = (x: number, y: number): DomainTileState => ({ x, y, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" });

type Fixture = { tier: "CITY" | "GREAT_CITY" | "METROPOLIS"; vivaria: number; biotaSite: boolean; techs?: string[]; manpower?: number; now?: () => number; farms?: number; population?: number };
function fixture({ tier, vivaria, biotaSite, techs = [BIOTA_TECH, "census-records"], manpower = 0, now = () => boundary, farms = 24, population = 50000 }: Fixture): SimulationRuntime {
  const tiles: DomainTileState[] = [];
  for (let y = 9; y <= 11; y += 1) for (let x = 9; x <= 11; x += 1) tiles.push(land(x, y));
  tiles.find(tile => tile.x === 10 && tile.y === 10)!.town = { name: "Heartland", type: "MARKET", populationTier: tier, population, maxPopulation: 100000, supportCurrent: 8, supportMax: 8 };
  for (const [x, y] of ([[9, 9], [10, 9], [11, 9]] as const).slice(0, vivaria)) {
    tiles.find(tile => tile.x === x && tile.y === y)!.economicStructure = { ownerId: "p", type: "VIVARIUM", status: "active" };
  }
  for (let i = 0; i < farms; i += 1) tiles.push({ ...land(40 + i, 40), resource: "FARM" });
  tiles.push({
    ...land(20, 20), resource: "LUXURY_BIOTA",
    ...(biotaSite ? { economicStructure: { ownerId: "p", type: RESOURCE_NETWORKS.LUXURY_BIOTA.building, status: "active" as const } } : {})
  });
  return new SimulationRuntime({
    now,
    initialPlayers: new Map([["p", buildPlayer("p", {
      points: 500, manpower, manpowerUpdatedAt: boundary, manpowerCapSnapshot: 10000, landingReserveGranted: true, techIds: new Set(techs)
    })]]),
    seedTiles: new Map(),
    initialState: { tiles: [afcModuleFixtureTile("p"), ...tiles], activeLocks: [] }
  });
}
const player = (runtime: SimulationRuntime) => runtime.exportState().players.find(entry => entry.id === "p")!;
const unrulyRow = (runtime: SimulationRuntime) => player(runtime).manpowerBreakdown?.cap.find(row => row.label.startsWith("Unruly town"));

describe("Vivarium in the real runtime", () => {
  afterEach(() => { vi.useRealTimers(); });
  // Review of #2865: with no Depot/Factory/Neural Works/Lattice the dormancy set was never
  // computed, so a Vivarium whose FOOD upkeep was unpaid still covered biota.
  it("covers nothing while dormant for want of its FOOD slot", () => {
    const fed = fixture({ tier: "GREAT_CITY", vivaria: 3, biotaSite: false });
    const starved = fixture({ tier: "GREAT_CITY", vivaria: 3, biotaSite: false, farms: 0 });
    expect(unrulyRow(fed)).toBeUndefined();
    expect(player(starved).manpowerBreakdown?.biotaTowns?.[0]).toMatchObject({ received: 0, needed: 3, manpowerTier: "TOWN" });
  });

  it("tops up a Great City's one biota site (2 of 3 slots) to full manpower", () => {
    const short = fixture({ tier: "GREAT_CITY", vivaria: 0, biotaSite: true });
    const covered = fixture({ tier: "GREAT_CITY", vivaria: 1, biotaSite: true });
    // Great City 750, Town 300: 2 of 3 slots leaves 1/3 of the 450 gap.
    expect(unrulyRow(short)?.amount).toBe(-150);
    expect(unrulyRow(covered)).toBeUndefined();
    expect(player(covered).manpowerCap! - player(short).manpowerCap!).toBe(150);
    expect(player(covered).manpowerBreakdown?.biotaTowns).toEqual([{ tileKey: "10,10", received: 3, needed: 3, manpowerTier: "GREAT_CITY", local: 1 }]);
  });
  it("raises a Metropolis's manpower by a sixth of the Town-to-Metropolis gap for every slot, Vivarium or site", () => {
    // Metropolis 1350, Town 300: each of the 6 slots is worth 175 cap.
    expect(unrulyRow(fixture({ tier: "METROPOLIS", vivaria: 0, biotaSite: true }))?.amount).toBe(-700);
    expect(unrulyRow(fixture({ tier: "METROPOLIS", vivaria: 1, biotaSite: true }))?.amount).toBe(-525);
    expect(unrulyRow(fixture({ tier: "METROPOLIS", vivaria: 1, biotaSite: false }))?.amount).toBe(-875);
  });
  it("gives full manpower once Vivaria alone cover the whole need", () => {
    expect(unrulyRow(fixture({ tier: "GREAT_CITY", vivaria: 3, biotaSite: false }))).toBeUndefined();
  });
  it("scales a short town's coin with the share of its biota need met", () => {
    const income = (vivaria: number): number => {
      const runtime = fixture({ tier: "GREAT_CITY", vivaria, biotaSite: false });
      runtime.applyPassiveIncome(boundary, Number.MAX_SAFE_INTEGER);
      return player(runtime).incomePerMinute!;
    };
    const [none, one, two, all] = [income(0), income(1), income(2), income(3)];
    expect(one).toBeGreaterThan(none);
    expect(two).toBeGreaterThan(one);
    expect(all).toBeGreaterThan(two);
    // Linear in the share met: each slot adds the same coin.
    expect(two - one).toBeCloseTo(one - none, 5);
  });
  it("shows the same reduced coin in the login snapshot as the live economy", () => {
    const loginIncome = (vivaria: number): number =>
      buildLivePlayerEconomySnapshot("p", fixture({ tier: "GREAT_CITY", vivaria, biotaSite: false }).exportState()).incomePerMinute;
    expect(loginIncome(1)).toBeGreaterThan(loginIncome(0));
    expect(loginIncome(3)).toBeGreaterThan(loginIncome(1));
  });
  it("frees the biota site a City no longer needs in the economy panel", () => {
    const used = (vivaria: number) =>
      buildLivePlayerEconomySnapshot("p", fixture({ tier: "CITY", vivaria, biotaSite: true }).exportState()).resourceSlots.bonusSupply!.used.LUXURY_BIOTA;
    expect(used(0)).toBe(1);
    expect(used(1)).toBe(0);
  });
  it("builds through the real command once Census Office is researched, and is refused without it", async () => {
    let now = boundary;
    vi.useFakeTimers();
    const runtime = fixture({ tier: "METROPOLIS", vivaria: 0, biotaSite: false, manpower: 500, now: () => now });
    const seen = collectEvents(runtime);
    runtime.submitCommand({ commandId: "build-vivarium", sessionId: "s", playerId: "p", clientSeq: 1, issuedAt: now, type: "BUILD_ECONOMIC_STRUCTURE", payloadJson: JSON.stringify({ x: 11, y: 10, structureType: "VIVARIUM" }) });
    await Promise.resolve();
    expect(seen.filter(event => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    now += structureBuildDurationMs("VIVARIUM");
    await vi.advanceTimersByTimeAsync(structureBuildDurationMs("VIVARIUM"));
    expect(player(runtime).manpowerBreakdown?.biotaTowns?.[0]).toMatchObject({ received: 1, local: 1, manpowerTier: "CITY" });
    vi.useRealTimers();
    const locked = fixture({ tier: "METROPOLIS", vivaria: 0, biotaSite: false, manpower: 500, techs: [BIOTA_TECH] });
    const rejected = collectEvents(locked);
    locked.submitCommand({ commandId: "locked-vivarium", sessionId: "s", playerId: "p", clientSeq: 1, issuedAt: now, type: "BUILD_ECONOMIC_STRUCTURE", payloadJson: JSON.stringify({ x: 11, y: 10, structureType: "VIVARIUM" }) });
    await Promise.resolve();
    expect(rejected.some(event => event.eventType === "COMMAND_REJECTED")).toBe(true);
  });
});

// Review of #2865: production runs the AI planner in a worker, which reads the town-economy
// view from exportPlannerPlayerViews; that path did not pass the biota allocation, so the
// worker never saw a short town and never proposed a Vivarium.
describe("Vivarium AI inputs through the planner-worker export", () => {
  it("exports each town's biota shortfall to the planner", () => {
    const short = fixture({ tier: "METROPOLIS", vivaria: 1, biotaSite: true });
    expect(short.exportPlannerPlayerViews(["p"])[0]?.townEconomy?.find(town => town.townKey === "10,10")?.biotaShortSlots).toBe(3);
    const covered = fixture({ tier: "GREAT_CITY", vivaria: 1, biotaSite: true });
    expect(covered.exportPlannerPlayerViews(["p"])[0]?.townEconomy?.find(town => town.townKey === "10,10")?.biotaShortSlots).toBe(0);
  });
});

// Review of #2865: town Coin is stamped on the town tile, and a Vivarium completing on a
// support tile never re-sent the town tile, so the map kept showing the old Coin.
describe("town Coin on the map follows the biota share", () => {
  afterEach(() => { vi.useRealTimers(); });
  const townCoin = (events: ReturnType<typeof collectEvents>): number | undefined => {
    for (const event of [...events].reverse()) {
      if (event.eventType !== "TILE_DELTA_BATCH") continue;
      const delta = event.tileDeltas.find(entry => entry.x === 10 && entry.y === 10);
      const town = delta?.townJson ? JSON.parse(delta.townJson) as { goldPerMinute?: number } : undefined;
      if (town?.goldPerMinute !== undefined) return town.goldPerMinute;
    }
    return undefined;
  };
  it("re-pushes the town tile on the next population tick after its share changes", async () => {
    let now = boundary;
    vi.useFakeTimers();
    // At its population cap, so the growth tick has no other reason to re-send the town tile.
    const runtime = fixture({ tier: "GREAT_CITY", vivaria: 0, biotaSite: false, manpower: 500, now: () => now, population: 100000 });
    const seen = collectEvents(runtime);
    runtime.tickPopulationGrowth(now);
    const before = townCoin(seen);
    expect(before).toBeGreaterThan(0);
    runtime.submitCommand({ commandId: "build-vivarium", sessionId: "s", playerId: "p", clientSeq: 1, issuedAt: now, type: "BUILD_ECONOMIC_STRUCTURE", payloadJson: JSON.stringify({ x: 11, y: 10, structureType: "VIVARIUM" }) });
    await Promise.resolve();
    now += structureBuildDurationMs("VIVARIUM");
    await vi.advanceTimersByTimeAsync(structureBuildDurationMs("VIVARIUM"));
    seen.length = 0;
    runtime.tickPopulationGrowth(now);
    expect(townCoin(seen)).toBeGreaterThan(before!);
  });
});
