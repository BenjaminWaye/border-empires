import { describe, expect, it } from "vitest";

import { applyServerReachUpdate } from "./client-reach-authoritative.js";
import { reachDiagnosticsFields } from "./client-reach-diagnostics.js";

describe("reachDiagnosticsFields", () => {
  it("reports that no REACH_UPDATE was ever applied", () => {
    expect(reachDiagnosticsFields({ serverReach: undefined, serverReachRevision: 0 })).toEqual({
      hasServerReach: false,
      serverReachRevision: 0,
      serverReachSize: null
    });
  });

  it("reports the applied server reach revision and size", () => {
    const state = { tiles: new Map(), me: "player-1", serverReach: undefined as Set<string> | undefined, serverReachRevision: 0 };
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1", "1,2", "2,2"], revision: 4 })).toBe(true);
    expect(reachDiagnosticsFields(state)).toEqual({ hasServerReach: true, serverReachRevision: 4, serverReachSize: 3 });
  });

  it("distinguishes an applied empty border from no border at all", () => {
    expect(reachDiagnosticsFields({ serverReach: new Set(), serverReachRevision: 2 })).toEqual({
      hasServerReach: true,
      serverReachRevision: 2,
      serverReachSize: 0
    });
  });
});
