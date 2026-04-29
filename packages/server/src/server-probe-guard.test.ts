import { describe, expect, it } from "vitest";

import {
  collectStagingProbePlayerReports,
  collectUnboundHumanPlayerReports,
  isStagingProbePlayerName
} from "./server-probe-guard.js";

describe("server probe guard", () => {
  it("detects staging probe player names", () => {
    expect(isStagingProbePlayerName("staging-probe-1777477740581-12")).toBe(true);
    expect(isStagingProbePlayerName("Rowan Hale")).toBe(false);
  });

  it("reports only non-AI staging probe players", () => {
    const reports = collectStagingProbePlayerReports([
      {
        id: "probe-1",
        name: "staging-probe-1777477740581-12",
        profileComplete: false,
        territoryTiles: new Set(["0,0"])
      },
      {
        id: "human-1",
        name: "Rowan Hale",
        profileComplete: true,
        territoryTiles: new Set(["1,0", "1,1"])
      },
      {
        id: "ai-1",
        name: "staging-probe-1777477740581-99",
        isAi: true,
        profileComplete: true,
        territoryTiles: new Set(["2,0"])
      }
    ]);

    expect(reports).toEqual([
      {
        playerId: "probe-1",
        name: "staging-probe-1777477740581-12",
        territoryTiles: 1,
        profileComplete: false
      }
    ]);
  });

  it("reports completed human empires that have land but no auth binding", () => {
    const reports = collectUnboundHumanPlayerReports(
      [
        {
          id: "orphaned-1",
          name: "Respawn",
          profileComplete: true,
          territoryTiles: new Set(["19,255", "20,252"])
        },
        {
          id: "bound-1",
          name: "Rowan Hale",
          profileComplete: true,
          territoryTiles: new Set(["1,0"])
        },
        {
          id: "incomplete-1",
          name: "Probe Draft",
          profileComplete: false,
          territoryTiles: new Set(["2,0"])
        }
      ],
      [{ playerId: "bound-1" }]
    );

    expect(reports).toEqual([
      {
        playerId: "orphaned-1",
        name: "Respawn",
        territoryTiles: 2
      }
    ]);
  });
});
