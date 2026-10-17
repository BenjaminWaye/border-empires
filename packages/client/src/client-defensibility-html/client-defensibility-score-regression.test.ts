import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceOf = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

describe("defensibility score regression guard", () => {
  it("computes the HUD percentage fallback with the server's shared empireIntegrity (grace floor included)", () => {
    // Was pinned to the raw defensivenessMultiplier curve, which skips the
    // new-empire grace floor -- a small empire then showed ~80% on the HUD
    // while the server held it at 90%+ (playtest report).
    expect(sourceOf("../client-tech-panel-flow.ts")).toContain("integrityPctFromSettledCounts(t, e, state.defensibilityPct)");
    const helper = sourceOf("../client-integrity-pct/client-integrity-pct.ts");
    expect(helper).toContain("empireIntegrity(t, e) * 100");
    expect(helper).not.toContain("defensivenessMultiplier(");
  });
});
