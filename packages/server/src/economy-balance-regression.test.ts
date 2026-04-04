import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("economy balance regression guard", () => {
  it("keeps the reduced base gold values for towns and docks", () => {
    const source = serverSource();
    expect(source).toContain("const TOWN_BASE_GOLD_PER_MIN = 2;");
    expect(source).toContain("const DOCK_INCOME_PER_MIN = 0.5;");
  });
});
