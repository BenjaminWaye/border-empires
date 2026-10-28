// The Aether ▸ sidebar on the map: the tile's aether abilities, drawn in the
// Build ▸ sidebar's panel and row style (client-hud-v2-build-list.ts). Each row
// casts its ability straight away (data-hud-v2-action), like the bar's buttons.

import { abilityIconHtml, abilityKeyForTileAction } from "../client-ability-icons/client-ability-icons.js";
import type { TileActionDef } from "../client-types.js";

export type AetherListInput = {
  abilities: readonly TileActionDef[];
  /** Shown top-right: the tile the abilities target. */
  focusLabel: string;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const targets = (a: TileActionDef): string =>
  `${a.targetKey ? ` data-target-key="${esc(a.targetKey)}"` : ""}${a.originKey ? ` data-origin-key="${esc(a.originKey)}"` : ""}`;

const rowHtml = (a: TileActionDef): string => {
  const key = abilityKeyForTileAction(a.id);
  const icon = key ? abilityIconHtml(key, "hud-v2-aether-ico") : "";
  const note = a.disabled ? a.disabledReason ?? "Unavailable" : a.cost ?? "";
  return `<button type="button" class="v2t-build hud-v2-aether-row${a.disabled ? " v2t-build-off" : ""}" data-hud-v2-action="${esc(a.id)}"${targets(a)}${a.disabled ? " disabled" : ""}>
      <span class="v2t-build-ico">${icon}</span>
      <span class="v2t-build-text"><span class="v2t-build-name">${esc(a.label)}</span>${a.detail ? `<span class="v2t-build-detail">${esc(a.detail)}</span>` : ""}${note ? `<span class="v2t-build-cost${a.disabled ? " v2t-warn" : ""}">${esc(note)}</span>` : ""}</span>
    </button>`;
};

export const aetherListHtml = (input: AetherListInput): string =>
  `<div class="v2t-build-head"><span class="v2t-build-title hud-v2-aether-title">Aether</span><span class="v2t-focus v2t-focus-on">${esc(input.focusLabel)}</span></div>
    <div class="v2t-build-list" data-v2-scroll="aether-list" aria-label="Aether abilities">${input.abilities.map(rowHtml).join("")}</div>`;
