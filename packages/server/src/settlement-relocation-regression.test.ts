import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("settlement relocation regression guard", () => {
  it("tracks settled age so oldest settled tile can be chosen deterministically", () => {
    const source = serverMainSource();
    expect(source).toContain("const settledSinceByTile = new Map<TileKey, number>();");
    expect(source).toContain("const oldestSettledSettlementCandidateForPlayer = (playerId: string): TileKey | undefined => {");
  });

  it("prevents abandoning a live settlement tile", () => {
    const source = serverMainSource();
    expect(source).toContain('code: "UNCAPTURE_SETTLEMENT"');
    expect(source).toContain('message: "cannot abandon your settlement"');
  });

  it("seeds a settlement at spawn and recreates one only through the fallback helper", () => {
    const source = serverMainSource();
    expect(source).toContain('if (townsByTile.has(key(x, y))) return false;');
    expect(source).toContain('if (!townsByTile.has(key(x, y))) createSettlementAtTile(p.id, key(x, y));');
    expect(source).toContain("const ensureFallbackSettlementForPlayer = (playerId: string): boolean => {");
    expect(source).toContain("if (playerHasGrossGoldIncome(playerId)) return false;");
    expect(source).toContain("const candidate = oldestSettledSettlementCandidateForPlayer(playerId);");
  });

  it("keeps the active settlement authoritative for the capital marker without forced respawn on town growth", () => {
    const source = serverMainSource();
    expect(source).toContain("const activeSettlementTileKeyForPlayer = (playerId: string): TileKey | undefined =>");
    expect(source).toContain("if (ownerId !== BARBARIAN_OWNER_ID && activeSettlementTileKeyForPlayer(ownerId) === tk) tile.capital = true;");
    expect(source).toContain("const next = settlementTile ?? (isValidCapitalTile(player, previous) ? previous : chooseCapitalTileKey(player));");
    expect(source).not.toContain("ensureActiveSettlementForPlayer(player.id);");
  });

  it("relocates captured settlement-tier towns instead of leaving them on the captured tile", () => {
    const source = serverMainSource();
    expect(source).toContain('if (oldOwner !== BARBARIAN_OWNER_ID && isRelocatableSettlementTown(capturedTown)) {');
    expect(source).toContain("relocateCapturedSettlementForPlayer(displacedSettlement.ownerId, displacedSettlement.town);");
  });
});
