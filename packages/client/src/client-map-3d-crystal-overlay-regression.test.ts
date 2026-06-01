import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d crystal overlays regression guard", () => {
  it("keeps shard overlay variants and deterministic hash selection", () => {
    const source = clientSource("./client-map-3d-shard-overlay.ts");
    expect(source).toContain("VARIANT_SPIRE");
    expect(source).toContain("VARIANT_CLUSTER");
    expect(source).toContain("VARIANT_SHATTERED");
    expect(source).toContain("tileHash");
  });

  it("keeps crystal ability overlay mappings for all major buckets", () => {
    const source = clientSource("./client-map-3d-crystal-ability-overlay.ts");
    expect(source).toContain("ABILITY_PARTS");
    expect(source).toContain("siphon");
    expect(source).toContain("aether_wall");
    expect(source).toContain("survey_sweep");
  });
});
