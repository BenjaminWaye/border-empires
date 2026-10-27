import { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";
import { describe, expect, it } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, lastManpowerRefillAtMs, NETWORK_RESOURCES, RESOURCE_NETWORKS, type ResourceSupplyOffer } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const start = lastManpowerRefillAtMs("buyer", 100 * MANPOWER_REFILL_WINDOW_MS);
function fixture(allResources = false, buyerFarms = 12) {
  let now = start;
  const land = (x: number, y: number, id: string): DomainTileState => ({ x,y,terrain:"LAND",ownerId:id,ownershipState:"SETTLED" });
  const tiles: DomainTileState[] = [];
  for (const [id, offset] of [["seller", 10], ["buyer", 40]] as const) {
    for (let y=offset-1;y<=offset+1;y++) for (let x=offset-1;x<=offset+1;x++) tiles.push(land(x,y,id));
    tiles.find(t=>t.x===offset&&t.y===offset)!.town={ name:id,type:"MARKET",populationTier:"TOWN" };
    for (let x=0;x<(id === "buyer" ? buyerFarms : 12);x++) tiles.push({ ...land(offset+x,80,id),resource:"FARM" });
  }
  for (const [index, resource] of (allResources ? NETWORK_RESOURCES : ["NEURAL_RESIN"] as const).entries()) tiles.push({
    ...land(20+index,20,"seller"),resource,economicStructure:{ownerId:"seller",type:RESOURCE_NETWORKS[resource].building,status:"active"}
  });
  if (allResources) for (const [y,type] of [[40,"TRADE_NEXUS"],[41,"MANUFACTORY"]] as const)
    tiles.find(t=>t.x===39&&t.y===y)!.economicStructure={ownerId:"buyer",type,status:"active"};
  tiles.find(t=>t.x===39&&t.y===39)!.economicStructure={ ownerId:"buyer",type:"ANCILLARY_FACTORY",status:"active" };
  const runtime = new SimulationRuntime({ now:()=>now,seedTiles:new Map(),initialState:{ tiles,activeLocks:[] },
    initialPlayers:new Map(["seller","buyer"].map(id=>[id,buildPlayer(id,{ points:100,manpower:0,manpowerUpdatedAt:start,
      manpowerCapSnapshot:10000,landingReserveGranted:true,techIds:new Set(allResources ? NETWORK_RESOURCES.map(resource=>RESOURCE_NETWORKS[resource].tech) : ["neural-resin-processing"]) })])) });
  const pay = (id = "trade", resources: ResourceSupplyOffer = {NEURAL_RESIN:1}) => runtime.submitCommand({ commandId:id,playerId:"seller",type:"SETTLE_DIPLOMACY_TERMS",sessionId:"gateway",clientSeq:id === "trade" ? 1 : 2,issuedAt:now,payloadJson:JSON.stringify({ proposerId:"seller",targetId:"buyer",proposerPays:{gold:0,shard:0,resources},targetPays:{gold:3,shard:0},supplyDurationHours:12 }) });
  return { runtime,pay,setNow:(at:number)=>{now=at;}, player:(id:string)=>runtime.exportState().players.find(p=>p.id===id)! };
}
describe("resource trades in the production runtime",()=>{
  it("commits a supplier once, pays Coin, and adds the recipient's factory bonus",async()=>{
    const f=fixture(), events=collectEvents(f.runtime);
    expect(f.player("seller").resourceTradeHoldings?.NEURAL_RESIN).toBe(1);
    const before=f.player("buyer");
    await f.pay();
    expect(events.some(e=>e.eventType==="COMMAND_REJECTED")).toBe(false);
    expect(f.player("seller").points).toBeCloseTo(103);
    expect(f.player("seller").resourceTradeHoldings?.NEURAL_RESIN).toBeUndefined();
    expect((f.player("buyer").manpowerRegenPerMinute!-before.manpowerRegenPerMinute!)*240).toBeCloseTo(12);
    await f.pay("duplicate-supply");
    expect(events.some(e=>e.eventType==="COMMAND_REJECTED"&&e.commandId==="duplicate-supply")).toBe(true);
    expect(f.player("seller").points).toBeCloseTo(103);
  });
  it("continues supplying beyond twelve hours until cancelled",async()=>{
    const f=fixture(); await f.pay();
    expect(f.player("buyer").resourceTradeAgreements?.[0]?.fulfilled).toBe(true);
    f.setNow(start+12*3_600_000);
    expect(f.player("seller").resourceTradeHoldings?.NEURAL_RESIN).toBeUndefined();
    expect(f.player("buyer").resourceTradeAgreements?.[0]?.fulfilled).toBe(true);
  });
  it("preserves supply in durable checkpoints, event replay and the actual reconnect snapshot",async()=>{
    const f=fixture(), before=f.runtime.exportSnapshotSections().initialState, events=collectEvents(f.runtime);
    await f.pay();
    const initialState=f.runtime.exportSnapshotSections().initialState;
    expect(initialState.resourceSupplyAgreements).toHaveLength(1);
    const replayed=applySimulationEventsToRecoveredState(before,events);
    expect(replayed.resourceSupplyAgreements).toEqual(initialState.resourceSupplyAgreements);
    const restored=new SimulationRuntime({ now:()=>start,seedTiles:new Map(),initialState,mergeSeedTilesWithInitialState:false });
    const own=buildPlayerSubscriptionSnapshot("buyer",restored.exportVisibleStateForPlayer("buyer"), { tilesAlreadyVisible:true }).player!;
    expect(own.resourceTradeAgreements?.[0]?.fulfilled).toBe(true);
    expect(own.resourceSlots?.bonusSupply?.supply.NEURAL_RESIN).toBe(1);
    expect(own.manpowerRegenPerMinute).toBeCloseTo(f.player("buyer").manpowerRegenPerMinute!);
  });
  it("suspends deliveries when the supplier loses its extraction site",async()=>{
    const f=fixture(); await f.pay();
    const events=collectEvents(f.runtime);
    f.setNow(start+60_000);
    f.runtime.submitCommand({ commandId:"lose-site",sessionId:"s",playerId:"seller",clientSeq:3,issuedAt:start+60_000,type:"UNCAPTURE_TILE",payloadJson:JSON.stringify({x:20,y:20}) });
    await Promise.resolve();
    const buyer=f.player("buyer");
    expect(buyer.resourceTradeAgreements?.[0]?.fulfilled).toBe(false);
    expect(buyer.effectiveNetworkSupply?.NEURAL_RESIN).toBe(0);
    const updates=events.filter(event=>event.eventType==="PLAYER_MESSAGE"&&event.playerId==="buyer"&&event.messageType==="PLAYER_UPDATE");
    expect(updates.length).toBeGreaterThan(0);
    const lastUpdate=updates.at(-1);
    if (lastUpdate?.eventType!=="PLAYER_MESSAGE") throw new Error("Missing recipient update");
    const payload=JSON.parse(lastUpdate.payloadJson);
    expect(payload.resourceTradeAgreements?.[0]?.fulfilled).toBe(false);
    expect(payload.resourceSlots?.bonusSupply?.supply.NEURAL_RESIN ?? 0).toBe(0);
  });
  it("preserves open-ended contracts when restoring after a long offline interval",async()=>{
    const f=fixture(); await f.pay();
    const initialState=f.runtime.exportSnapshotSections().initialState;
    const restartAt=start+13*3_600_000;
    const restored=new SimulationRuntime({ now:()=>restartAt,seedTiles:new Map(),initialState,mergeSeedTilesWithInitialState:false });
    f.setNow(restartAt);
    const expected=f.player("buyer"),actual=restored.exportState().players.find(p=>p.id==="buyer")!;
    expect(actual.resourceTradeAgreements?.[0]?.fulfilled).toBe(true);
    expect(actual.manpower).toBeCloseTo(expected.manpower);
    expect(actual.points).toBeCloseTo(expected.points);
  });

  it("imports all five frontier resources into actual Ancillary and Coin production",async()=>{
    const f=fixture(true),baseline=fixture(true),before=f.player("buyer");
    const resources=Object.fromEntries(NETWORK_RESOURCES.map(resource=>[resource,1]));
    await f.pay("trade",resources);
    const boosted=f.player("buyer");
    expect((boosted.manpowerRegenPerMinute!-before.manpowerRegenPerMinute!)*240).toBeCloseTo(18);
    expect(boosted.incomePerMinute!-before.incomePerMinute!).toBeCloseTo(4.5/1440,5);
    expect(boosted.effectiveNetworkSupply).toEqual(resources);
    f.runtime.applyPassiveIncome(start,Number.MAX_SAFE_INTEGER);baseline.runtime.applyPassiveIncome(start,Number.MAX_SAFE_INTEGER);
    const startPaid=f.player("buyer").points, startBase=baseline.player("buyer").points;
    f.setNow(start+3_600_000);baseline.setNow(start+3_600_000);
    f.runtime.applyPassiveIncome(start+3_600_000,Number.MAX_SAFE_INTEGER);baseline.runtime.applyPassiveIncome(start+3_600_000,Number.MAX_SAFE_INTEGER);
    const paid=f.player("buyer").points-startPaid,base=baseline.player("buyer").points-startBase;
    expect(paid-base).toBeCloseTo(4.5/24,5);
  });
  it("uses imported FOOD to wake dormant domestic industry without creating a stockpile",async()=>{
    const f=fixture(false,4),before=f.player("buyer");
    const ownBefore=buildPlayerSubscriptionSnapshot("buyer",f.runtime.exportVisibleStateForPlayer("buyer"),{tilesAlreadyVisible:true}).player!;
    expect(ownBefore.dormantStructures?.some(row=>row.key==="39,39:economicStructure")).toBe(true);
    await f.pay("trade",{FOOD:1});
    expect(f.player("buyer").effectiveResourceSupply?.FOOD).toBe(before.effectiveResourceSupply!.FOOD+1);
    expect(f.player("buyer").strategicResources.FOOD ?? 0).toBe(before.strategicResources.FOOD ?? 0);
    const ownAfter=buildPlayerSubscriptionSnapshot("buyer",f.runtime.exportVisibleStateForPlayer("buyer"),{tilesAlreadyVisible:true}).player!;
    expect(ownAfter.dormantStructures?.some(row=>row.key==="39,39:economicStructure")).toBe(false);
    expect(ownAfter.resourceSlots?.supply.FOOD).toBe(5);
  });

  it.each(["seller","buyer"])("lets %s end the same agreement and releases both players' supply",async(actorId)=>{
    const f=fixture();await f.pay();
    const before=f.player("buyer"),events=collectEvents(f.runtime);
    f.runtime.submitCommand({commandId:"end-supply",sessionId:"system-runtime:social",playerId:actorId,clientSeq:0,issuedAt:start,type:"CANCEL_RESOURCE_SUPPLY",payloadJson:JSON.stringify({agreementId:"trade"})});
    await Promise.resolve();
    expect(events.some(event=>event.eventType==="COMMAND_REJECTED")).toBe(false);
    expect(f.player("buyer").resourceTradeAgreements).toEqual([]);
    expect(f.player("seller").resourceTradeHoldings?.NEURAL_RESIN).toBe(1);
    expect((before.manpowerRegenPerMinute!-f.player("buyer").manpowerRegenPerMinute!)*240).toBeCloseTo(12);
    expect(f.player("buyer").points).toBeCloseTo(before.points);
  });

  it("ends consecutive agreements without consuming sequence zero, including after checkpoint recovery",async()=>{
    const f=fixture();await f.pay("first");
    const end=(runtime:SimulationRuntime,id:string,agreementId:string)=>runtime.submitCommand({commandId:id,sessionId:"system-runtime:social",playerId:"buyer",clientSeq:0,issuedAt:start,type:"CANCEL_RESOURCE_SUPPLY",payloadJson:JSON.stringify({agreementId})});
    await end(f.runtime,"cancel-first","first");
    await f.pay("second");
    await end(f.runtime,"cancel-second","second");
    expect(f.player("buyer").resourceTradeAgreements).toEqual([]);
    await f.pay("third");
    const sections=f.runtime.exportSnapshotSections();
    const restored=new SimulationRuntime({now:()=>start,seedTiles:new Map(),initialState:sections.initialState,mergeSeedTilesWithInitialState:false,
      initialCommandHistory:{commands:[{commandId:"cancel-second",sessionId:"system-runtime:social",playerId:"buyer",clientSeq:0,type:"CANCEL_RESOURCE_SUPPLY",payloadJson:'{"agreementId":"second"}',queuedAt:start,status:"RESOLVED"}],
        eventsByCommandId:new Map([["cancel-second",[{eventType:"COMMAND_RESOLVED",commandId:"cancel-second",playerId:"buyer"}]]])}});
    await end(restored,"cancel-third","third");
    expect(restored.exportState().players.find(row=>row.id==="buyer")?.resourceTradeAgreements).toEqual([]);
  });

  it("routes siphoned frontier-site slots through the real tower index and releases them on cancel",async()=>{
    const base=fixture(true),initial=base.runtime.exportSnapshotSections().initialState;
    const siteKeys=NETWORK_RESOURCES.map((_,index)=>`${20+index},20`);
    initial.tiles.find(tile=>tile.x===40&&tile.y===39)!.observatory={ownerId:"buyer",status:"active",
      siphon:{targetX:20,targetY:20,tileKeys:siteKeys,startedAt:start}};
    initial.tiles.push({x:90,y:90,terrain:"LAND",resource:"GEMS",ownerId:"buyer",ownershipState:"SETTLED"});
    for(const tile of initial.tiles)if(siteKeys.includes(`${tile.x},${tile.y}`))tile.sabotage={ownerId:"buyer",observatoryTileKey:"40,39",endsAt:Number.MAX_SAFE_INTEGER,outputMultiplier:0};
    const runtime=new SimulationRuntime({now:()=>start,seedTiles:new Map(),initialState:initial,mergeSeedTilesWithInitialState:false});
    const own=(id:string)=>runtime.exportState().players.find(player=>player.id===id)!;
    for(const resource of NETWORK_RESOURCES){expect(own("seller").effectiveNetworkSupply?.[resource]).toBe(0);expect(own("buyer").effectiveNetworkSupply?.[resource]).toBe(1);}
    expect((own("buyer").manpowerRegenPerMinute!-base.player("buyer").manpowerRegenPerMinute!)*240).toBeCloseTo(18);
    runtime.submitCommand({commandId:"end-siphon",sessionId:"buyer",playerId:"buyer",clientSeq:100,issuedAt:start,type:"CANCEL_SIPHON",payloadJson:JSON.stringify({x:40,y:39})});
    await Promise.resolve();
    for(const resource of NETWORK_RESOURCES){expect(own("seller").effectiveNetworkSupply?.[resource]).toBe(1);expect(own("buyer").effectiveNetworkSupply?.[resource]).toBe(0);}
  });

  it("keeps another House's spare inventory and supply agreements private in visible snapshots",async()=>{
    const f=fixture();await f.pay();
    for(const viewer of ["seller","buyer"]){
      const state=f.runtime.exportVisibleStateForPlayer(viewer);
      const own=state.players.find(player=>player.id===viewer);
      const other=state.players.find(player=>player.id!==viewer);
      expect(own).toHaveProperty("resourceTradeAgreements");
      expect(other).not.toHaveProperty("resourceTradeHoldings");
      expect(other).not.toHaveProperty("resourceTradeAgreements");
      expect(other).not.toHaveProperty("effectiveNetworkSupply");
    }
  });

});
