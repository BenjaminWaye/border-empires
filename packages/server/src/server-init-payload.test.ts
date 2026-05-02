import { describe, expect, it } from "vitest";

import { buildServerInitPayload } from "./server-init-payload.js";

describe("server init payload", () => {
  it("includes the settlement diagnostic when present", () => {
    expect(
      buildServerInitPayload(
        {
          type: "INIT" as const,
          player: { id: "player-1" },
          config: { width: 10, height: 10 }
        },
        {
          key: "missing-settlement:eligible:405,192",
          detail: "Eligible settled tile: 405,192."
        }
      )
    ).toEqual({
      type: "INIT",
      player: { id: "player-1" },
      config: { width: 10, height: 10 },
      settlementRepairDiagnostic: {
        key: "missing-settlement:eligible:405,192",
        detail: "Eligible settled tile: 405,192."
      }
    });
  });

  it("omits the settlement diagnostic when the empire is healthy", () => {
    expect(
      buildServerInitPayload(
        {
          type: "INIT" as const,
          player: { id: "player-1" },
          config: { width: 10, height: 10 }
        },
        undefined
      )
    ).toEqual({
      type: "INIT",
      player: { id: "player-1" },
      config: { width: 10, height: 10 }
    });
  });
});
