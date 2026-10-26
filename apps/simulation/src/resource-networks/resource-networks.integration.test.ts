import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildLivePlayerEconomySnapshot } from "../live-economy-snapshot.js";
import { enrichSnapshotTilesForPlayer } from "../live-snapshot-view/live-snapshot-view.js";
import { describe, expect, it, vi } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, NETWORK_RESOURCES, RESOURCE_NETWORKS, lastManpowerRefillAtMs, structureBuildDurationMs } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const boundary = lastManpowerRefillAtMs("p", 100 * MANPOWER_REFILL_WINDOW_MS);
const techIds = new Set(NETWORK_RESOURCES.map(resource => RESOURCE_NETWORKS[resource].tech));
const land = (x: number,y: number): DomainTileState => ({ x,y,terrain:"LAND",ownerId:"p",ownershipState:"SETTLED" });
function fixture(developed: boolean, now: () => number, manpower = 0, techs: Set<string> = techIds, extraConsumers = false): SimulationRuntime {
  const tiles: DomainTileState[] = [];
  for (let y = 9; y <= 11; y += 1) for (let x = 9; x <= 11; x += 1) tiles.push(land(x,y));
  tiles.find(tile => tile.x === 10 && tile.y === 10)!.town = { name:"Heartland",type:"MARKET",populationTier:"TOWN",population:50000,maxPopulation:100000 };
  for (const [x,y,type] of [[9,9,"ANCILLARY_FACTORY"],[9,10,"MANUFACTORY"],[9,11,"TRADE_NEXUS"]] as const) {
    tiles.find(tile => tile.x === x && tile.y === y)!.economicStructure = { ownerId:"p", type, status:"active" };
  }
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
  return new SimulationRuntime({ now, initialPlayers:new Map([["p",buildPlayer("p",{
    points:500,manpower,manpowerUpdatedAt:boundary,manpowerCapSnapshot:10000,landingReserveGranted:true,techIds:techs
  })]]), seedTiles:new Map(), initialState:{tiles,activeLocks:[]} });
}
const player = (runtime: SimulationRuntime) => runtime.exportState().players.find(entry => entry.id === "p")!;

describe("resource networks in the real runtime", () => {
  it("pays the actual additional Ancillaries at the batch boundary, without changing capacity", () => {
    let now = boundary;
    const baseline=fixture(false,()=>now), developed=fixture(true,()=>now);
    const base=player(baseline), boosted=player(developed);
    expect(boosted.manpowerCap).toBe(base.manpowerCap);
    expect((boosted.manpowerRegenPerMinute! - base.manpowerRegenPerMinute!) * 240).toBeCloseTo(18);
    expect(boosted.manpowerBreakdown?.regen.find(row => row.label === "Ancillary resource network")?.amount).toBeCloseTo(18/240);
    now += MANPOWER_REFILL_WINDOW_MS;
    expect(player(developed).manpower! - player(baseline).manpower!).toBeCloseTo(18);
  });
  it("credits real Coin, attributes it in the breakdown and updates displayed town income", () => {
    let now=boundary;
    const baseline=fixture(false,()=>now),developed=fixture(true,()=>now);
    baseline.applyPassiveIncome(now,Number.MAX_SAFE_INTEGER); developed.applyPassiveIncome(now,Number.MAX_SAFE_INTEGER);
    const b0=player(baseline),d0=player(developed);
    expect(d0.incomePerMinute!-b0.incomePerMinute!).toBeCloseTo(4.5/1440,5);
    now += 60 * 60_000;
    baseline.applyPassiveIncome(now,Number.MAX_SAFE_INTEGER); developed.applyPassiveIncome(now,Number.MAX_SAFE_INTEGER);
    expect((player(developed).points!-d0.points!)-(player(baseline).points!-b0.points!)).toBeCloseTo(4.5/24,3);
    const detailFor = (runtime: SimulationRuntime) => {
      const state = runtime.exportState();
      const economy = buildLivePlayerEconomySnapshot("p", state);
      const enriched = enrichSnapshotTilesForPlayer("p", state, state.tiles, economy);
      return enriched.find(tile=>tile.x===10&&tile.y===10);
    };
    const town=detailFor(developed);
    const baseTown=detailFor(baseline);
    expect(town?.townJson).toBeDefined();
    const detail=JSON.parse(town!.townJson!) as {goldPerMinute:number};
    const baseDetail=JSON.parse(baseTown!.townJson!) as {goldPerMinute:number};
    expect((detail.goldPerMinute-baseDetail.goldPerMinute)*1440).toBeCloseTo(4.5,2);
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
    expect(player(developed).manpower!-player(baseline).manpower!).toBeCloseTo(12);
  });
  it("does not duplicate supply slots across additional factories or towns", () => {
    const baseline=fixture(false,()=>boundary,0,techIds,true), developed=fixture(true,()=>boundary,0,techIds,true);
    const base=player(baseline), boost=player(developed);
    expect((boost.manpowerRegenPerMinute!-base.manpowerRegenPerMinute!)*240).toBeCloseTo(18);
    expect((boost.incomePerMinute!-base.incomePerMinute!)*1440).toBeCloseTo(4.5,3);
    const slots=buildLivePlayerEconomySnapshot("p",developed.exportState()).resourceSlots.bonusSupply;
    expect(slots?.supply.NEURAL_RESIN).toBe(1);
    expect(slots?.used.NEURAL_RESIN).toBe(1);
    expect(slots?.used.CONDUCTIVE_MINERALS).toBe(1);
    expect(slots?.used.CATALYTIC_DEPOSIT).toBe(1);
    expect(slots?.used.LUXURY_BIOTA).toBe(1);
    expect(slots?.used.PRECURSOR_SALVAGE).toBe(1);
    const extraTownCredits = (runtime: SimulationRuntime) => {
      const state=runtime.exportState(), economy=buildLivePlayerEconomySnapshot("p",state);
      return enrichSnapshotTilesForPlayer("p",state,state.tiles,economy).filter(tile=>tile.townJson).reduce((sum,tile)=>
        sum+(JSON.parse(tile.townJson!) as {goldPerMinute:number}).goldPerMinute,0);
    };
    expect((extraTownCredits(developed)-extraTownCredits(baseline))*1440).toBeCloseTo(4.5,2);
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
  it("settles credit at the old rate when an export concession is lost between income ticks", async () => {
    let now=boundary;
    const baseline=fixture(false,()=>now),developed=fixture(true,()=>now);
    for (const runtime of [baseline,developed]) runtime.applyPassiveIncome(now,Number.MAX_SAFE_INTEGER);
    const b0=player(baseline).points!,d0=player(developed).points!;
    now += 60*60_000;
    for (const runtime of [baseline,developed]) {
      runtime.submitCommand({commandId:"abandon-catalyst",sessionId:"s",playerId:"p",clientSeq:1,issuedAt:now,type:"UNCAPTURE_TILE",payloadJson:JSON.stringify({x:22,y:20})});
      await Promise.resolve();
    }
    now += 60*60_000;
    for (const runtime of [baseline,developed]) runtime.applyPassiveIncome(now,Number.MAX_SAFE_INTEGER);
    expect((player(developed).points!-d0)-(player(baseline).points!-b0)).toBeCloseTo(7.5/24,3);
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
    expect((player(runtime).manpowerRegenPerMinute! - initialRate) * 240).toBeCloseTo(12);
    vi.useRealTimers();
    const locked=fixture(false,()=>now,500,new Set());
    const rejected=collectEvents(locked);
    locked.submitCommand({commandId:"locked-resin",sessionId:"s",playerId:"p",clientSeq:1,issuedAt:now,type:"BUILD_ECONOMIC_STRUCTURE",payloadJson:JSON.stringify({x:20,y:20,structureType:"RESIN_EXTRACTOR"})});
    await Promise.resolve();
    expect(rejected.some(event=>event.eventType==="COMMAND_REJECTED")).toBe(true);
  });
});
