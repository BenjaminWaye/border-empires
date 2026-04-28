import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverWorldMobilitySource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./server-world-mobility.ts"), "utf8");
};

const functionBody = (source: string, functionName: string): string => {
  const start = source.indexOf(`const ${functionName} =`);
  if (start === -1) throw new Error(`Could not find function ${functionName}`);
  const arrow = source.indexOf("=>", start);
  if (arrow === -1) throw new Error(`Could not find arrow for ${functionName}`);
  const open = source.indexOf("{", arrow);
  if (open === -1) throw new Error(`Could not find opening brace for ${functionName}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`Could not find closing brace for ${functionName}`);
};

describe("server world mobility regression guard", () => {
  it("requires maintenance spawns to come from a substantial fog buffer", () => {
    const source = serverWorldMobilitySource();
    expect(source).toContain("const isValidMaintenanceBarbarianSpawnTile = (x: number, y: number): boolean =>");
    expect(source).toContain("hasBarbarianMaintenanceFogBuffer({ x, y, tileAt: playerTile, isOutOfSight: isOutOfSightOfAllPlayers })");
  });

  it("keeps maintenance spawns separated from nearby barbarian agents", () => {
    const source = serverWorldMobilitySource();
    expect(source).toContain("!hasNearbyBarbarianAgent(x, y, BARBARIAN_MAINTENANCE_MIN_AGENT_SEPARATION)");
  });

  it("filters missing adjacent barbarian target tiles before scoring defense", () => {
    const body = functionBody(serverWorldMobilitySource(), "chooseBarbarianTarget");
    expect(body).toContain(".filter((tile): tile is Tile => Boolean(tile))");
  });

  it("treats missing barbarian defense tiles as zero score instead of crashing", () => {
    const body = functionBody(serverWorldMobilitySource(), "barbarianDefenseScore");
    expect(body).toContain("if (!tile) return 0;");
  });

  it("passes both defender id and tile into barbarian ownership defense scoring", () => {
    const body = functionBody(serverWorldMobilitySource(), "barbarianDefenseScore");
    expect(body).toContain("ownershipDefenseMultiplierForTarget(defender.id, tile)");
  });

  it("uses cached dock-linked tile keys when validating dock crossings", () => {
    const source = serverWorldMobilitySource();
    expect(source).toContain("const validDockCrossingTarget = (fromDock: Dock, toX: number, toY: number, allowAdjacentToDock = true): boolean =>");
    expect(source).toContain("dockLinkedTileKeys(fromDock).some");
    expect(source).not.toContain("const validDockCrossingTarget = (fromDock: Dock, toX: number, toY: number, allowAdjacentToDock = true): boolean =>\n    dockLinkedDestinations(fromDock)");
  });

  it("searches dock origins across dock tiles instead of scanning all player territory", () => {
    const body = functionBody(serverWorldMobilitySource(), "findOwnedDockOriginForCrossing");
    expect(body).toContain("for (const [tileKey, dock] of docksByTile)");
    expect(body).not.toContain("for (const tk of actor.territoryTiles)");
  });
});
