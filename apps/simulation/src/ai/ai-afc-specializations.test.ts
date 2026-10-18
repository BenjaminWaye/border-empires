import { describe, expect, it } from "vitest";
import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";
import { chooseAutomationPreplanCommand } from "./ai-preplan-command.js";

const own: PlannerTileView = { x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", afc: { ownerId: "ai-1", status: "active" } };
const player = (): PlannerPlayerView => ({
  id: "ai-1", points: 0, manpower: 100, afcUpgradeRuleset: "afc-v1", techIds: [[...techEntryById.values()].find(tech => tech.tier === 5)!.id], domainIds: [], hasActiveLock: false,
  tileCollectionVersion: 1, topologyVersion: 1, topologyDirtyTileKeys: [], territoryTileKeys: ["0,0"], reachTileKeys: ["0,0"], focusFrontTileKeys: [], frontierTileKeys: [], hotFrontierTileKeys: [], strategicFrontierTileKeys: [], buildCandidateTileKeys: [], pendingSettlementTileKeys: [], townTileKeys: [], activeDevelopmentProcessCount: 0, ownedTileCount: 1, frontierTileCount: 0, settledTileCount: 1, townCount: 0,
  slotSupplyByResource: { FOOD: 10, CRYSTAL: 10 }, slotDemandByResource: { FOOD: 0, CRYSTAL: 0 }
});
const plan = (p: PlannerPlayerView, tiles = [own], skipPreplan = false) => {
  const messages: Record<string, unknown>[] = [];
  const core = createAiPlannerWorkerCore(message => messages.push(message));
  core.handleMessage({ type: "init", worldView: { tiles, players: [p] } });
  core.handleMessage({ type: "plan", playerId: p.id, clientSeq: 1, issuedAt: 1000, skipPreplan });
  return messages.find(message => message.type === "command")?.command as { type: string; payloadJson: string } | undefined;
};
describe("AFC behavior in the real AI worker path", () => {
  it("chooses a free new-ruleset upgrade with zero Coin instead of repeatedly requesting a paid domain", () => {
    const command = plan(player());
    expect(command?.type).toBe("CHOOSE_DOMAIN");
    expect(JSON.parse(command!.payloadJson).domainId).toMatch(/^afc-.*-1$/);
  });
  it("waits for an active AFC instead of repeatedly sending an invalid installation", () => {
    expect(plan(player(), [{ ...own, afc: { ownerId: "ai-1", status: "under_construction" } }])?.type).not.toBe("CHOOSE_DOMAIN");
  });
  it("can Purge a masked flag signal without a hidden tile in its world view", () => {
    const p = player(); p.techIds = [...techEntryById.keys()]; p.domainIds = ["afc-oracle-5"];
    p.afcDetectedFlags = [{ x: 2, y: 0, ownerId: "enemy" }];
    p.tacticalView = { visibleTileKeys: ["0,0"], dormantObservatoryKeys: [], castRange: 20, omittedOriginCount: 0 };
    p.ownedStructureCounts = { OBSERVATORY: 1 };
    const command = plan(p, [{ ...own, observatory: { ownerId: "ai-1", status: "active", cooldownUntil: 0 } }], true);
    expect(command).toMatchObject({ type: "AETHER_LANCE", payloadJson: JSON.stringify({ x: 2, y: 0 }) });
  });
  it("uses paid recruitment when progress is complete, reserves are low and Coin is available", () => {
    const result = chooseAutomationPreplanCommand({ playerId: "ai-1", afcUpgradeRuleset: "afc-v1", points: 100, manpower: 0, techIds: [...techEntryById.keys()], domainIds: ["afc-exchequer-1", "afc-exchequer-2", "afc-exchequer-3", "afc-exchequer-4", "afc-exchequer-5"], ownedTiles: [own], hasActiveLock: false, clientSeq: 1, issuedAt: 1000, sessionPrefix: "ai-runtime" });
    expect(result.command).toMatchObject({ type: "RECRUIT_ANCILLARIES", payloadJson: JSON.stringify({ coin: 10 }) });
  });
});
