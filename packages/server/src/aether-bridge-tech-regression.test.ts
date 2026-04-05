import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadTechTree } from "./tech-tree.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("aether bridge tech regression", () => {
  it("keeps the navigation tech node aligned with the Aether Bridge rename", () => {
    const techs = loadTechTree(resolve(here, "..")).techs;
    const tech = techs.find((entry) => entry.id === "navigation");

    expect(tech?.name).toBe("Aether Bridge");
    expect(tech?.description).toBe("Unlocks Aether Bridge.");
    expect(tech?.effects).toMatchObject({ unlockNavalInfiltration: true });
  });
});
