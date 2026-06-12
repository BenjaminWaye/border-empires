/**
 * Boundary guard: packages/game-domain must not import anything from
 * packages/server. Parse imports statically — no runtime execution needed.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => resolve(dir, f));
}

describe("game-domain boundary", () => {
  it("has no imports from packages/server", () => {
    const files = collectTsFiles(here);
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (src.includes("packages/server") || src.includes("./server-auth") || src.includes("./sim/service")) {
        violations.push(file);
      }
    }
    expect(violations, `game-domain files import from server: ${violations.join(", ")}`).toHaveLength(0);
  });
});
