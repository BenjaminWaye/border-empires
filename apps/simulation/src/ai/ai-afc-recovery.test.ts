import { expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { CombatLockIndex } from "../combat-lock-index/combat-lock-index.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { AFC_RECOVERY_SITE_SCAN_LIMIT, planAiAfcReplacement } from "./ai-afc-recovery.js";

it("bounds each recovery search and resumes beyond blocked earlier territory", () => {
  let reads = 0;
  class CountedTiles extends Map<string, DomainTileState> {
    override get(key: string): DomainTileState | undefined { reads++; return super.get(key); }
  }
  const tiles = new CountedTiles();
  const summary = createEmptyPlayerRuntimeSummary();
  for (let index = 0; index < 800; index++) {
    const x = index % 200, y = Math.floor(index / 200);
    const key = `${x},${y}`;
    tiles.set(key, { x, y, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "MANUFACTORY", status: "active" } });
    summary.territoryTileKeys.add(key);
  }
  tiles.set("300,100", { x: 300, y: 100, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" });
  summary.territoryTileKeys.add("300,100");
  const actor = buildPlayer("p", { isAi: true, points: 100 });
  const context = { tiles, locksByTile: new CombatLockIndex(), now: () => 1000, afcGlobalLosses: () => 1, summaryForPlayer: () => summary };
  for (let attempt = 0; attempt < 3; attempt++) {
    reads = 0;
    expect(planAiAfcReplacement(context, actor)).toBeUndefined();
    expect(reads).toBeLessThanOrEqual(AFC_RECOVERY_SITE_SCAN_LIMIT * 2);
  }
  reads = 0;
  expect(planAiAfcReplacement(context, actor)).toMatchObject({ type: "BUILD_AFC", payloadJson: JSON.stringify({ x: 300, y: 100 }) });
  expect(reads).toBeLessThanOrEqual(AFC_RECOVERY_SITE_SCAN_LIMIT * 27);
  expect(summary.afcRecoverySiteCursor).toBeUndefined();
});
