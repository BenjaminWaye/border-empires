import { describe, expect, it } from "vitest";
import { buildAiTacticalView } from "./ai-tactical-view.js";
import { readAiSurveyObjective } from "./ai-survey-objective.js";
import { WORLD_WIDTH } from "@border-empires/shared";

describe("bounded per-player tactical view", () => {
  it("never reads the world or scans an empire once per candidate", () => {
    let reads = 0;
    const result = buildAiTacticalView({ focusKeys: Array.from({ length: 256 }, (_, i) => `${i},0`),
      isVisible: () => { reads++; return true; }, crystalDormancy: new Set(["5,6:observatory", "1,1:economicStructure"]), castRange: 20 });
    expect(reads).toBeLessThanOrEqual(16 * 121);
    expect(result.omittedOriginCount).toBe(240);
    expect(result.visibleTileKeys.length).toBeLessThanOrEqual(16 * 121);
    expect(result.dormantObservatoryKeys).toEqual(["5,6"]);
  });
  it("keeps visibility masks separate for each AI and wraps map edges", () => {
    const result = buildAiTacticalView({ focusKeys: ["0,0"], isVisible: key => key === `${WORLD_WIDTH - 1},0`, crystalDormancy: new Set(), castRange: 20 });
    expect(result.visibleTileKeys).toEqual([`${WORLD_WIDTH - 1},0`]);
  });
  it("turns legitimate survey intelligence into a short-lived expansion objective", () => {
    expect(readAiSurveyObjective(JSON.stringify({ center: { x: 0, y: 0 }, pings: [
      { x: 10, y: 0, kind: "resource" }, { x: WORLD_WIDTH - 1, y: 0, kind: "town" }
    ] }), 1000)).toEqual({ x: WORLD_WIDTH - 1, y: 0, expiresAt: 601000 });
    expect(readAiSurveyObjective('{"pings":[]}', 1000)).toBeUndefined();
  });
});
