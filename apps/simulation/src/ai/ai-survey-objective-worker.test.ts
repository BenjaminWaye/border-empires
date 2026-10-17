import { expect, it } from "vitest";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";

it("uses survey intelligence to change expansion direction and retains it across compact sync", async () => {
  const tiles: PlannerTileView[] = [
    { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
    { x: 9, y: 10, terrain: "LAND" }, { x: 11, y: 10, terrain: "LAND" }
  ];
  const player: PlannerPlayerView = { id: "ai-1", points: 500, manpower: 1000, hasActiveLock: false,
    tileCollectionVersion: 1, topologyVersion: 1, territoryTileKeys: ["10,10"], reachTileKeys: ["9,10", "10,10", "11,10"],
    frontierTileKeys: ["10,10"], hotFrontierTileKeys: ["10,10"], strategicFrontierTileKeys: [],
    buildCandidateTileKeys: [], pendingSettlementTileKeys: [], townTileKeys: [], activeDevelopmentProcessCount: 0,
    ownedTileCount: 1, frontierTileCount: 1, slotSupplyByResource: { FOOD: 10 }, slotDemandByResource: { FOOD: 0 } };
  let command: CommandEnvelope | undefined;
  const replies: Record<string, unknown>[] = [];
  const core = createAiPlannerWorkerCore(message => {
    if (message.type === "command" || message.type === "error") replies.push(message);
    if (message.type === "command" && message.command) command = message.command as CommandEnvelope;
  });
  try {
    core.handleMessage({ type: "init", worldView: { tiles, players: [player] } });
    for (const x of [20, 0]) {
      core.handleMessage({ type: "survey_result", playerId: "ai-1", payloadJson: JSON.stringify({ center: { x: 10, y: 10 }, pings: [{ x, y: 10, kind: "town" }] }) });
      core.handleMessage({ type: "sync_players", players: [{ id: "ai-1", manpower: 1000 }] });
      core.handleMessage({ type: "plan", playerId: "ai-1", clientSeq: x + 1, issuedAt: Date.now(), skipPreplan: true, decisionCooldowns: { BUILD_BEACON: true } });
      expect(command?.type, JSON.stringify(replies)).toBe("EXPAND");
      expect(JSON.parse(command!.payloadJson)).toMatchObject({ toX: x === 20 ? 11 : 9, toY: 10 });
    }
  } finally { await core.shutdown(); }
});
