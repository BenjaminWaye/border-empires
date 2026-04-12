import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "../main.ts"), "utf8"),
    readFileSync(resolve(here, "../server-chunk-sync-runtime.ts"), "utf8")
  ].join("\n");
};

describe("login chunk regression guard", () => {
  it("skips duplicate identical subscribe requests while a chunk snapshot is already in flight", () => {
    const source = serverSource();
    expect(source).toContain("if (sameRequestedSub && chunkSnapshotInFlightByPlayer.has(actor.id))");
  });

  it("avoids full subscribed-view refreshes while a snapshot is already in flight", () => {
    const source = serverSource();
    expect(source).toContain("if (deps.chunkSnapshotInFlightByPlayer.has(playerId)) return;");
  });
});
