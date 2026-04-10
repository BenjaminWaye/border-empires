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
    expect(source).toContain('No server acceptance arrived within 2s; waiting for frontier sync instead of retrying the same tile.');
    expect(source).toContain("frontierSyncWaitUntilByTarget.set(currentKey, Date.now() + 12_000);");
    expect(source).toContain("frontierSyncWaitUntilByTarget.set(timedOutCurrentKey, Date.now() + 12_000);");
  });

  it("does not re-dispatch a queued frontier target while that target is still waiting on server sync", () => {
    const source = clientSource("./client-queue-logic.ts");
    expect(source).toContain("const frontierSyncWaitUntil = state.frontierSyncWaitUntilByTarget.get(targetKey) ?? 0;");
    expect(source).toContain("if (frontierSyncWaitUntil > Date.now()) {");
    expect(source).toContain("state.actionQueue.push(blocked);");
  });

  it("clears queued frontier retries once combat or tile updates confirm the tile is now yours", () => {
    const source = clientSource("./client-network.ts");
    expect(source).toContain('state.frontierSyncWaitUntilByTarget.delete(tileKey);');
    expect(source).toContain('state.frontierSyncWaitUntilByTarget.delete(updateKey);');
    expect(source).toContain('state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== tileKey);');
    expect(source).toContain('state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== updateKey);');
  });

  it("hides the current frontier queue badge once the capture timer has elapsed", () => {
    const source = clientSource("./client-runtime-loop.ts");
    expect(source).toContain("const hideCurrentQueuedBadge =");
    expect(source).toContain("shouldHideQueuedFrontierBadge(");
    expect(source).toContain("Boolean(state.capture),");
    expect(source).toContain("if (state.actionInFlight && state.actionTargetKey && !hideCurrentQueuedBadge) {");
  });

  it("keeps the earlier optimistic frontier timer when combat start arrives late", () => {
    const source = clientSource("./client-network.ts");
    expect(source).toContain("const resolvesAtForCapture = existingCapture ? Math.min(existingCapture.resolvesAt, resolvesAt) : resolvesAt;");
    expect(source).toContain("state.capture = { startAt, resolvesAt: resolvesAtForCapture, target };");
  });

  it("uses a local radius-1 refresh while waiting for delayed frontier confirmation", () => {
    const source = clientSource("./client-runtime-loop.ts");
    const occurrences = [...source.matchAll(/requestViewRefresh\(1, true\);/g)].length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("forces a nearby refresh and warning alert when combat start or result goes missing for attacks", () => {
    const source = clientSource("./client-runtime-loop.ts");
    expect(source).toContain('showCaptureAlert("Attack sync delayed", "No server acceptance arrived within 2 seconds. Refreshing nearby tiles and retrying.", "warn");');
    expect(source).toContain('showCaptureAlert("Attack sync delayed", "No server acceptance arrived within 2 seconds. Refreshing nearby tiles to resync.", "warn");');
    expect(source).toContain('showCaptureAlert("Combat result delayed", "Refreshing nearby tiles because the server result did not arrive in time.", "warn");');
  });

  it("times out waiting for server acceptance after 2 seconds instead of waiting for combat start", () => {
    const source = clientSource("./client-runtime-loop.ts");
    expect(source).toContain("if (!state.actionAcceptedAck && Date.now() - started > 2_000) {");
    expect(source).toContain('attackSyncLog("action-accept-timeout"');
    expect(source).toContain('attackSyncLog("action-accept-timeout-refresh"');
  });
});
