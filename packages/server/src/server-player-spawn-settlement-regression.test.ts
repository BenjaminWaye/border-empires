import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("player spawn settlement regression guard", () => {
  it("only accepts spawn tiles that can host a real settlement", () => {
    const source = serverSource("./server-player-runtime-support.ts");
    expect(source).toContain(
      'if (tile.resource || tile.dockId || tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) return false;'
    );
    expect(source).toContain("if (!deps.townsByTile.has(tileKey)) deps.createSettlementAtTile(player.id, tileKey);");
    expect(source).toContain("const previousOwnerId = tile.ownerId;");
    expect(source).toContain("const previousOwnershipState = tile.ownershipState;");
    expect(source).toContain("deps.updateOwnership(x, y, previousOwnerId, previousOwnershipState);");
    expect(source).toContain("return false;");
  });

  it("describes broken no-settlement empires instead of failing silently", () => {
    const source = serverSource("./server-settlement-flow.ts");
    expect(source).toContain("const settlementRepairDiagnosticForPlayer = (playerId: string): { key: string; detail: string } | undefined => {");
    expect(source).toContain("eligible.sort((left, right) => left.localeCompare(right));");
    expect(source).toContain("blocked.sort((left, right) => left.localeCompare(right));");
    expect(source).toContain('detail: `Your empire has no active settlement. Eligible settled tile');
    expect(source).toContain('blocked.length > 0');
    expect(source).toContain('"Your empire has no active settlement, and no eligible settled tile was found."');
  });
});
