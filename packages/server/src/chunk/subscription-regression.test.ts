import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../main.ts"), "utf8");
};

describe("chunk subscribe regression guard", () => {
  it("keeps all large chunk subscriptions on the staged bootstrap path", () => {
    const source = serverMainSource();
    expect(source).toContain('if (sub.radius > INITIAL_CHUNK_BOOTSTRAP_RADIUS) {');
    expect(source).not.toContain("authSync && authSync.firstChunkSentAt === undefined && sub.radius > INITIAL_CHUNK_BOOTSTRAP_RADIUS");
  });
});
