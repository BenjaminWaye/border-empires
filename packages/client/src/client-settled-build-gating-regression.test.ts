import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("settled build gating regression guard", () => {
  it("keeps wooden forts and light outposts restricted to settled tiles in both menus", () => {
    const source =
      readFileSync(resolve(here, "./main.ts"), "utf8") +
      readFileSync(resolve(here, "./client-ui-controls.ts"), "utf8") +
      readFileSync(resolve(here, "./client-tile-action-logic.ts"), "utf8");

    expect(source).toContain('if (tile.ownershipState === "SETTLED" && !tile.fort && !tile.siegeOutpost && !tile.observatory && !tile.economicStructure && !isSettlementTile && !state.techIds.includes("masonry"))');
    expect(source).toContain('if (tile.ownershipState === "SETTLED" && !tile.fort && !tile.siegeOutpost && !tile.observatory && !tile.economicStructure && !isSettlementTile && !state.techIds.includes("leatherworking"))');
    expect(source).toContain('tile.ownerId === state.me &&\n    tile.ownershipState === "SETTLED" &&\n    isBorderOrDock');
    expect(source).toContain('tile.ownerId === state.me &&\n    tile.ownershipState === "SETTLED" &&\n    isBorderTileOnly');
    expect(source).toContain('(tile.resource === "IRON" || tile.resource === "GEMS")');
  });
});
