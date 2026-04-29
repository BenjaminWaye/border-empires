import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadTechTree } from "./tech-tree.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("monument and sky tech regression", () => {
  it("keeps Aether Towers before Sky Docks in the sky branch", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    const towers = techs.find((entry) => entry.id === "plastics");
    const skyDocks = techs.find((entry) => entry.id === "aeronautics");

    expect(towers?.name).toBe("Aether Towers");
    expect(towers?.prereqIds).toContain("grand-cartography");
    expect(skyDocks?.name).toBe("Sky Docks");
    expect(skyDocks?.prereqIds).toContain("plastics");
    expect(skyDocks?.prereqIds).not.toContain("grand-cartography");
  });

  it("keeps Signal Fires and Aegis Dome wired to their visible unlocks", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    const signalFires = techs.find((entry) => entry.id === "signal-fires");
    const aegisDome = techs.find((entry) => entry.id === "aegis-dome");
    const cryptography = techs.find((entry) => entry.id === "cryptography");
    const monumentCities = techs.find((entry) => entry.id === "imperial-roads");
    const astralDock = techs.find((entry) => entry.id === "astral-dock");
    const steelworking = techs.find((entry) => entry.id === "steelworking");
    const standingArmy = techs.find((entry) => entry.id === "standing-army");

    expect(signalFires?.effects).toMatchObject({ unlockAetherLance: true });
    expect(aegisDome?.effects).toMatchObject({ unlockAegisDome: true, unlockAegisLock: true });
    expect(cryptography?.effects).toMatchObject({ unlockAetherEmp: true });
    expect(monumentCities?.effects).toMatchObject({ unlockCityOverclock: true });
    expect(astralDock?.effects).toMatchObject({ unlockAstralDock: true, unlockAstralDockLaunch: true });
    expect(steelworking?.effects).toMatchObject({ unlockThunderBastion: true });
    expect(standingArmy?.effects).toMatchObject({ unlockDreadTower: true });
  });

  it("keeps the tech tree within the 7-tier layout", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    expect(Math.max(...techs.map((entry) => entry.tier ?? 1))).toBeLessThanOrEqual(7);
  });

  it("pins Resonance Grid to tier 6 and Worldbreaker Cannon to tier 7", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    const resonanceGrid = techs.find((entry) => entry.id === "radar");
    const worldbreakerCannon = techs.find((entry) => entry.id === "world-engine");
    const steelworking = techs.find((entry) => entry.id === "steelworking");
    const standingArmy = techs.find((entry) => entry.id === "standing-army");

    expect(resonanceGrid?.name).toBe("Resonance Grid");
    expect(resonanceGrid?.tier).toBe(6);
    expect(worldbreakerCannon?.name).toBe("Worldbreaker Cannon");
    expect(worldbreakerCannon?.tier).toBe(7);
    expect(steelworking?.tier).toBe(5);
    expect(standingArmy?.tier).toBe(6);
  });

  it("keeps a clear gold cost progression between tiers", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    const minGoldByTier = new Map<number, number>();
    const maxGoldByTier = new Map<number, number>();

    for (const tech of techs) {
      const gold = tech.cost?.gold ?? 0;
      const tier = tech.tier ?? 1;
      minGoldByTier.set(tier, Math.min(minGoldByTier.get(tier) ?? Number.POSITIVE_INFINITY, gold));
      maxGoldByTier.set(tier, Math.max(maxGoldByTier.get(tier) ?? 0, gold));
    }

    expect(maxGoldByTier.get(1)).toBeLessThan(minGoldByTier.get(2) ?? Number.POSITIVE_INFINITY);
    expect(maxGoldByTier.get(2)).toBeLessThan(minGoldByTier.get(3) ?? Number.POSITIVE_INFINITY);
    expect(maxGoldByTier.get(3)).toBeLessThan(minGoldByTier.get(4) ?? Number.POSITIVE_INFINITY);
    expect(maxGoldByTier.get(4)).toBeLessThan(minGoldByTier.get(5) ?? Number.POSITIVE_INFINITY);
    expect(maxGoldByTier.get(5)).toBeLessThan(minGoldByTier.get(6) ?? Number.POSITIVE_INFINITY);
    expect(maxGoldByTier.get(6)).toBeLessThanOrEqual(minGoldByTier.get(7) ?? Number.POSITIVE_INFINITY);
  });

  it("keeps each tier inside a tight gold band", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    const expectedBands = new Map<number, { min: number; max: number }>([
      [1, { min: 2000, max: 2500 }],
      [2, { min: 3500, max: 4500 }],
      [3, { min: 5500, max: 7500 }],
      [4, { min: 9000, max: 10500 }],
      [5, { min: 14500, max: 16000 }],
      [6, { min: 21000, max: 23000 }],
      [7, { min: 26000, max: 27000 }]
    ]);

    for (const [tier, band] of expectedBands) {
      const tierGold = techs.filter((entry) => entry.tier === tier).map((entry) => entry.cost?.gold ?? 0);
      expect(Math.min(...tierGold)).toBeGreaterThanOrEqual(band.min);
      expect(Math.max(...tierGold)).toBeLessThanOrEqual(band.max);
    }
  });

  it("keeps Rail Networks as the live post-port unlock instead of a second dock upgrade", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    const railNetworks = techs.find((entry) => entry.id === "global-trade-networks");

    expect(railNetworks?.name).toBe("Rail Networks");
    expect(railNetworks?.effects).toMatchObject({ unlockRailDepot: true });
    expect(railNetworks?.effects?.unlockCharteredPortsUpgrade).toBeUndefined();
  });

  it("keeps Aegis Lock exposed as a monument ability definition", () => {
    const source = readFileSync(resolve(here, "./server-game-constants.ts"), "utf8");

    expect(source).toContain('aegis_lock: {');
    expect(source).toContain('id: "aegis_lock"');
    expect(source).toContain('name: "Aegis Lock"');
    expect(source).toContain('requiredTechIds: ["aegis-dome"]');
  });

  it("keeps Rail Depot auto-settle wired in the server economy runtime", () => {
    const source = readFileSync(resolve(here, "./server-economic-operations.ts"), "utf8");

    expect(source).toContain('const settleNearestFrontierForRailDepot =');
    expect(source).toContain('if (structure.type === "RAIL_DEPOT") settleNearestFrontierForRailDepot(player, structure);');
    expect(source).toContain('if (distance > 20) continue;');
    expect(source).toContain('updateOwnership(x, y, player.id, "SETTLED");');
  });
});
