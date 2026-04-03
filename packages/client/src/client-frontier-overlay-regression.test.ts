import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("frontier overlay regression guard", () => {
  it("hides the post-timer overlay only for optimistic neutral expands", () => {
    const source = clientMainSource();
    expect(source).toContain('const awaitingNeutralExpand = awaitingResult && shouldPreserveOptimisticExpand(captureTargetKey);');
    expect(source).toContain('if (awaitingNeutralExpand) {');
    expect(source).toContain('"Resolving battle..."');
  });
});
