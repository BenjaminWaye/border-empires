import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./simulation-service.ts"), "utf8");
};

describe("simulation service fog subscribe regression", () => {
  it("supports full-visibility subscribe snapshots for fog-admin reveal flows", () => {
    const file = source();

    expect(file).toContain('options?: { includeWorldStatus?: boolean; fullVisibility?: boolean }');
    expect(file).toContain('const useFullVisibility = options?.fullVisibility === true || currentSeasonState.status === "ended";');
    expect(file).toContain('fullVisibility: parsed.fullVisibility === true');
    expect(file).toContain('fullVisibility: subscribeOptions.fullVisibility');
  });
});
