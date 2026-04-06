import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

describe("login and frontier retry regression guard", () => {
  it("backs off forced initial chunk resubscribe retries while the first chunk is still pending", () => {
    const source = clientSource("./client-view-refresh.ts");
    expect(source).toContain("const forcedRetryCooldownMs = stillWaitingForInitialChunks ? 8_000 : 30_000;");
  });

  it("waits for sync instead of immediately retrying the same neutral frontier capture on missing combat start", () => {
    const source = clientSource("./client-runtime-loop.ts");
    expect(source).toContain('No combat start from server yet; waiting for frontier sync instead of retrying the same tile.');
    expect(source).toContain("frontierSyncWaitUntilByTarget.set(currentKey, Date.now() + 6_000);");
  });

  it("does not re-dispatch a queued frontier target while that target is still waiting on server sync", () => {
    const source = clientSource("./client-queue-logic.ts");
    expect(source).toContain("const frontierSyncWaitUntil = state.frontierSyncWaitUntilByTarget.get(targetKey) ?? 0;");
    expect(source).toContain("if (frontierSyncWaitUntil > Date.now()) {");
    expect(source).toContain("state.actionQueue.push(blocked);");
  });

  it("uses a local radius-1 refresh while waiting for delayed frontier confirmation", () => {
    const source = clientSource("./client-runtime-loop.ts");
    const occurrences = [...source.matchAll(/requestViewRefresh\(1, true\);/g)].length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});
