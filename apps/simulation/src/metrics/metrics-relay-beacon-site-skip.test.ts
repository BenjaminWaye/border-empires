import { describe, expect, it } from "vitest";

import { createSimulationMetrics } from "./metrics.js";

describe("relay beacon site skip counter", () => {
  it("accumulates spacing skips into the snapshot and prometheus output", () => {
    const metrics = createSimulationMetrics();
    metrics.observeSimAiRelayBeaconSiteSkips({ spacing: 2 });
    metrics.observeSimAiRelayBeaconSiteSkips({ spacing: 3 });

    expect(metrics.snapshot()).toMatchObject({ simAiRelayBeaconSiteSkippedTotalByReason: { spacing: 5 } });
    expect(metrics.renderPrometheus()).toContain('sim_ai_relay_beacon_site_skipped_total{reason="spacing"} 5');
  });
});
