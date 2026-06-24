import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../simulation-service/simulation-service.ts"), "utf8");
};

describe("simulation service fog subscribe regression", () => {
  it("supports full-visibility subscribe snapshots for fog-admin reveal flows", () => {
    const file = source();

    expect(file).toContain('options?: { includeWorldStatus?: boolean; fullVisibility?: boolean; trigger?: string; cacheSnapshot?: boolean }');
    expect(file).toContain('const seasonEnded = currentSeasonState.status === "ended";');
    expect(file).toContain('const useFullVisibility = options?.fullVisibility === true || seasonEnded;');
    expect(file).toContain('fullVisibility: parsed.fullVisibility === true');
    expect(file).toContain('...(typeof parsed.trigger === "string" && parsed.trigger.length > 0 ? { trigger: parsed.trigger } : {})');
    expect(file).toContain('fullVisibility: subscribeOptions.fullVisibility,');
    expect(file).toContain('...(subscribeOptions.trigger ? { trigger: subscribeOptions.trigger } : {})');
    // Snapshot is cached when not full-vis OR when explicitly requested (season-end warming).
    expect(file.match(/if \(!useFullVisibility \|\| options\?\.cacheSnapshot === true\) \{\s+const cacheStartedAt = Date\.now\(\);\s+setCachedSnapshot\(playerId, snapshot\);/g)).toHaveLength(1);
  });
});
