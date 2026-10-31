import { expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

it("splits one foundry's two exclusive slots between two trading Houses without re-exporting imports", async () => {
  const now = 100_000;
  const ids = ["seller", "buyer-one", "buyer-two"];
  const tiles: DomainTileState[] = [];
  for (const [index, id] of ids.entries()) {
    const x = 10 + index * 30;
    tiles.push({ x, y: 10, terrain: "LAND", ownerId: id, ownershipState: "SETTLED", town: { name: id, type: "MARKET", populationTier: "TOWN", population: 50_000, maxPopulation: 100_000 } });
    for (let offset = 0; offset < 12; offset++) tiles.push({ x: x + offset, y: 80, terrain: "LAND", ownerId: id, ownershipState: "SETTLED", resource: "FARM" });
    if (id !== "seller") tiles.push({ x: x - 1, y: 10, terrain: "LAND", ownerId: id, ownershipState: "SETTLED", economicStructure: { ownerId: id, type: "ANCILLARY_FACTORY", status: "active" } });
  }
  tiles.push({ x: 20, y: 20, terrain: "LAND", ownerId: "seller", ownershipState: "SETTLED", resource: "CONDUCTIVE_MINERALS", economicStructure: { ownerId: "seller", type: "IMPLANT_FOUNDRY", status: "active" } });
  const runtime = new SimulationRuntime({ now: () => now, seedTiles: new Map(), initialState: { tiles, activeLocks: [] }, initialPlayers: new Map(ids.map(id => [id, buildPlayer(id, { points: 100, manpower: 0, manpowerUpdatedAt: now, landingReserveGranted: true, techIds: new Set(["organized-supply"]) })])) });
  const player = (id: string) => runtime.exportState().players.find(row => row.id === id)!;
  const before = new Map(ids.map(id => [id, player(id).manpowerRegenPerMinute!]));
  const events = collectEvents(runtime);
  expect(player("seller").resourceTradeHoldings?.CONDUCTIVE_MINERALS).toBe(2);
  for (const [index, targetId] of ["buyer-one", "buyer-two"].entries()) {
    await runtime.submitCommand({ commandId: `conductive-contract-${index}`, sessionId: "system-runtime:social", playerId: targetId, clientSeq: 0, issuedAt: now, type: "SETTLE_DIPLOMACY_TERMS", payloadJson: JSON.stringify({ proposerId: "seller", targetId, proposerPays: { gold: 0, shard: 0, resources: { CONDUCTIVE_MINERALS: 1 } }, targetPays: { gold: 0, shard: 0 } }) });
    expect((player(targetId).manpowerRegenPerMinute! - before.get(targetId)!) * 240).toBeCloseTo(6);
    expect(player(targetId).resourceTradeHoldings?.CONDUCTIVE_MINERALS).toBeUndefined();
    expect(player("seller").resourceTradeHoldings?.CONDUCTIVE_MINERALS ?? 0).toBe(1 - index);
  }
  expect(events.filter(event => event.eventType === "COMMAND_REJECTED")).toHaveLength(0);
  await runtime.submitCommand({ commandId: "third-conductive-contract", sessionId: "system-runtime:social", playerId: "buyer-one", clientSeq: 0, issuedAt: now, type: "SETTLE_DIPLOMACY_TERMS", payloadJson: JSON.stringify({ proposerId: "seller", targetId: "buyer-one", proposerPays: { gold: 0, shard: 0, resources: { CONDUCTIVE_MINERALS: 1 } }, targetPays: { gold: 0, shard: 0 } }) });
  expect(events.some(event => event.eventType === "COMMAND_REJECTED" && event.commandId === "third-conductive-contract")).toBe(true);
});
