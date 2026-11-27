import { describe, expect, it } from "vitest";
import { buildFrontierCombatPreview } from "@border-empires/shared";
import { tileFactsFor } from "../client-hud-v2/client-hud-v2-tile-facts.js";
import { describeMarchWinChance } from "../client-win-chance-paint-trigger.js";
import { besiegedOddsSuffix, targetShowsBesieged, townBesiegedFromKnownTiles } from "./client-town-siege.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";

// Playtest 2026-11-27: a rival town cut off to 0 coin/day still showed 29%
// capture odds. Siege now weakens it, and every odds display says "Besieged".
const keyFor = (x: number, y: number): string => `${x},${y}`;
const town = (): Tile => ({ x: 5, y: 5, terrain: "LAND", ownerId: "them", ownershipState: "SETTLED", townType: "MARKET" }) as Tile;

const knownTiles = (themKeepsPlot: boolean): Pick<ClientState, "tiles" | "me"> => {
  const tiles = new Map<string, Tile>([["5,5", town()]]);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const keep = themKeepsPlot && dx === 1 && dy === 1;
      tiles.set(keyFor(5 + dx, 5 + dy), { x: 5 + dx, y: 5 + dy, terrain: "LAND", ownerId: keep ? "them" : "me", ownershipState: keep ? "SETTLED" : "FRONTIER" } as Tile);
    }
  }
  return { tiles, me: "me" };
};

const breakdownFor = (townBesieged: boolean): NonNullable<TileMenuView["combatBreakdown"]> => {
  const preview = buildFrontierCombatPreview({ terrain: "LAND", ownershipState: "SETTLED", townType: "MARKET", townBesieged });
  return { winChance: preview.winChance, attacker: preview.attacker, defender: preview.defender };
};

describe("besieged town odds display", () => {
  it("tags the town sheet's odds from the server preview's breakdown", () => {
    const besieged = tileFactsFor(town(), { combatBreakdown: breakdownFor(true), overviewLines: [] }, "me");
    const supplied = tileFactsFor(town(), { combatBreakdown: breakdownFor(false), overviewLines: [] }, "me");
    const odds = (facts: ReturnType<typeof tileFactsFor>) => facts.find((f) => f.label === "Odds")?.value ?? "";
    expect(odds(besieged)).toMatch(/^\d+% · Besieged$/);
    expect(odds(supplied)).toMatch(/^\d+%$/);
    expect(Number.parseInt(odds(besieged), 10)).toBeGreaterThan(Number.parseInt(odds(supplied), 10));
  });

  it("prefers the server's verdict and falls back to the known tiles", () => {
    const ringed = knownTiles(false);
    expect(townBesiegedFromKnownTiles(town(), ringed)).toBe(true);
    expect(townBesiegedFromKnownTiles(town(), knownTiles(true))).toBe(false);
    expect(targetShowsBesieged(town(), ringed, breakdownFor(false))).toBe(false);
    expect(targetShowsBesieged(town(), knownTiles(true), breakdownFor(true))).toBe(true);
    expect(targetShowsBesieged(town(), ringed, undefined)).toBe(true);
    expect(besiegedOddsSuffix(false)).toBe("");
  });

  it("tags the march confirm line and raises its estimate", () => {
    const pct = (text: string): number => Number(/Win chance (\d+)%/.exec(text)?.[1]);
    const commit = { committedManpower: 60, baseMusterCost: 60 };
    const besieged = describeMarchWinChance(knownTiles(false), { x: 5, y: 5 }, keyFor, commit);
    const supplied = describeMarchWinChance(knownTiles(true), { x: 5, y: 5 }, keyFor, commit);
    expect(besieged).toMatch(/^Win chance \d+% · Besieged at \(5, 5\)/);
    expect(supplied).not.toContain("Besieged");
    expect(pct(besieged)).toBeGreaterThan(pct(supplied));
  });
});
