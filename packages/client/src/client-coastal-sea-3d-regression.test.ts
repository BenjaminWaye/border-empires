import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("coastal sea 3d regression", () => {
  it("routes explicit coastal sea terrain through the coastal mesh", () => {
    const source = clientSource("./client-map-3d.ts");

    expect(source).toContain('if (terrain === "SEA" || terrain === "COASTAL_SEA")');
    expect(source).toContain('if (terrain === "COASTAL_SEA")');
  });
});
