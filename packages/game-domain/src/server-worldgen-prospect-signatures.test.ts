import { describe, expect, it } from "vitest";
import { prospectSignatureAt } from "./server-worldgen-clusters.js";

describe("prospectSignatureAt", () => {
  it("derives clues only from generated strategic clusters and includes ordinary surrounding tiles", () => {
    const clusters = [
      { clusterId: "c1", clusterType: "DEEP_FOREST" as const, resourceType: "UMBRITE" as const, centerX: 10, centerY: 10, radius: 2, controlThreshold: 3 },
      { clusterId: "c2", clusterType: "FERTILE_PLAINS" as const, resourceType: "FARM" as const, centerX: 30, centerY: 30, radius: 3, controlThreshold: 3 }
    ];
    expect(prospectSignatureAt(10, 10, clusters, 100, 100)).toBe("BLACKWOOD_CANOPY");
    expect(prospectSignatureAt(16, 10, clusters, 100, 100)).toBe("BLACKWOOD_CANOPY");
    expect(prospectSignatureAt(25, 25, clusters, 100, 100)).toBeUndefined();
  });

  it("wraps broad prospect areas across world edges", () => {
    const clusters = [{ clusterId: "c1", clusterType: "BROKEN_HIGHLANDS" as const, resourceType: "TITANIUM" as const, centerX: 0, centerY: 0, radius: 2, controlThreshold: 3 }];
    expect(prospectSignatureAt(97, 0, clusters, 100, 100)).toBe("FERROUS_DUST");
  });
});
