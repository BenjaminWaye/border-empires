import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { buildPlayerDefensibilityMetrics } from "./player-defensibility-metrics.js";

/**
 * 2026-07-29 login-stall investigation: T/E (all-owned exposed-edge count)
 * is display-only — every gameplay consumer (integrityEconomyMult,
 * integrityGrowthMult) reads Ts/Es (settled-only). skipAllOwnedStats lets AI
 * callers (nobody ever reads their T/E) skip the all-owned pass. Pins that
 * Ts/Es stay IDENTICAL with or without the flag — only E (and T, which stops
 * incrementing) changes.
 */

const settled = (x: number, y: number, ownerId: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED" });

const frontier = (x: number, y: number, ownerId: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "FRONTIER" });

describe("buildPlayerDefensibilityMetrics — skipAllOwnedStats", () => {
  it("computes identical Ts/Es with and without skipAllOwnedStats, but E stays 0 when skipped", () => {
    const tiles = new Map<string, DomainTileState>([
      ["5,5", settled(5, 5, "player-1")],
      ["6,5", frontier(6, 5, "player-1")], // exposes 5,5's east edge as owned (not exposed)
      ["4,5", frontier(4, 5, "player-1")], // owned frontier to the west
      ["5,4", frontier(5, 4, "player-1")], // owned frontier north
      // South (5,6) left unowned/unset -> exposed on both passes
    ]);
    const ownedTileKeys = new Set(tiles.keys());

    const full = buildPlayerDefensibilityMetrics("player-1", tiles, ownedTileKeys, false);
    const skipped = buildPlayerDefensibilityMetrics("player-1", tiles, ownedTileKeys, true);

    // Settled-only stats (the ones that actually feed gameplay math) must be
    // byte-for-byte identical regardless of the flag.
    expect(skipped.Ts).toBe(full.Ts);
    expect(skipped.Es).toBe(full.Es);

    // T is cheap (a plain counter) so it's still tracked either way; only the
    // expensive exposedEdgesFor(..., false) call behind E is skipped.
    expect(skipped.T).toBe(full.T);
    expect(full.E).toBeGreaterThan(0);
    expect(skipped.E).toBe(0);
  });

  it("defaults to full (non-skipped) stats when the flag is omitted", () => {
    const tiles = new Map<string, DomainTileState>([["0,0", settled(0, 0, "player-1")]]);
    const metrics = buildPlayerDefensibilityMetrics("player-1", tiles, new Set(["0,0"]));
    expect(metrics.E).toBeGreaterThan(0); // all 4 neighbors unowned -> fully exposed
    expect(metrics.T).toBe(1);
  });
});
