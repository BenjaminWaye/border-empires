import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../simulation-service/simulation-service.ts"), "utf8");
};

// parseSubscribeOptions moved to its own module (../parse-subscribe-options); the
// fullVisibility/trigger parsing assertions below check it there, everything else
// still lives in simulation-service.ts.
const parseSubscribeOptionsSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../parse-subscribe-options/parse-subscribe-options.ts"), "utf8");
};

describe("simulation service fog subscribe regression", () => {
  it("supports full-visibility subscribe snapshots for fog-admin reveal flows", () => {
    const file = source();
    const parseSubscribeOptionsFile = parseSubscribeOptionsSource();

    expect(file).toContain('options?: { includeWorldStatus?: boolean; fullVisibility?: boolean; trigger?: string; cacheSnapshot?: boolean }');
    expect(file).toContain('const seasonEnded = currentSeasonState.status === "ended";');
    expect(file).toContain('const useFullVisibility = options?.fullVisibility === true || seasonEnded;');
    expect(parseSubscribeOptionsFile).toContain('fullVisibility: parsed.fullVisibility === true');
    expect(parseSubscribeOptionsFile).toContain(
      '...(typeof parsed.trigger === "string" && parsed.trigger.length > 0 ? { trigger: parsed.trigger } : {})'
    );
    expect(file).toContain('fullVisibility: subscribeOptions.fullVisibility,');
    expect(file).toContain('...(subscribeOptions.trigger ? { trigger: subscribeOptions.trigger } : {})');
    // Snapshot is cached when not full-vis OR when explicitly requested (season-end warming).
    expect(file.match(/if \(!useFullVisibility \|\| options\?\.cacheSnapshot === true\) \{\s+const cacheStartedAt = Date\.now\(\);\s+setCachedSnapshot\(playerId, snapshot\);/g)).toHaveLength(1);
  });

  it("builds full-visibility snapshots inline and only routes fog-of-war logins through the worker pool", () => {
    const file = source();

    // Full-vis must bypass the snapshot build worker: the per-tile enrichment is
    // already memoised via sharedFullVisibilityTiles, so the worker would only
    // structured-clone the 202k-tile runtimeState/snapshot across the boundary
    // (~4s sync block per login — the post-season login lock).
    expect(file).toContain("const useWorkerBuild = snapshotBuildPool !== undefined && !useFullVisibility;");
    expect(file).toContain("if (useFullVisibility) simulationMetrics.incrementSimFullVisInlineBuild();");
    expect(file).toContain("const snapshot = useWorkerBuild");
  });
});
