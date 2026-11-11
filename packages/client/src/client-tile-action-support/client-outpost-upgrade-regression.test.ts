import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("starter fort and outpost regression guard", () => {
  it("keeps palisade and Relay Beacon available from the start and upgrades into the advanced versions", () => {
    const source =
      readFileSync(resolve(here, "../main.ts"), "utf8") +
      readFileSync(resolve(here, "../client-tile-action-logic/client-tile-action-logic.ts"), "utf8") +
      // build_siege_camp's action was extracted into its own file (500-line
      // cap on client-tile-action-logic.ts) -- see client-tile-action-siege-camp.ts.
      readFileSync(resolve(here, "../client-tile-action-logic/client-tile-action-siege-camp.ts"), "utf8") +
      // The Fortify / Siege rows list their tiers via the tier picker options.
      readFileSync(resolve(here, "../client-tile-action-logic/client-structure-tier-options.ts"), "utf8");

    // Palisade is the Fortify picker's first option on unfortified ground (no tech needed).
    expect(source).toContain('structureType: "PALISADE"');
    // A Palisade lives in tile.fort, so the same row upgrades it into the Fort tiers.
    expect(source).toContain('label: tile.fort ? "Upgrade fortification" : "Fortify"');
    expect(source).toContain('label: "Build Relay Beacon"');
    expect(source).toContain('label: tile.siegeBattery ? "Upgrade siege" : "Siege"');
  });
});
