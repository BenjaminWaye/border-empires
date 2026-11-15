// The Resources lens key. The lens paints each resource tile in its resource's
// colour (client-resource-lens.ts), but with no key a playtester could not tell
// titanium from fish or grain, nor that only tiles in sight are painted
// (2026-11-14 playtest), so the lens now shows one while it is on.
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "@border-empires/shared";
import { resourceColor } from "../client-map-display.js";

const BASE: ReadonlyArray<[string, string]> = [["FARM", "Grain"], ["FISH", "Fish"], ["TITANIUM", "Titanium"], ["GEMS", "Crystal"], ["UMBRITE", "Umbrite"]];

const ENTRIES: ReadonlyArray<[string, string]> = [...BASE, ...NETWORK_RESOURCES.map((r): [string, string] => [r, RESOURCE_NETWORKS[r].name])];

export const resourceLensLegendHtml = (): string =>
  `<div class="hud-v2-lens-legend" role="note" aria-label="Resources lens key">${ENTRIES.map(([key, label]) =>
    `<span class="hud-v2-lens-key"><i style="background:${resourceColor(key) ?? "transparent"}" aria-hidden="true"></i>${label}</span>`).join("")}<small>Tiles in sight only</small></div>`;
