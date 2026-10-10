import { describe, expect, it } from "vitest";
import type { DomainPlayer } from "@border-empires/game-domain";

import type { LegacySnapshotBootstrap } from "../../../simulation/src/legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";
import { buildSeasonVictoryObjectives } from "./init-payload-season-victory.js";

const REVEALS: Record<string, string> = { leatherworking: "umbrite" };
const revealCategoryForTech = (techId: string): string | undefined => REVEALS[techId];

const domainPlayer = (id: string, techIds: string[]): DomainPlayer => ({
  id,
  isAi: false,
  name: id,
  points: 0,
  manpower: 0,
  techIds: new Set(techIds),
  domainIds: new Set(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set()
});

describe("buildSeasonVictoryObjectives (gateway login fallback)", () => {
  it("counts only settled, revealed resource tiles toward RESOURCE_MONOPOLY", () => {
    // Regression: this fallback had its own copy of the monopoly tally and
    // counted frontier tiles and unrevealed resources, same bug as the sim.
    const tiles: LegacySnapshotBootstrap["initialState"]["tiles"] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "UMBRITE" },
      { x: 2, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "UMBRITE" },
      { x: 3, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER", resource: "UMBRITE" },
      { x: 4, y: 0, terrain: "LAND", resource: "UMBRITE" }
    ];
    const snapshotBootstrap: LegacySnapshotBootstrap = {
      runtimeIdentity: {
        sourceType: "legacy-snapshot",
        seasonId: "season-1",
        worldSeed: 1,
        snapshotLabel: "test",
        fingerprint: "test",
        playerCount: 2,
        seededTileCount: tiles.length
      },
      players: new Map([
        ["player-1", domainPlayer("player-1", [])],
        ["player-2", domainPlayer("player-2", ["leatherworking"])]
      ]),
      playerProfiles: new Map(),
      authIdentities: [],
      docks: [],
      clusters: [],
      seedTiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, { x: tile.x, y: tile.y, terrain: tile.terrain }])),
      initialState: { tiles, activeLocks: [] }
    };
    const leaderboardOverall = [
      { id: "player-2", name: "Leader", tiles: 2, incomePerMinute: 10, techs: 1, score: 10, rank: 1 },
      { id: "player-1", name: "Runner Up", tiles: 2, incomePerMinute: 4, techs: 0, score: 4, rank: 2 }
    ];

    const objectives = buildSeasonVictoryObjectives(
      "player-1",
      snapshotBootstrap,
      { playerId: "player-1", tiles: [] },
      leaderboardOverall,
      revealCategoryForTech
    );
    const resourceMonopoly = objectives.find((objective) => objective.id === "RESOURCE_MONOPOLY");
    expect(resourceMonopoly?.leaderPlayerId).toBe("player-2");
    expect(resourceMonopoly?.progressLabel).toBe("1/5 UMBRITE");
    expect(resourceMonopoly?.selfProgressLabel).toBe("No resource control");
  });
});
