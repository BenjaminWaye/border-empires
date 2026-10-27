import { afterEach, expect, it } from "vitest";
import { ResourceSupplyOfferSchema, ResourceTradeOfferSchema } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../../../simulation/src/runtime/runtime.js";
import { buildPlayer } from "../../../simulation/src/runtime/runtime.test-helpers.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { createRealtimeGatewayApp } from "../gateway-app/gateway-app.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { closeSocket, createStartupSnapshotStore, nextMatchingMessage, nextTypedMessage, openSocket, silentLog,
  type BufferedSocket } from "../gateway-app/rewrite-stack-test-helpers.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });
const stateWithDeals = async (socket: BufferedSocket, count: number, paid?: (points: number) => boolean): Promise<Record<string, unknown>> => {
  for (;;) {
    const row = await socket.nextJsonMessage(`authoritative supply state (${count})`);
    if (row.type === "ERROR") throw new Error(String(row.message));
    if (row.type === "PLAYER_UPDATE" && Array.isArray(row.resourceTradeAgreements) && row.resourceTradeAgreements.length === count && (!paid || paid(Number(row.gold ?? row.points)))) return row;
  }
};

it("negotiates, pays, delivers and cancels consecutive independent trades over real sockets and RPC", async () => {
  const now = Date.now();
  const tiles: DomainTileState[] = [];
  for (const [id, x] of [["seller", 10], ["buyer", 40]] as const) {
    tiles.push({ x, y: 10, terrain: "LAND", ownerId: id, ownershipState: "SETTLED",
      town: { name: id, type: "MARKET", populationTier: "TOWN", population: 50_000, maxPopulation: 100_000 } });
    for (let offset = 0; offset < 12; offset++) tiles.push({ x: x + offset, y: 80, terrain: "LAND", resource: "FARM", ownerId: id, ownershipState: "SETTLED" });
  }
  tiles.push({ x: 20, y: 20, terrain: "LAND", resource: "NEURAL_RESIN", ownerId: "seller", ownershipState: "SETTLED",
    economicStructure: { ownerId: "seller", type: "RESIN_EXTRACTOR", status: "active" } });
  tiles.push({ x: 39, y: 10, terrain: "LAND", ownerId: "buyer", ownershipState: "SETTLED",
    economicStructure: { ownerId: "buyer", type: "ANCILLARY_FACTORY", status: "active" } });
  tiles.push({ x: 41, y: 10, terrain: "LAND", ownerId: "buyer", ownershipState: "SETTLED",
    economicStructure: { ownerId: "buyer", type: "ANCILLARY_DEPOT", status: "active" } });
  const seed = new SimulationRuntime({ now: () => now, seedTiles: new Map(), initialState: { tiles, activeLocks: [] },
    initialPlayers: new Map(["seller", "buyer"].map(id => [id, buildPlayer(id, {
      name: id, points: 100, manpower: 0, manpowerUpdatedAt: now, landingReserveGranted: true,
      techIds: new Set(["neural-resin-processing"])
    })])) });
  const simulation = await createSimulationService({ host: "127.0.0.1", port: 0, log: silentLog,
    snapshotStore: await createStartupSnapshotStore(seed.exportSnapshotSections().initialState) });
  cleanup.push(() => simulation.close());
  const address = await simulation.start();
  const gateway = await createRealtimeGatewayApp({ host: "127.0.0.1", port: 0, logger: false,
    simulationAddress: address.address, commandStore: new InMemoryGatewayCommandStore(), defaultHumanPlayerId: "seller" });
  cleanup.push(() => gateway.close());
  const gatewayAddress = await gateway.start();
  const seller = await openSocket(gatewayAddress.wsUrl), buyer = await openSocket(gatewayAddress.wsUrl);
  cleanup.push(() => closeSocket(seller.socket), () => closeSocket(buyer.socket));
  seller.socket.send(JSON.stringify({ type: "AUTH", token: "seller" }));
  buyer.socket.send(JSON.stringify({ type: "AUTH", token: "buyer" }));
  const initial = await nextTypedMessage(buyer, "buyer init", "INIT");
  const initialRegen = initial.player && typeof initial.player === "object" ? Reflect.get(initial.player,"manpowerRegenPerMinute") : undefined;
  expect(typeof initialRegen).toBe("number");
  expect(await nextTypedMessage(seller, "seller init", "INIT")).toMatchObject({ player: { resourceTradeHoldings: { NEURAL_RESIN: 1 } } });
  for (let round = 0; round < 2; round++) {
    seller.socket.send(JSON.stringify({ type: "RESOURCE_TRADE_REQUEST", targetPlayerName: "buyer", targetPlayerId: "buyer",
      terms: { give: { gold: 0, shard: 0, resources: { NEURAL_RESIN: 1 } }, ask: { gold: 3, shard: 0 } } }));
    const offered = await nextMatchingMessage(seller, "pending trade", row => row.type === "ERROR" ||
      (row.type === "RESOURCE_TRADE_UPDATE" && Array.isArray(row.offers) && row.offers.some(value => {
        const parsed = ResourceTradeOfferSchema.safeParse(value); return parsed.success && parsed.data.status === "pending";
      })));
    expect(offered.type).toBe("RESOURCE_TRADE_UPDATE");
    const offer = ResourceTradeOfferSchema.array().parse(offered.offers).find(row => row.status === "pending")!;
    buyer.socket.send(JSON.stringify({ type: "RESOURCE_TRADE_ACCEPT", offerId: offer.id }));
    const delivered = await stateWithDeals(buyer, 1, points => points < 97.01 - round * 3);
    expect(Number(delivered.gold)).toBeCloseTo(97 - round * 3, 2);
    expect(Number(delivered.manpowerRegenPerMinute) - Number(initialRegen)).toBeCloseTo(12 / 240);
    const paidSeller = await stateWithDeals(seller, 1, points => points > 102.99 + round * 3);
    expect(Number(paidSeller.gold)).toBeCloseTo(103 + round * 3, 2);
    expect(ResourceSupplyOfferSchema.parse(paidSeller.resourceTradeHoldings).NEURAL_RESIN).toBeUndefined();
    buyer.socket.send(JSON.stringify({ type: "RESOURCE_TRADE_END", agreementId: `diplomacy-settle:resource-trade:${offer.id}` }));
    await stateWithDeals(buyer, 0);
    expect(await stateWithDeals(seller, 0)).toMatchObject({ resourceTradeHoldings: { NEURAL_RESIN: 1 } });
  }
}, 20_000);
