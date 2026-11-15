import { createInitialSeasonState } from "../season-lifecycle.js";
import { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";
import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { compactSnapshotForStorage, expandSnapshotFromStorage } from "../snapshot-compaction/snapshot-compaction.js";
import { createSimulationPersistenceQueue } from "../simulation-persistence-queue/simulation-persistence-queue.js";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";
import { describe, expect, it } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, lastManpowerRefillAtMs, NETWORK_RESOURCES, RESOURCE_NETWORKS, type ResourceSupplyOffer } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const start = lastManpowerRefillAtMs("buyer", 100 * MANPOWER_REFILL_WINDOW_MS);
function fixture(allResources = false, buyerFarms = 12, isAi = false) {
  let now = start;
  const land = (x: number, y: number, id: string): DomainTileState => ({ x,y,terrain:"LAND",ownerId:id,ownershipState:"SETTLED" });
  const tiles: DomainTileState[] = [];
  for (const [id, offset] of [["seller", 10], ["buyer", 40]] as const) {
    for (let y=offset-1;y<=offset+1;y++) for (let x=offset-1;x<=offset+1;x++) tiles.push(land(x,y,id));
    tiles.find(t=>t.x===offset&&t.y===offset)!.town={ name:id,type:"MARKET",populationTier:"TOWN" };
    for (let x=0;x<(id === "buyer" ? buyerFarms : 12);x++) tiles.push({ ...land(offset+x,80,id),resource:"FARM" });
  }
  for (const [index, resource] of (allResources ? NETWORK_RESOURCES : ["LUXURY_BIOTA"] as const).entries()) tiles.push({
    ...land(20+index,20,"seller"),resource,economicStructure:{ownerId:"seller",type:RESOURCE_NETWORKS[resource].building,status:"active"}
  });
  if (allResources) for (const [y,type] of [[40,"TRADE_NEXUS"],[41,"MANUFACTORY"]] as const)
    tiles.find(t=>t.x===39&&t.y===y)!.economicStructure={ownerId:"buyer",type,status:"active"};
  tiles.find(t=>t.x===39&&t.y===39)!.economicStructure={ ownerId:"buyer",type:"ANCILLARY_FACTORY",status:"active" };
  tiles.find(tile => tile.x === 41 && tile.y === 40)!.economicStructure = { ownerId: "buyer", type: "ANCILLARY_DEPOT", status: "active" };
  const runtime = new SimulationRuntime({ now:()=>now,seedTiles:new Map(),initialState:{ tiles,activeLocks:[] },
    initialPlayers:new Map(["seller","buyer"].map(id=>[id,buildPlayer(id,{ points:100,isAi,manpower:0,manpowerUpdatedAt:start,
      manpowerCapSnapshot:10000,landingReserveGranted:true,techIds:new Set(allResources ? NETWORK_RESOURCES.map(resource=>RESOURCE_NETWORKS[resource].tech) : ["frontier-concessions"]) })])) });
  const pay = (id = "trade", resources: ResourceSupplyOffer = {LUXURY_BIOTA:1}, coinPerHour?: number) => runtime.submitCommand({ commandId:id,playerId:"seller",type:"SETTLE_DIPLOMACY_TERMS",sessionId:"gateway",clientSeq:id === "trade" ? 1 : 2,issuedAt:now,payloadJson:JSON.stringify({ proposerId:"seller",targetId:"buyer",proposerPays:{gold:0,resources},targetPays:{gold:3,coinPerHour},supplyDurationHours:12 }) });
  return { runtime,pay,setNow:(at:number)=>{now=at;}, player:(id:string)=>runtime.exportState().players.find(p=>p.id===id)! };
}
describe("resource trades in the production runtime",()=>{
  it("commits a supplier once, pays Coin, and gives the recipient the imported biota site",async()=>{
    const f=fixture(), events=collectEvents(f.runtime);
    expect(f.player("seller").resourceTradeHoldings?.LUXURY_BIOTA).toBe(1);
    const before=f.player("buyer");
    await f.pay();
    expect(events.some(e=>e.eventType==="COMMAND_REJECTED")).toBe(false);
    expect(f.player("seller").points).toBeCloseTo(103);
    expect(f.player("seller").resourceTradeHoldings?.LUXURY_BIOTA).toBeUndefined();
    expect(f.player("buyer").effectiveNetworkSupply?.LUXURY_BIOTA).toBe((before.effectiveNetworkSupply?.LUXURY_BIOTA ?? 0)+1);
    await f.pay("duplicate-supply");
    expect(events.some(e=>e.eventType==="COMMAND_REJECTED"&&e.commandId==="duplicate-supply")).toBe(true);
    expect(f.player("seller").points).toBeCloseTo(103);
  });
  it("diverts earned Coin symmetrically, up to the promised rate, and stops at expiry", async () => {
    const paid = fixture(false, 12, true);
    const baseline = fixture(false, 12, true);
    for (const f of [paid, baseline]) f.runtime.applyPassiveIncome(start, Infinity);
    await paid.pay("trade", { FOOD: 2 }, 1);
    await baseline.pay("trade", { FOOD: 2 });
    expect(paid.player("seller").resourceTradeAgreements?.[0]?.targetCoinPerHour).toBe(1);

    const at = start + 3_600_000;
    for (const f of [paid, baseline]) {
      f.setNow(at);
      f.runtime.applyPassiveIncome(at, Infinity);
    }
    const buyerEarned = baseline.player("buyer").points - 97;
    const transferred = Math.min(1, buyerEarned);
    expect(transferred).toBeGreaterThan(0);
    expect(paid.player("buyer").points).toBeCloseTo(baseline.player("buyer").points - transferred);
    expect(paid.player("seller").points).toBeCloseTo(baseline.player("seller").points + transferred);

    const expiresAt = start + 7 * 86_400_000;
    paid.setNow(expiresAt);
    paid.runtime.applyPassiveIncome(expiresAt, Infinity);
    expect(paid.player("seller").resourceTradeAgreements).toEqual([]);
    const before = paid.player("seller");
    paid.setNow(expiresAt + 3_600_000);
    paid.runtime.applyPassiveIncome(expiresAt + 3_600_000, Infinity);
    const after = paid.player("seller");
    expect(after.points - before.points).toBeCloseTo(Math.min(before.incomePerMinute * 60, Math.max(0, (before.storageCap?.GOLD ?? Infinity) - before.points)));
  });
  it("starts paying from a human's return without drawing on inactive or pre-deal time", async () => {
    const f = fixture();
    const hour = 3_600_000;
    const resumeAt = start + 73 * hour;
    f.runtime.updatePlayerLastActive("buyer", start);
    f.runtime.applyPassiveIncome(start, 24 * hour);
    f.setNow(start + 48 * hour);
    await f.pay("trade", { FOOD: 2 }, 1);

    f.setNow(resumeAt);
    const before = f.player("seller").points;
    expect(f.runtime.welcomeBackSummary("buyer", resumeAt).goldEarned).toBe(0);
    f.runtime.updatePlayerLastActive("buyer", resumeAt);
    f.runtime.applyPassiveIncome(resumeAt, 24 * hour);
    expect(f.player("seller").points).toBeCloseTo(before);

    f.setNow(resumeAt + hour);
    f.runtime.applyPassiveIncome(resumeAt + hour, 24 * hour);
    const paid = f.player("seller").points - before;
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThanOrEqual(1);
  });
  it("pauses recurring Coin when pledged supply is lost", async () => {
    const paid = fixture(false, 12, true);
    const baseline = fixture(false, 12, true);
    await paid.pay("trade", { LUXURY_BIOTA: 1 }, 100);
    await baseline.pay();
    for (const f of [paid, baseline]) {
      await f.runtime.submitCommand({
        commandId: "lose-site", sessionId: "s", playerId: "seller", clientSeq: 3, issuedAt: start,
        type: "UNCAPTURE_TILE", payloadJson: JSON.stringify({ x: 20, y: 20 })
      });
      expect(f.player("buyer").resourceTradeAgreements?.[0]?.fulfilled).toBe(false);
      f.setNow(start + 3_600_000);
      f.runtime.applyPassiveIncome(start + 3_600_000, Infinity);
    }
    expect(paid.player("buyer").points).toBeCloseTo(baseline.player("buyer").points);
    expect(paid.player("seller").points).toBeCloseTo(baseline.player("seller").points);
  });
  it("keeps imported and committed source rows equal to actual supply, including reconnect snapshots", async () => {
    const f = fixture();
    await f.pay("trade", { FOOD: 2 });
    for (const id of ["seller", "buyer"]) {
      const player = buildPlayerSubscriptionSnapshot(id, f.runtime.exportVisibleStateForPlayer(id), { tilesAlreadyVisible: true }).player!;
      const slots = player.resourceSlots!;
      expect(slots.sources).toBeDefined();
      for (const resource of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
        expect(slots.sources![resource].reduce((sum, row) => sum + row.slots, 0)).toBe(slots.supply[resource]);
      }
      expect(slots.sources!.FOOD).toContainEqual(expect.objectContaining({ kind: id === "seller" ? "TRADE_EXPORT" : "TRADE_IMPORT", slots: id === "seller" ? -2 : 2 }));
    }
    expect(JSON.stringify(f.runtime.exportSnapshotSections().initialState)).not.toContain("effectiveResourceSources");
    await f.runtime.submitCommand({ commandId: "cancel-source-display", sessionId: "system-runtime:social", playerId: "buyer", clientSeq: 0, issuedAt: start, type: "CANCEL_RESOURCE_SUPPLY", payloadJson: JSON.stringify({ agreementId: "trade" }) });
    for (const id of ["seller", "buyer"]) {
      const slots = buildPlayerSubscriptionSnapshot(id, f.runtime.exportVisibleStateForPlayer(id), { tilesAlreadyVisible: true }).player!.resourceSlots!;
      expect(slots.sources!.FOOD.some(row => row.kind === "TRADE_IMPORT" || row.kind === "TRADE_EXPORT")).toBe(false);
      expect(slots.sources!.FOOD.reduce((sum, row) => sum + row.slots, 0)).toBe(slots.supply.FOOD);
    }
  });
  it("supplies through the seventh day and releases the slots at the deadline",async()=>{
    const f=fixture(); await f.pay();
    expect(f.player("buyer").resourceTradeAgreements?.[0]?.fulfilled).toBe(true);
    f.setNow(start + 7 * 86_400_000 - 1);
    expect(f.player("buyer").resourceTradeAgreements?.[0]?.fulfilled).toBe(true);
    f.setNow(start + 7 * 86_400_000);
    expect(f.player("buyer").resourceTradeAgreements).toEqual([]);
    expect(f.player("seller").resourceTradeHoldings?.LUXURY_BIOTA).toBe(1);
  });
  it("preserves trade terms in durable checkpoints, event replay and the actual reconnect snapshot",async()=>{
    const f = fixture();
    const before = f.runtime.exportSnapshotSections().initialState;
    const eventStore = new InMemorySimulationEventStore();
    const queue = createSimulationPersistenceQueue({ commandStore: new InMemorySimulationCommandStore(), eventStore });
    f.runtime.onEvent(event => queue.enqueueEvent(event, start));
    await f.pay("trade", { LUXURY_BIOTA: 1 }, 50);
    await queue.whenIdle();
    const events = (await eventStore.loadAllEvents()).map(event => event.eventPayload);
    const initialState=f.runtime.exportSnapshotSections().initialState;
    expect(initialState.resourceSupplyAgreements).toHaveLength(1);
    const replayed=applySimulationEventsToRecoveredState(before,events);
    expect(replayed.resourceSupplyAgreements).toEqual(initialState.resourceSupplyAgreements);
    for (const id of ["buyer", "seller"]) {
      expect(replayed.players?.find(player => player.id === id)?.points).toBe(f.player(id).points);
    }
    const compact = await compactSnapshotForStorage(f.runtime.exportSnapshotSections(), new Map());
    const stored = expandSnapshotFromStorage(compact, []).initialState;
    expect(stored.resourceSupplyAgreements).toEqual(initialState.resourceSupplyAgreements);
    const restored=new SimulationRuntime({ now:()=>start,seedTiles:new Map(),initialState:stored,mergeSeedTilesWithInitialState:false });
    const own=buildPlayerSubscriptionSnapshot("buyer",restored.exportVisibleStateForPlayer("buyer"), { tilesAlreadyVisible:true }).player!;
    expect(own.resourceTradeAgreements?.[0]).toMatchObject({ fulfilled: true, targetCoinPerHour: 50, expiresAt: start + 7 * 86_400_000 });
    expect(own.resourceSlots?.bonusSupply?.supply.LUXURY_BIOTA).toBe(1);
    expect(own.manpowerRegenPerMinute).toBeCloseTo(f.player("buyer").manpowerRegenPerMinute!);
    const checkpointEventId = await eventStore.loadLatestEventId();
    await f.runtime.submitCommand({
      commandId: "cancel-trade", sessionId: "system-runtime:social", playerId: "buyer", clientSeq: 0,
      issuedAt: start, type: "CANCEL_RESOURCE_SUPPLY", payloadJson: JSON.stringify({ agreementId: "trade" })
    });
    await queue.whenIdle();
    const afterCheckpoint = (await eventStore.loadEventsAfter(checkpointEventId)).map(event => event.eventPayload);
    expect(applySimulationEventsToRecoveredState(initialState, afterCheckpoint).resourceSupplyAgreements).toEqual([]);
    const current = f.runtime.exportSnapshotSections().initialState;
    const overlapping = applySimulationEventsToRecoveredState(current, [...events, ...afterCheckpoint]);
    expect(overlapping.resourceSupplyAgreements).toEqual([]);
    expect(overlapping.players?.find(player => player.id === "seller")?.points).toBe(f.player("seller").points);
    expect(overlapping.players?.find(player => player.id === "buyer")?.points).toBe(f.player("buyer").points);
  });
  it("ignores a delayed trade refund from the previous season", () => {
    const f = fixture();
    const season = createInitialSeasonState({ seasonSequence: 2, rulesetId: "standard", worldSeed: 42, startedAt: start });
    const checkpoint = { ...f.runtime.exportSnapshotSections().initialState, season };
    const recovered = applySimulationEventsToRecoveredState(checkpoint, [
      {
        eventType: "PLAYER_MESSAGE", messageType: "RESOURCE_SUPPLY_COIN_REFUNDED", commandId: "late-refund", playerId: "seller",
        payloadJson: JSON.stringify({
          proposerId: "seller", targetId: "buyer", targetCoinDelta: 50,
          journalSequence: 100, journalSeasonId: "previous-season"
        })
      },
      {
        eventType: "PLAYER_MESSAGE", messageType: "RESOURCE_SUPPLY_CHANGED", commandId: "new-trade", playerId: "seller",
        payloadJson: JSON.stringify({
          action: "created", journalSequence: 1, journalSeasonId: season.seasonId, targetCoinDelta: -3,
          agreement: {
            id: "new-trade", proposerId: "seller", targetId: "buyer", proposerGives: { FOOD: 1 },
            targetGives: {}, startedAt: start, expiresAt: start + 7 * 86_400_000
          }
        })
      }
    ]);
    expect(recovered.resourceSupplyJournalSequence).toBe(1);
    expect(recovered.resourceSupplyAgreements?.map(row => row.id)).toEqual(["new-trade"]);
    expect(recovered.players?.find(player => player.id === "seller")?.points).toBe(103);
    expect(recovered.players?.find(player => player.id === "buyer")?.points).toBe(97);
  });

  it.each([false, true])("recovers the Coin refund with an already ended agreement (%s)", async alreadyEnded => {
    const f = fixture();
    const eventStore = new InMemorySimulationEventStore();
    const queue = createSimulationPersistenceQueue({ commandStore: new InMemorySimulationCommandStore(), eventStore });
    f.runtime.onEvent(event => queue.enqueueEvent(event, start));
    await f.pay();
    if (alreadyEnded) {
      await f.runtime.submitCommand({
        commandId: "cancel-before-refund", sessionId: "system-runtime:social", playerId: "buyer", clientSeq: 0,
        issuedAt: start, type: "CANCEL_RESOURCE_SUPPLY", payloadJson: JSON.stringify({ agreementId: "trade" })
      });
    }
    await queue.whenIdle();
    const checkpoint = f.runtime.exportSnapshotSections().initialState;
    const eventId = await eventStore.loadLatestEventId();
    await f.runtime.submitCommand({
      commandId: "refund-trade", sessionId: "gateway", playerId: "seller", clientSeq: 2,
      issuedAt: start, type: "SETTLE_DIPLOMACY_TERMS", payloadJson: JSON.stringify({
        proposerId: "seller", targetId: "buyer", proposerPays: { gold: 3 },
        targetPays: { gold: 0, resources: { LUXURY_BIOTA: 1 } }, refundOf: "trade"
      })
    });
    await queue.whenIdle();
    const events = (await eventStore.loadEventsAfter(eventId)).map(event => event.eventPayload);
    const recovered = applySimulationEventsToRecoveredState(checkpoint, events);
    expect(recovered.resourceSupplyAgreements).toEqual([]);
    expect(recovered.players?.find(player => player.id === "seller")?.points).toBe(100);
    expect(recovered.players?.find(player => player.id === "buyer")?.points).toBe(100);
    const compact = await compactSnapshotForStorage(f.runtime.exportSnapshotSections(), new Map());
    const stored = expandSnapshotFromStorage(compact, []).initialState;
    const overlapping = applySimulationEventsToRecoveredState(stored, events);
    expect(overlapping.players?.find(player => player.id === "seller")?.points).toBe(100);
    expect(overlapping.players?.find(player => player.id === "buyer")?.points).toBe(100);
  });
  it("does not collect recurring Coin for income from before a runtime restart", async () => {
    const f = fixture();
    const hour = 3_600_000;
    f.runtime.updatePlayerLastActive("buyer", start);
    f.runtime.applyPassiveIncome(start, 24 * hour);
    await f.pay("trade", { FOOD: 2 }, 10);
    const checkpoint = f.runtime.exportSnapshotSections().initialState;
    let now = start + 10 * hour;
    const restored = new SimulationRuntime({ now: () => now, seedTiles: new Map(), initialState: checkpoint });
    const sellerPoints = () => restored.exportState().players.find(player => player.id === "seller")!.points;
    const before = sellerPoints();
    restored.updatePlayerLastActive("buyer", now);
    restored.applyPassiveIncome(now, 24 * hour);
    expect(sellerPoints()).toBe(before);
    now += hour;
    restored.applyPassiveIncome(now, 24 * hour);
    expect(sellerPoints()).toBeGreaterThan(before);
  });
  it("suspends deliveries when the supplier loses its extraction site",async()=>{
    const f=fixture(); await f.pay();
    const events=collectEvents(f.runtime);
    f.setNow(start+60_000);
    f.runtime.submitCommand({ commandId:"lose-site",sessionId:"s",playerId:"seller",clientSeq:3,issuedAt:start+60_000,type:"UNCAPTURE_TILE",payloadJson:JSON.stringify({x:20,y:20}) });
    await Promise.resolve();
    const buyer=f.player("buyer");
    expect(buyer.resourceTradeAgreements?.[0]?.fulfilled).toBe(false);
    expect(buyer.effectiveNetworkSupply?.LUXURY_BIOTA).toBe(0);
    for (const [id, other] of [["buyer", "seller"], ["seller", "buyer"]] as const) {
      const cards = f.runtime.getPersonalActivityTimeline(id, 0, start + 60_000).cards;
      expect(cards.filter(card => card.kind === "SUPPLY_ENDED")).toEqual([
        expect.objectContaining({ reason: "SUSPENDED", counterpartyPlayerId: other })
      ]);
    }
    const updates=events.filter(event=>event.eventType==="PLAYER_MESSAGE"&&event.playerId==="buyer"&&event.messageType==="PLAYER_UPDATE");
    expect(updates.length).toBeGreaterThan(0);
    const lastUpdate=updates.at(-1);
    if (lastUpdate?.eventType!=="PLAYER_MESSAGE") throw new Error("Missing recipient update");
    const payload=JSON.parse(lastUpdate.payloadJson);
    expect(payload.resourceTradeAgreements?.[0]?.fulfilled).toBe(false);
    expect(payload.resourceSlots?.bonusSupply?.supply.LUXURY_BIOTA ?? 0).toBe(0);
  });
  it("preserves unexpired contracts when restoring after a long offline interval",async()=>{
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

  it("imports the tradable frontier resource and refuses salvage",async()=>{
    const f=fixture(true),events=collectEvents(f.runtime);
    const resources=Object.fromEntries(NETWORK_RESOURCES.filter(resource=>resource!=="PRECURSOR_SALVAGE").map(resource=>[resource,1]));
    await f.pay("trade",resources);
    const boosted=f.player("buyer");
    expect(boosted.effectiveNetworkSupply).toEqual({...resources,PRECURSOR_SALVAGE:0});
    expect(f.player("seller").resourceTradeHoldings?.PRECURSOR_SALVAGE).toBeUndefined();
    await f.pay("salvage",{PRECURSOR_SALVAGE:1});
    expect(events.some(event=>event.eventType==="COMMAND_REJECTED"&&event.commandId==="salvage")).toBe(true);
  });
  it("an imported biota site is supplied even with no Depot or Factory", async () => {
    const f = fixture(false, 0);
    await f.pay();
    expect(f.player("buyer").effectiveNetworkSupply?.LUXURY_BIOTA).toBe(1);
    const slots = buildPlayerSubscriptionSnapshot("buyer", f.runtime.exportVisibleStateForPlayer("buyer"), { tilesAlreadyVisible: true }).player!.resourceSlots!.bonusSupply!;
    expect(slots.supply.LUXURY_BIOTA).toBe(1);
    // The buyer's only town is Town tier, which needs no biota, so the import is unused.
    expect(slots.used.LUXURY_BIOTA).toBe(0);
  });
  it("uses imported FOOD to wake dormant domestic industry without creating a stockpile",async()=>{
    const f=fixture(false,5),before=f.player("buyer");
    const ownBefore=buildPlayerSubscriptionSnapshot("buyer",f.runtime.exportVisibleStateForPlayer("buyer"),{tilesAlreadyVisible:true}).player!;
    expect(ownBefore.dormantStructures?.some(row=>row.key==="39,39:economicStructure")).toBe(true);
    await f.pay("trade",{FOOD:1});
    expect(f.player("buyer").effectiveResourceSupply?.FOOD).toBe(before.effectiveResourceSupply!.FOOD+1);
    expect(f.player("buyer").strategicResources.FOOD ?? 0).toBe(before.strategicResources.FOOD ?? 0);
    const ownAfter=buildPlayerSubscriptionSnapshot("buyer",f.runtime.exportVisibleStateForPlayer("buyer"),{tilesAlreadyVisible:true}).player!;
    expect(ownAfter.dormantStructures?.some(row=>row.key==="39,39:economicStructure")).toBe(false);
    expect(ownAfter.resourceSlots?.supply.FOOD).toBe(6);
  });

  it.each(["seller","buyer"])("lets %s end the same agreement and releases both players' supply",async(actorId)=>{
    const f=fixture();await f.pay();
    const before=f.player("buyer"),events=collectEvents(f.runtime);
    f.runtime.submitCommand({commandId:"end-supply",sessionId:"system-runtime:social",playerId:actorId,clientSeq:0,issuedAt:start,type:"CANCEL_RESOURCE_SUPPLY",payloadJson:JSON.stringify({agreementId:"trade"})});
    await Promise.resolve();
    expect(events.some(event=>event.eventType==="COMMAND_REJECTED")).toBe(false);
    expect(f.player("buyer").resourceTradeAgreements).toEqual([]);
    expect(f.player("seller").resourceTradeHoldings?.LUXURY_BIOTA).toBe(1);
    expect(before.effectiveNetworkSupply?.LUXURY_BIOTA).toBe(1);
    expect(f.player("buyer").effectiveNetworkSupply?.LUXURY_BIOTA ?? 0).toBe(0);
    expect(f.player("buyer").points).toBeCloseTo(before.points);
  });

  it("writes a Chronicle card for both Houses when a supply ends, naming who ended it",async()=>{
    const f=fixture();await f.pay();
    f.runtime.submitCommand({commandId:"end-supply-chronicle",sessionId:"system-runtime:social",playerId:"seller",clientSeq:0,issuedAt:start,type:"CANCEL_RESOURCE_SUPPLY",payloadJson:JSON.stringify({agreementId:"trade"})});
    await Promise.resolve();
    const card=(id:string)=>f.runtime.getPersonalActivityTimeline(id,0,start+1).cards.find(card=>card.kind==="SUPPLY_ENDED");
    expect(card("buyer")).toMatchObject({kind:"SUPPLY_ENDED",counterpartyPlayerId:"seller",reason:"CANCELLED",byPlayerId:"seller",youGot:{LUXURY_BIOTA:1}});
    expect(card("seller")).toMatchObject({kind:"SUPPLY_ENDED",counterpartyPlayerId:"buyer",youGave:{LUXURY_BIOTA:1}});
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
    // Salvage can't be siphoned: the seller keeps it.
    const siphonable=NETWORK_RESOURCES.filter(resource=>resource!=="PRECURSOR_SALVAGE");
    for(const resource of siphonable){expect(own("seller").effectiveNetworkSupply?.[resource]).toBe(0);expect(own("buyer").effectiveNetworkSupply?.[resource]).toBe(1);}
    expect(own("seller").effectiveNetworkSupply?.PRECURSOR_SALVAGE).toBe(1);
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
