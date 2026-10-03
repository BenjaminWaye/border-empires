import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression: 2026-10-03 the prod-shape gate failed with "database is locked" at
// the simulation's first open of a freshly cloned DB. `PRAGMA journal_mode = WAL`
// was the first statement to take a lock and ran BEFORE `PRAGMA busy_timeout`,
// so with SQLite's default 0ms timeout a concurrent opener (the gateway booting
// against the same file) made it fail instantly. busy_timeout must precede it.
// (Source-level check because Vitest's bundler cannot import modules that
// statically import `node:sqlite`.)
const here = dirname(fileURLToPath(import.meta.url));
const openers = ["../sqlite-db.ts", "../sqlite-command-store-worker/command-store-worker.ts"];

describe("gateway SQLite openers", () => {
  for (const relative of openers) {
    it(`${relative} sets busy_timeout before switching journal_mode`, () => {
      const source = readFileSync(resolve(here, relative), "utf8");
      const busy = source.indexOf("PRAGMA busy_timeout = 5000");
      const journal = source.indexOf("PRAGMA journal_mode = WAL");
      expect(busy).toBeGreaterThan(-1);
      expect(journal).toBeGreaterThan(-1);
      expect(busy).toBeLessThan(journal);
    });
  }
});
