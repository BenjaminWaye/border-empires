import { afcModuleFixtureTile } from "../runtime/runtime.test-helpers.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildLivePlayerEconomySnapshot } from "../live-economy-snapshot.js";
import { describe, expect, it, vi } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, NETWORK_RESOURCES, RESOURCE_NETWORKS, lastManpowerRefillAtMs, structureBuildDurationMs } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const boundary = lastManpowerRefillAtMs("p", 100 * MANPOWER_REFILL_WINDOW_MS);
const techIds = new Set(NETWORK_RESOURCES.map(resource => RESOURCE_NETWORKS[resource].tech));
const land = (x: number,y: number): DomainTileState => ({ x,y,terrain:"LAND",ownerId:"p",ownershipState:"SETTLED" });
function fixture(developed: boolean, now: () => number, manpower = 0, techs: Set<string> = techIds, extraConsumers = false, consumers?: { factories: number; depots: number }, townTier: "TOWN" | "CITY" | "METROPOLIS" = "TOWN"): SimulationRuntime {
  const tiles: DomainTileState[] = [];
  for (let y = 9; y <= 11; y += 1) for (let x = 9; x <= 11; x += 1) tiles.push(land(x,y));
  tiles.find(tile => tile.x === 10 && tile.y === 10)!.town = { name:"Heartland",type:"MARKET",populationTier:townTier,population:50000,maxPopulation:100000 };
  for (const [x,y,type] of [[9,9,"ANCILLARY_FACTORY"],[9,10,"MANUFACTORY"],[9,11,"TRADE_NEXUS"]] as const) {
    tiles.find(tile => tile.x === x && tile.y === y)!.economicStructure = { ownerId:"p", type, status:"active" };
  }
  tiles.find(tile => tile.x === 11 && tile.y === 10)!.economicStructure = { ownerId: "p", type: "ANCILLARY_DEPOT", status: "active" };
  if (extraConsumers) {
    tiles.find(tile => tile.x === 10 && tile.y === 9)!.economicStructure = { ownerId:"p",type:"ANCILLARY_FACTORY",status:"active" };
    tiles.find(tile => tile.x === 10 && tile.y === 11)!.economicStructure = { ownerId:"p",type:"ANCILLARY_FACTORY",status:"active" };
    for (let y = 99; y <= 101; y += 1) for (let x = 99; x <= 101; x += 1) tiles.push(land(x,y));
    tiles.find(tile => tile.x === 100 && tile.y === 100)!.town = { name:"Expansion",type:"MARKET",populationTier:"TOWN",population:50000,maxPopulation:100000 };
    tiles.find(tile => tile.x === 99 && tile.y === 100)!.economicStructure = { ownerId:"p",type:"MANUFACTORY",status:"active" };
    tiles.find(tile => tile.x === 99 && tile.y === 101)!.economicStructure = { ownerId:"p",type:"TRADE_NEXUS",status:"active" };
  }
  for (let i = 0; i < 24; i += 1) tiles.push({ ...land(40+i,40), resource:"FARM" });
  NETWORK_RESOURCES.forEach((resource,i) => tiles.push({ ...land(20+i,20), resource,
    ...(developed ? { economicStructure: { ownerId:"p",type:RESOURCE_NETWORKS[resource].building,status:"active" as const } } : {}) }));
  if (consumers) {
    for (const tile of tiles) if (tile.economicStructure?.type === "ANCILLARY_FACTORY" || tile.economicStructure?.type === "ANCILLARY_DEPOT") delete tile.economicStructure;
    for (let i = 0; i < consumers.factories; i++) tiles.find(tile => tile.x === 9 + i && tile.y === 9)!.economicStructure = { ownerId: "p", type: "ANCILLARY_FACTORY", status: "active" };
    for (const [x, y] of ([[11, 10], [11, 11]] as const).slice(0, consumers.depots)) tiles.find(tile => tile.x === x && tile.y === y)!.economicStructure = { ownerId: "p", type: "ANCILLARY_DEPOT", status: "active" };
  }
  return new SimulationRuntime({ now, initialPlayers:new Map([["p",buildPlayer("p",{
    points:500,manpower,manpowerUpdatedAt:boundary,manpowerCapSnapshot:10000,landingReserveGranted:true,techIds:techs
  })]]), seedTiles:new Map(), initialState:{tiles: [afcModuleFixtureTile("p"), ...tiles],activeLocks:[]} });
}
const player = (runtime: SimulationRuntime) => runtime.exportState().players.find(entry => entry.id === "p")!;

describe("resource networks in the real runtime", () => {
  it.each([[0, 0], [1, 0], [0, 2], [3, 1]])("adds 120 per refill for each material type with %i factories and %i depots", (factories, depots) => {
    const baseline = fixture(false, () => boundary, 0, techIds, false, { factories, depots });
    const developed = fixture(true, () => boundary, 0, techIds, false, { factories, depots });
    const base = player(baseline), boosted = player(developed);
    expect((boosted.manpowerRegenPerMinute! - base.manpowerRegenPerMinute!) * 240).toBeCloseTo(360);
    expect(boosted.manpowerCap).toBe(base.manpowerCap);
  });
  it("pays the additional Ancillaries at the batch boundary and names them in the breakdown", () => {
    let now = boundary;
    const baseline=fixture(false,()=>now), developed=fixture(true,()=>now);
    const boosted=player(developed);
    expect(boosted.manpowerBreakdown?.regen.find(row => row.label === "Resin, conductive and catalyst")?.amount).toBeCloseTo(360/240);
    player(baseline);
    now += MANPOWER_REFILL_WINDOW_MS;
    expect(player(developed).manpower! - player(baseline).manpower!).toBeCloseTo(360);
  });
  it("no longer pays Coin for biota, catalyst or salvage", () => {
    const now=boundary;
    const baseline=fixture(false,()=>now),developed=fixture(true,()=>now);
    baseline.applyPassiveIncome(now,Number.MAX_SAFE_INTEGER); developed.applyPassiveIncome(now,Number.MAX_SAFE_INTEGER);
    expect(player(developed).incomePerMinute).toBeCloseTo(player(baseline).incomePerMinute!, 6);
  });
  it("settles the old rate when a developed site is lost halfway through a batch", async () => {
    let now=boundary;
    const baseline=fixture(false,()=>now),developed=fixture(true,()=>now);
    player(baseline);player(developed);
    now += MANPOWER_REFILL_WINDOW_MS/2;
    for (const runtime of [baseline,developed]) {
      const seen=collectEvents(runtime);
      runtime.submitCommand({commandId:"abandon-resin",sessionId:"s",playerId:"p",clientSeq:1,issuedAt:now,type:"UNCAPTURE_TILE",payloadJson:JSON.stringify({x:20,y:20})});
      await Promise.resolve();
      expect(seen.filter(event=>event.eventType==="COMMAND_REJECTED")).toEqual([]);
    }
    now += MANPOWER_REFILL_WINDOW_MS/2;
    expect(player(developed).manpower!-player(baseline).manpower!).toBeCloseTo(360/2 + 240/2);
  });
  it("reports every material and salvage site as working, and biota only when a large town needs it", () => {
    const status = (tier: "TOWN" | "CITY") => buildLivePlayerEconomySnapshot("p", fixture(true, () => boundary, 0, techIds, false, undefined, tier).exportState()).resourceSlots.bonusSupply!;
    for (const resource of NETWORK_RESOURCES) expect(status("TOWN").supply[resource]).toBe(1);
    expect(status("TOWN").used).toMatchObject({ NEURAL_RESIN: 1, CONDUCTIVE_MINERALS: 1, CATALYTIC_DEPOSIT: 1, PRECURSOR_SALVAGE: 1, LUXURY_BIOTA: 0 });
    expect(status("CITY").used.LUXURY_BIOTA).toBe(1);
  });
  it("an unruly Metropolis without biota gives Town manpower and shows the shortfall", () => {
    const unruly = player(fixture(false, () => boundary, 0, techIds, false, undefined, "METROPOLIS"));
    const town = player(fixture(false, () => boundary, 0, techIds, false, undefined, "TOWN"));
    expect(unruly.manpowerCap).toBe(town.manpowerCap);
    expect(unruly.manpowerRegenPerMinute).toBeCloseTo(town.manpowerRegenPerMinute!);
    expect(unruly.manpowerBreakdown?.cap.find(row => row.label === "Unruly town, short of biota (1)")?.amount).toBe(-(1350 - 300));
  });
  it("one developed biota site lifts a Metropolis from Town to Great City manpower", () => {
    const supplied = player(fixture(true, () => boundary, 0, techIds, false, undefined, "METROPOLIS"));
    const unruly = player(fixture(false, () => boundary, 0, techIds, false, undefined, "METROPOLIS"));
    // Town line 300 -> 750, plus the Depot's capacity bonus, which scales with the town's working tier.
    expect(supplied.manpowerCap! - unruly.manpowerCap!).toBeGreaterThanOrEqual(750 - 300);
    expect(supplied.manpowerBreakdown?.cap.find(row => row.label === "Unruly town, short of biota (1)")?.amount).toBe(-(1350 - 750));
  });
  it("preserves deposits, installations and bonuses across snapshot recovery", () => {
    const runtime=fixture(true,()=>boundary);
    const before=player(runtime);
    const initialState=runtime.exportSnapshotSections().initialState;
    const recovered=new SimulationRuntime({now:()=>boundary,initialState,initialPlayers:createPlayersFromRecoveredState(initialState) ?? new Map(),seedTiles:new Map()});
    const after=player(recovered);
    expect(after.incomePerMinute).toBe(before.incomePerMinute);
    expect(after.manpowerRegenPerMinute).toBe(before.manpowerRegenPerMinute);
    expect(initialState.tiles.filter(tile=>NETWORK_RESOURCES.some(resource=>resource===tile.resource))).toHaveLength(5);
  });
  it("requires the resource technology and the matching site through the actual build command", async () => {
    let now=boundary;
    vi.useFakeTimers();
    const runtime=fixture(false,()=>now,500);
    const seen=collectEvents(runtime);
    runtime.submitCommand({commandId:"build-resin",sessionId:"s",playerId:"p",clientSeq:1,issuedAt:now,type:"BUILD_ECONOMIC_STRUCTURE",payloadJson:JSON.stringify({x:20,y:20,structureType:"RESIN_EXTRACTOR"})});
    await Promise.resolve();
    expect(seen.filter(event=>event.eventType==="COMMAND_REJECTED")).toEqual([]);
    const built=runtime.exportState().tiles.find(tile=>tile.x===20&&tile.y===20);
    expect(JSON.parse(built!.economicStructureJson!)).toMatchObject({type:"RESIN_EXTRACTOR",status:"under_construction",completesAt:boundary+structureBuildDurationMs("RESIN_EXTRACTOR")});
    const initialRate = player(runtime).manpowerRegenPerMinute!;
    now += structureBuildDurationMs("RESIN_EXTRACTOR");
    await vi.advanceTimersByTimeAsync(structureBuildDurationMs("RESIN_EXTRACTOR"));
    expect((player(runtime).manpowerRegenPerMinute! - initialRate) * 240).toBeCloseTo(120);
    vi.useRealTimers();
    const locked=fixture(false,()=>now,500,new Set());
    const rejected=collectEvents(locked);
    locked.submitCommand({commandId:"locked-resin",sessionId:"s",playerId:"p",clientSeq:1,issuedAt:now,type:"BUILD_ECONOMIC_STRUCTURE",payloadJson:JSON.stringify({x:20,y:20,structureType:"RESIN_EXTRACTOR"})});
    await Promise.resolve();
    expect(rejected.some(event=>event.eventType==="COMMAND_REJECTED")).toBe(true);
  });
});
