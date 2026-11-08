import { describe, expect, it } from "vitest";
import { systemInfoFor } from "./client-space-view-system-info.js";

describe("systemInfoFor", () => {
  const rival = { seasonId: "kel", tier: "PLANET" as const, label: "Kel", state: "other" as const, ownerKey: "duke:Sigrid" };
  it("says who holds a rival system, and why it smokes when it does (§31)", () => {
    expect(systemInfoFor(rival).stateText).toBe("Held by Sigrid.");
    expect(systemInfoFor(rival, "Smoking: a rival's raid got through 2h ago and cost it 20 Stability.").stateText).toBe(
      "Held by Sigrid. Smoking: a rival's raid got through 2h ago and cost it 20 Stability."
    );
  });
});
