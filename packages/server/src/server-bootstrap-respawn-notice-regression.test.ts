import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("server bootstrap respawn notice regression", () => {
  it("routes startup auto-respawns through the respawn notice helper", () => {
    const source = sourceFor("./main.ts");
    expect(source).toContain('preparePlayerRespawnNotice(p, "startup_recovery", "startup_player_bootstrap_respawn")');
  });
});
