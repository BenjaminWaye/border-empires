import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderCrystalAbilityInfoOverlay } from "../client-crystal-ability-info/client-crystal-ability-info.js";
import { tileActionButtonHtml } from "../client-tile-menu-html.js";
import type { TileActionDef } from "../client-types.js";
import { ABILITY_ICON_KEYS, abilityIconUrl, abilityKeyForTileAction } from "./client-ability-icons.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicFile = (url: string): string => resolve(here, "../../public", url.slice(1));

const action = (id: TileActionDef["id"]): TileActionDef => ({ id, label: id }) as TileActionDef;

describe("ability icons", () => {
  it("ships a drawn SVG for every ability", () => {
    expect(ABILITY_ICON_KEYS.length).toBe(15);
    for (const key of ABILITY_ICON_KEYS) {
      const file = publicFile(abilityIconUrl(key));
      expect(existsSync(file), key).toBe(true);
      expect(readFileSync(file, "utf8")).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
    }
  });

  it("maps Crystal-tab actions onto their ability", () => {
    expect(abilityKeyForTileAction("aether_lance")).toBe("aether_lance");
    expect(abilityKeyForTileAction("siphon_tile")).toBe("siphon");
    expect(abilityKeyForTileAction("retort_recast_umbrite")).toBe("retort_recasting");
    expect(abilityKeyForTileAction("cancel_siphon")).toBeUndefined();
    expect(abilityKeyForTileAction("build_manufactory")).toBeUndefined();
  });

  it("gives Survey Sweep and Aether Purge their own icon in the tile menu instead of the default tent", () => {
    expect(tileActionButtonHtml(action("survey_sweep"))).toContain('src="/icons/abilities/survey-sweep.svg"');
    expect(tileActionButtonHtml(action("aether_lance"))).toContain('src="/icons/abilities/aether-purge.svg"');
    expect(tileActionButtonHtml(action("survey_sweep"))).not.toContain("⛺");
  });

  it("shows the ability's icon on its info card", () => {
    const html = renderCrystalAbilityInfoOverlay("aether_emp", { formatCooldownShort: () => "1m" });
    expect(html).toContain('<div class="structure-info-art has-image"><img class="structure-info-image ability-info-image" src="/icons/abilities/aether-emp.svg"');
  });
});
