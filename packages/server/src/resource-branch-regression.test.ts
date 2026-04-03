import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadTechTree } from "./tech-tree.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("resource branch regression guard", () => {
  it("keeps the anti-stall synthesis branch ordered and self-feeding", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    const byId = new Map(techs.map((tech) => [tech.id, tech]));

    expect(byId.get("toolmaking")?.cost).toEqual({ gold: 2000 });
    expect(byId.get("alchemy")?.effects).toMatchObject({
      unlockIronworks: true,
      unlockWoodenFort: true,
      unlockLightOutpost: true
    });
    expect(byId.get("crystal-lattices")?.requires).toBe("alchemy");
    expect(byId.get("crystal-lattices")?.cost).toMatchObject({ gold: 6500, iron: 60 });
    expect(byId.get("crystal-lattices")?.effects).toMatchObject({ unlockCrystalSynthesizer: true });
    expect(byId.get("workshops")?.effects).toMatchObject({ unlockQuartermaster: true });
    expect(byId.get("workshops")?.effects?.unlockIronworks).toBeUndefined();
    expect(byId.get("workshops")?.effects?.unlockCrystalSynthesizer).toBeUndefined();
    expect(byId.get("overload-protocols")?.requires).toBe("crystal-lattices");
    expect(byId.get("overload-protocols")?.effects).toMatchObject({ unlockSynthOverload: true });
    expect(byId.get("advanced-synthetication")?.requires).toBe("overload-protocols");
    expect(byId.get("advanced-synthetication")?.effects).toMatchObject({ unlockAdvancedSynthesizers: true });
  });

  it("keeps light outposts and siege outposts on the 1 minute battlefield timing", () => {
    const sharedConfigSource = readFileSync(resolve(here, "../../shared/src/config.ts"), "utf8");
    const serverMainSource = readFileSync(resolve(here, "./main.ts"), "utf8");

    expect(sharedConfigSource).toContain("export const LIGHT_OUTPOST_BUILD_MS = 60_000;");
    expect(sharedConfigSource).toContain("export const SIEGE_OUTPOST_BUILD_MS = 60_000;");
    expect(serverMainSource).toContain('if (structureType === "LIGHT_OUTPOST") return LIGHT_OUTPOST_BUILD_MS;');
    expect(serverMainSource).toContain('if (structureType === "WOODEN_FORT") return WOODEN_FORT_BUILD_MS;');
    expect(serverMainSource).toContain('structure.type !== "ADVANCED_IRONWORKS"');
    expect(serverMainSource).toContain('const baseSynthTypeForAdvanced =');
    expect(serverMainSource).toContain('if (structureType === "ADVANCED_QUARTERMASTER") return "QUARTERMASTER";');
  });
});
