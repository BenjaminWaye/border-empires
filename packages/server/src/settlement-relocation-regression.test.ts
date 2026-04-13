import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readServerSource = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

describe("settlement relocation regression guard", () => {
  it("tracks settled age so oldest settled tile can be chosen deterministically", () => {
    const mainSource = readServerSource("./main.ts");
    const settlementFlowSource = readServerSource("./server-settlement-flow.ts");
    expect(mainSource).toContain("const settledSinceByTile = new Map<TileKey, number>();");
    expect(settlementFlowSource).toContain("const oldestSettledSettlementCandidateForPlayer = (playerId: string): TileKey | undefined => {");
  });

  it("prevents abandoning a live settlement tile", () => {
    const source = readServerSource("./main.ts");
    expect(source).toContain('code: "UNCAPTURE_SETTLEMENT"');
    expect(source).toContain('message: "cannot abandon your settlement"');
  });

  it("seeds a settlement at spawn and recreates one only through the fallback helper", () => {
    const playerRuntimeSource = readServerSource("./server-player-runtime-support.ts");
    const settlementFlowSource = readServerSource("./server-settlement-flow.ts");
    expect(playerRuntimeSource).toContain('if (deps.townsByTile.has(deps.key(x, y))) return false;');
    expect(playerRuntimeSource).toContain('if (!deps.townsByTile.has(deps.key(x, y))) deps.createSettlementAtTile(player.id, deps.key(x, y));');
    expect(settlementFlowSource).toContain("const ensureFallbackSettlementForPlayer = (playerId: string): boolean => {");
  });

  it("repairs missing settlements and keeps the active settlement authoritative for the capital marker", () => {
    const settlementFlowSource = readServerSource("./server-settlement-flow.ts");
    const tileViewSource = readServerSource("./server-tile-view-runtime.ts");
    expect(settlementFlowSource).toContain("const activeSettlementTileKeyForPlayer = (playerId: string): TileKey | undefined =>");
    expect(settlementFlowSource).toContain("const ensureActiveSettlementForPlayer = (playerId: string): boolean => {");
    expect(settlementFlowSource).toContain("for (const candidate of [player.spawnOrigin, player.capitalTileKey, oldestSettledSettlementCandidateForPlayer(playerId)]) {");
    expect(tileViewSource).toContain("if (ownerId !== deps.BARBARIAN_OWNER_ID && deps.activeSettlementTileKeyForPlayer(ownerId) === tileKey) tile.capital = true;");
  });

  it("relocates captured settlement-tier towns instead of leaving them on the captured tile", () => {
    const ownershipSource = readServerSource("./server-ownership-runtime.ts");
    const settlementFlowSource = readServerSource("./server-settlement-flow.ts");
    expect(ownershipSource).toContain('if (oldOwner !== deps.BARBARIAN_OWNER_ID && capturedTown && deps.isRelocatableSettlementTown(capturedTown)) {');
    expect(ownershipSource).toContain("deps.relocateCapturedSettlementForPlayer(displacedSettlement.ownerId, displacedSettlement.town);");
    expect(settlementFlowSource).toContain('Boolean(town && townPopulationTierForTown(town) === "SETTLEMENT");');
    expect(settlementFlowSource).not.toContain("town.isSettlement && townPopulationTierForTown(town) === \"SETTLEMENT\"");
  });
});
