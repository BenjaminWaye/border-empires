import { expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { planAiAfcReplacement } from "../ai/ai-afc-recovery.js";
import { CombatLockIndex } from "../combat-lock-index/combat-lock-index.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";

it("never substitutes neighbouring neutral land when the AI has no owned landing site", () => {
  const summary = createEmptyPlayerRuntimeSummary();
  summary.territoryTileKeys.add("10,10");
  const tiles = new Map<string, DomainTileState>([
    ["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } }],
    ["11,10", { x: 11, y: 10, terrain: "LAND" }]
  ]);
  const actor = buildPlayer("p", { isAi: true, points: 100 });
  const context = { tiles, summaryForPlayer: () => summary, now: () => 1000, locksByTile: new CombatLockIndex(), afcGlobalLosses: () => 1 };
  expect(planAiAfcReplacement(context, actor)).toBeUndefined();
  expect(tiles.get("11,10")?.ownerId).toBeUndefined();
  expect(actor.points).toBe(100);
});
