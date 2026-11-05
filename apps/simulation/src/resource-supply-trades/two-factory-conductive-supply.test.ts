import { expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

it("pledges one Implant Foundry site to one House, and the import can't be re-exported", async () => {
  const now = 100_000;
  const ids = ["seller", "buyer-one", "buyer-two"];
  const tiles: DomainTileState[] = [];
  for (const [index, id] of ids.entries()) {
    const x = 10 + index * 30;
    tiles.push({ x, y: 10, terrain: "LAND", ownerId: id, ownershipState: "SETTLED", town: { name: id, type: "MARKET", populationTier: "TOWN", population: 50_000, maxPopulation: 100_000 } });
    for (let offset = 0; offset < 12; offset++) tiles.push({ x: x + offset, y: 80, terrain: "LAND", ownerId: id, ownershipState: "SETTLED", resource: "FARM" });
  }
  tiles.push({ x: 20, y: 20, terrain: "LAND", ownerId: "seller", ownershipState: "SETTLED", resource: "CONDUCTIVE_MINERALS", economicStructure: { ownerId: "seller", type: "IMPLANT_FOUNDRY", status: "active" } });
  const runtime = new SimulationRuntime({ now: () => now, seedTiles: new Map(), initialState: { tiles, activeLocks: [] }, initialPlayers: new Map(ids.map(id => [id, buildPlayer(id, { points: 100, manpower: 0, manpowerUpdatedAt: now, landingReserveGranted: true, techIds: new Set(["organized-supply"]) })])) });
  const player = (id: string) => runtime.exportState().players.find(row => row.id === id)!;
  const events = collectEvents(runtime);
  const contract = (commandId: string, proposerId: string, targetId: string) => runtime.submitCommand({ commandId, sessionId: "system-runtime:social", playerId: targetId, clientSeq: 0, issuedAt: now, type: "SETTLE_DIPLOMACY_TERMS", payloadJson: JSON.stringify({ proposerId, targetId, proposerPays: { gold: 0, resources: { CONDUCTIVE_MINERALS: 1 } }, targetPays: { gold: 0 } }) });
  expect(player("seller").resourceTradeHoldings?.CONDUCTIVE_MINERALS).toBe(1);
  const before = player("buyer-one").manpowerRegenPerMinute!;
  await contract("first", "seller", "buyer-one");
  expect((player("buyer-one").manpowerRegenPerMinute! - before) * 240).toBeCloseTo(120);
  expect(player("seller").resourceTradeHoldings?.CONDUCTIVE_MINERALS).toBeUndefined();
  await contract("second", "seller", "buyer-two");
  await contract("re-export", "buyer-one", "buyer-two");
  expect(events.filter(event => event.eventType === "COMMAND_REJECTED").map(event => event.commandId).sort()).toEqual(["re-export", "second"]);
});
