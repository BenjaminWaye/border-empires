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
  });
});
