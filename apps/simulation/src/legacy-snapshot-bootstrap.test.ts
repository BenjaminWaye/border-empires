import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadLegacySnapshotBootstrap } from "./legacy-snapshot-bootstrap.js";

const tempDirs: string[] = [];

const writeSnapshotDir = (suffix: string, overrides?: { territory?: Record<string, unknown> }) => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), `legacy-snapshot-${suffix}-`));
  tempDirs.push(snapshotDir);
  fs.writeFileSync(
    path.join(snapshotDir, "state.meta.json"),
    JSON.stringify({
      world: { width: 8, height: 8 },
      season: { seasonId: "season-test", worldSeed: 12345 }
    })
  );
  fs.writeFileSync(
    path.join(snapshotDir, "state.players.json"),
    JSON.stringify({
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          manpower: 100,
          manpowerUpdatedAt: 1_234,
          manpowerCapSnapshot: 150,
          points: 100,
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          techIds: [],
          domainIds: [],
          territoryTiles: [],
          allies: []
        }
      ],
      authIdentities: [{ uid: "uid-1", playerId: "player-1", name: "Nauticus" }]
    })
  );
  fs.writeFileSync(
    path.join(snapshotDir, "state.territory.json"),
    JSON.stringify({
      ownership: [["2,2", "player-1"], ["1,1", "player-1"], ["1,2", "player-1"], ["1,3", "player-1"], ["2,1", "player-1"], ["2,3", "player-1"], ["3,1", "player-1"], ["3,2", "player-1"], ["3,3", "player-1"]],
      ownershipState: [["2,2", "SETTLED"], ["1,1", "SETTLED"], ["1,2", "SETTLED"], ["1,3", "SETTLED"], ["2,1", "SETTLED"], ["2,3", "SETTLED"], ["3,1", "SETTLED"], ["3,2", "SETTLED"], ["3,3", "SETTLED"]],
      towns: [
        {
          tileKey: "2,2",
          type: "MARKET",
          population: 5000,
          maxPopulation: 10000,
          connectedTownCount: 0,
          connectedTownBonus: 0,
          isSettlement: false,
          lastGrowthTickAt: 0,
          name: "Home"
        }
      ],
      docks: [],
      clusters: [],
      ...(overrides?.territory ?? {})
    })
  );
  fs.writeFileSync(
    path.join(snapshotDir, "state.economy.json"),
    JSON.stringify({
      resources: [["player-1", { GOLD: 100 }]],
      strategicResources: [["player-1", { FOOD: 10, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }]],
      strategicResourceBuffer: [],
      tileYield: []
    })
  );
  fs.writeFileSync(path.join(snapshotDir, "state.systems.json"), JSON.stringify({}));
  return snapshotDir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("loadLegacySnapshotBootstrap", () => {
  it("includes long peace growth modifiers for fed settled towns without active shocks", () => {
    const snapshotDir = writeSnapshotDir("peace");
    const bootstrap = loadLegacySnapshotBootstrap(snapshotDir);
    const homeTile = bootstrap.initialState.tiles.find((tile) => tile.x === 2 && tile.y === 2);
    expect(homeTile?.town?.growthModifiers).toEqual([
      expect.objectContaining({ label: "Long time peace" })
    ]);
  });

  it("includes recently captured modifier when capture shock is active", () => {
    const snapshotDir = writeSnapshotDir("capture-shock", {
      territory: { townCaptureShock: [["2,2", Date.now() + 60_000]] }
    });
    const bootstrap = loadLegacySnapshotBootstrap(snapshotDir);
    const homeTile = bootstrap.initialState.tiles.find((tile) => tile.x === 2 && tile.y === 2);
    expect(homeTile?.town?.growthModifiers).toEqual([
      expect.objectContaining({ label: "Recently captured" })
    ]);
  });

  it("preserves manpower recovery timestamps from the legacy snapshot", () => {
    const snapshotDir = writeSnapshotDir("manpower-state");
    const bootstrap = loadLegacySnapshotBootstrap(snapshotDir);
    const player = bootstrap.players.get("player-1");
    expect(player).toEqual(
      expect.objectContaining({
        manpower: 100,
        manpowerUpdatedAt: 1_234,
        manpowerCapSnapshot: 150
      })
    );
  });
});
