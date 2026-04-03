import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("defensibility score regression guard", () => {
  it("uses the shared defensiveness curve for the HUD percentage", () => {
    const source = clientMainSource();
    expect(source).toContain("exposureRatio(t, e) * 100");
  });
});
