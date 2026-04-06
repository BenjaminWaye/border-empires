import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const chunkSnapshotsSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./snapshots.ts"), "utf8");
};

describe("chunk bootstrap regression guard", () => {
  it("uses shell summary mode for deferred outer rings", () => {
    const source = chunkSnapshotsSource();
    expect(source).toContain('summaryMode: radius === deps.initialBootstrapRadius + 1 ? "thin" : "shell"');
  });

  it("serializes the single center bootstrap chunk directly instead of waiting on the serializer worker", () => {
    const source = chunkSnapshotsSource();
    expect(source).toContain("chunkInputs.length === 1 && chunkBatchBodies.length === 0");
    expect(source).toContain("deps.serializeChunkBatchDirect(chunkInputs)");
  });
});
