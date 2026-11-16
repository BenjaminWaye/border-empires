import { describe, expect, it } from "vitest";
import { manifestGoldCost, techGoldCostForResearchedCount } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";
import { goldCostForTechResearch } from "../tech-wonder-gold-discount.js";
import { buildTechUpdatePayload } from "../tech-domain-bridge/tech-domain-bridge.js";

type CatalogPayload = { manifestGoldDiscount?: number; techCatalog: Array<{ requirements: { gold: number; goldBeforeDiscount?: number; goldDiscountFraction?: number } }> };

// Playtest 2026-11-16 (deferred in PR #2792): the Calculating Engine took 10% off
// what a Manifest was charged, but every displayed price stayed at the full
// table price, and nothing re-priced the catalog when the wonder changed hands.
describe("Calculating Engine Manifest discount", () => {
  it("prices the catalog exactly as the commission is charged", () => {
    const discounted = buildPlayer("p1", { techIds: new Set(["a", "b"]), wonderTechGoldDiscount: 0.1 });
    const full = buildPlayer("p2", { techIds: new Set(["a", "b"]) });
    const payload = buildTechUpdatePayload(discounted, []) as unknown as CatalogPayload;
    const charged = goldCostForTechResearch(discounted, {});
    expect(charged).toBe(Math.ceil(techGoldCostForResearchedCount(2) * 0.9));
    expect(charged).toBeLessThan(goldCostForTechResearch(full, {}));
    expect(payload.techCatalog[0]?.requirements).toMatchObject({ gold: charged, goldBeforeDiscount: techGoldCostForResearchedCount(2), goldDiscountFraction: 0.1 });
    expect(payload.manifestGoldDiscount).toBe(0.1);
    const fullPayload = buildTechUpdatePayload(full, []) as unknown as CatalogPayload;
    expect(fullPayload.techCatalog[0]?.requirements.gold).toBe(goldCostForTechResearch(full, {}));
    expect(fullPayload.techCatalog[0]?.requirements).not.toHaveProperty("goldBeforeDiscount");
  });

  it("re-sends the discounted catalog when the House garrisons the Calculating Engine", async () => {
    const scheduledTasks: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 1, y: 0, terrain: "LAND", naturalWonder: { type: "CALCULATING_ENGINE" } }
        ] as never,
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);
    const run = async (commandId: string, clientSeq: number, type: "EXPAND" | "SETTLE", payload: object): Promise<void> => {
      runtime.submitCommand({ commandId, sessionId: "session-1", playerId: "player-1", clientSeq, issuedAt: 1_000, type, payloadJson: JSON.stringify(payload) });
      await Promise.resolve();
      for (const task of scheduledTasks.splice(0)) task();
    };
    await run("expand-wonder", 1, "EXPAND", { fromX: 0, fromY: 0, toX: 1, toY: 0 });
    await run("settle-wonder", 2, "SETTLE", { x: 1, y: 0 });

    const techUpdates = events.filter((event) => event.eventType === "TECH_UPDATE" && event.playerId === "player-1");
    const latest = JSON.parse((techUpdates.at(-1) as { payloadJson: string }).payloadJson) as CatalogPayload;
    expect(latest.manifestGoldDiscount).toBe(0.1);
    expect(latest.techCatalog[0]?.requirements.gold).toBe(manifestGoldCost(0, 0.1));
    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.wonderTechGoldDiscount).toBe(0.1);
  });
});
