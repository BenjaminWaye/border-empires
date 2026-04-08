import { describe, expect, it } from "vitest";

import {
  cachedAiExecuteCandidate,
  clearAllAiExecuteCandidates,
  createAiExecuteCandidateCacheState
} from "./execute-candidate-cache.js";

describe("execute candidate cache", () => {
  it("reuses the same candidate while the territory version is unchanged", () => {
    const state = createAiExecuteCandidateCacheState();
    let builds = 0;

    const first = cachedAiExecuteCandidate(state, {
      playerId: "ai-1",
      version: 4,
      actionKey: "claim_scout_border_tile",
      victoryPath: "SETTLED_TERRITORY",
      build: () => {
        builds += 1;
        return {
          kind: "frontier" as const,
          originTileKey: "1,1",
          targetTileKey: "2,1"
        };
      }
    });

    const second = cachedAiExecuteCandidate(state, {
      playerId: "ai-1",
      version: 4,
      actionKey: "claim_scout_border_tile",
      victoryPath: "SETTLED_TERRITORY",
      build: () => {
        builds += 1;
        return null;
      }
    });

    expect(first).toEqual(second);
    expect(builds).toBe(1);
  });

  it("rebuilds candidates after a territory version change and supports full reset", () => {
    const state = createAiExecuteCandidateCacheState();
    let builds = 0;

    const first = cachedAiExecuteCandidate(state, {
      playerId: "ai-1",
      version: 2,
      actionKey: "settle_owned_frontier_tile",
      build: () => {
        builds += 1;
        return { kind: "tile" as const, tileKey: "9,9" };
      }
    });

    const second = cachedAiExecuteCandidate(state, {
      playerId: "ai-1",
      version: 3,
      actionKey: "settle_owned_frontier_tile",
      build: () => {
        builds += 1;
        return { kind: "tile" as const, tileKey: "10,10" };
      }
    });

    clearAllAiExecuteCandidates(state);

    const third = cachedAiExecuteCandidate(state, {
      playerId: "ai-1",
      version: 3,
      actionKey: "settle_owned_frontier_tile",
      build: () => {
        builds += 1;
        return { kind: "tile" as const, tileKey: "11,11" };
      }
    });

    expect(first).toEqual({ kind: "tile", tileKey: "9,9" });
    expect(second).toEqual({ kind: "tile", tileKey: "10,10" });
    expect(third).toEqual({ kind: "tile", tileKey: "11,11" });
    expect(builds).toBe(3);
  });
});
