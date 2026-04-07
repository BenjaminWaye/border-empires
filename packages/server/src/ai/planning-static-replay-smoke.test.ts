import { describe, expect, it } from "vitest";
import { runPlanningStaticReplaySmoke } from "./planning-static-replay.js";
const replayIt = process.env.AI_REPLAY_SMOKE === "1" ? it : it.skip;

describe("planning static replay smoke", () => {
  replayIt(
    "keeps runtime debug responsive on a late-game snapshot without planning-static stalls",
    async () => {
      const result = await runPlanningStaticReplaySmoke();
      expect(result.startupReady, result.logs || "late-game replay did not reach startup readiness").toBe(true);
      expect(result.maxDebugElapsedMs).toBeLessThan(2_000);
      expect(result.logs).not.toContain("slow ai planning static cache");
      expect(result.planningSnapshotBreaches, JSON.stringify(result.planningSnapshotBreaches)).toHaveLength(0);
    },
    45_000
  );
});
