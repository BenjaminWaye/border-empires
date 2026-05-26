/**
 * Bench: PlayerCandidateIndex 20 anchors × r=5, 10000 lookups.
 * Threshold: p99 < 10µs per lookup (tracked via total duration / N).
 */
import { bench, describe } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { PlayerCandidateIndex } from "./player-candidate-index.js";

const N_ANCHORS = 20;
const N_LOOKUPS = 10_000;
const MAX_RADIUS = 5;

const mkTile = (x: number, y: number, ownerId?: string): DomainTileState => ({
  x, y, terrain: "LAND",
  ...(ownerId ? { ownerId, ownershipState: "FRONTIER" } : {})
});

// Build a tile map around a grid of anchors
const tiles = new Map<string, DomainTileState>();
const anchorKeys: string[] = [];
for (let i = 0; i < N_ANCHORS; i++) {
  const ax = 20 + i * 15;
  const ay = 20;
  anchorKeys.push(`${ax},${ay}`);
  for (let dy = -MAX_RADIUS; dy <= MAX_RADIUS; dy++) {
    for (let dx = -MAX_RADIUS; dx <= MAX_RADIUS; dx++) {
      const x = ax + dx;
      const y = ay + dy;
      const key = `${x},${y}`;
      if (!tiles.has(key)) {
        // Alternate enemy tiles
        const isEnemy = (dx + dy) % 3 === 0 && !(dx === 0 && dy === 0);
        tiles.set(key, mkTile(x, y, isEnemy ? "enemy" : undefined));
      }
    }
  }
}

// Build index
const buildIndex = () => {
  const idx = new PlayerCandidateIndex();
  for (const anchorKey of anchorKeys) {
    idx.registerAnchor(anchorKey, "p1", MAX_RADIUS, (k) => tiles.get(k));
  }
  return idx;
};

describe("PlayerCandidateIndex lookups", () => {
  bench("sortedAttackCandidates 10k lookups across 20 anchors", () => {
    const idx = buildIndex();
    for (let i = 0; i < N_LOOKUPS; i++) {
      idx.sortedAttackCandidates(anchorKeys[i % N_ANCHORS]!, MAX_RADIUS);
    }
  });

  bench("claimCandidates 10k lookups across 20 anchors", () => {
    const idx = buildIndex();
    for (let i = 0; i < N_LOOKUPS; i++) {
      const iter = idx.claimCandidates(anchorKeys[i % N_ANCHORS]!, MAX_RADIUS);
      let c = 0;
      for (const _ of iter) c++;
      void c;
    }
  });
});
