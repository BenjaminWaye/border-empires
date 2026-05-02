import { describe, expect, it } from "vitest";

import { withSettlementRepairDiagnostic } from "./server-settlement-diagnostic-payload.js";

describe("server settlement diagnostic payload", () => {
  it("adds the diagnostic when one exists", () => {
    expect(
      withSettlementRepairDiagnostic(
        { type: "INIT", playerId: "player-1" },
        { key: "missing-settlement:eligible:405,192", detail: "Eligible settled tile: 405,192." }
      )
    ).toEqual({
      type: "INIT",
      playerId: "player-1",
      settlementRepairDiagnostic: {
        key: "missing-settlement:eligible:405,192",
        detail: "Eligible settled tile: 405,192."
      }
    });
  });

  it("leaves payloads unchanged when there is no diagnostic", () => {
    expect(withSettlementRepairDiagnostic({ type: "PLAYER_UPDATE", gold: 10 }, undefined)).toEqual({ type: "PLAYER_UPDATE", gold: 10 });
  });
});
