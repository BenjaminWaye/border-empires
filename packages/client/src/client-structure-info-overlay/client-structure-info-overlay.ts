// Structure-info modal: shown when a player clicks a structure name/badge
// anywhere in the UI (tech detail cards, tile menu, HUD). Extracted out of
// client-tech-detail-ui.ts (a file already at the 500-line growth limit) —
// this is a cohesive, self-contained piece of rendering with no dependency
// on the tech-detail card/modal logic it used to sit beside.
import type { StructureModifier } from "@border-empires/game-domain";
import { MONUMENT_COMPONENTS_BY_BASE, type StructureInfoKey } from "../client-map-display.js";

export const renderStructureInfoOverlay = (
  structureInfoKey: string,
  structureInfoForKey: (type: StructureInfoKey) => {
    title: string;
    detail: string;
    effects: string[];
    modifiers: StructureModifier[];
    glyph: string;
    placement: string;
    image?: string;
    costBits: string[];
    buildTimeLabel: string;
    upkeepBits?: string[];
    branch?: "War" | "Economy" | "Manpower" | "Aether";
  },
  ownedComponentTypes?: ReadonlySet<string>
): string => {
  const type = structureInfoKey as StructureInfoKey | "";
  if (!type) return "";
  const info = structureInfoForKey(type);
  const costHtml = info.costBits.length
    ? `<div class="structure-info-meta-card"><span>Cost</span><strong>${info.costBits.join(" · ")}</strong></div>`
    : "";
  const upkeepHtml = (info.upkeepBits ?? []).length
    ? `<div class="structure-info-meta-card"><span>Upkeep</span><strong>${(info.upkeepBits ?? []).join(" · ")}</strong></div>`
    : "";
  // Modifier lines reuse the same white-label/green-value styling as the
  // tile-overview popup (tile-overview-effect-name / tile-overview-effect-mod
  // is-{tone}) so both surfaces read identically for the same building.
  const modifiersHtml = info.modifiers.length
    ? `<section class="structure-info-section">
        <span class="structure-info-section-label">Modifiers</span>
        <ul class="structure-info-effects-list">
          ${info.modifiers
            .map(
              (modifier) =>
                `<li><span class="tile-overview-effect-name">${modifier.statLabel}:</span> <span class="tile-overview-effect-mod is-${modifier.tone}">${modifier.valueText}</span></li>`
            )
            .join("")}
        </ul>
      </section>`
    : "";
  const effectsHtml = info.effects.length
    ? `<section class="structure-info-section">
        <span class="structure-info-section-label">Effects</span>
        <ul class="structure-info-effects-list">
          ${info.effects.map((effect) => `<li>${effect}</li>`).join("")}
        </ul>
      </section>`
    : "";
  const artHtml = info.image
    ? `<div class="structure-info-art has-image"><img class="structure-info-image" src="${info.image}" alt="${info.title}" /></div>`
    : `<div class="structure-info-art"><div class="structure-info-glyph" aria-hidden="true">${info.glyph}</div></div>`;
  const components = MONUMENT_COMPONENTS_BY_BASE[type];
  const componentsHtml = components
    ? (() => {
        const ownedCount = components.filter((c) => ownedComponentTypes?.has(c.type)).length;
        return `<section class="structure-info-section structure-info-components">
        <span class="structure-info-section-label">Monument Components</span>
        <ul class="structure-info-components-list">
          ${components
            .map((c) => {
              const complete = ownedComponentTypes?.has(c.type) ?? false;
              return `<li class="${complete ? "structure-info-component-complete" : "structure-info-component-pending"}">⚙️ ${c.name} — ${complete ? "Complete" : "Not built"}</li>`;
            })
            .join("")}
        </ul>
        <p class="structure-info-components-summary">${ownedCount}/${components.length} — ${ownedCount === components.length ? "Monument Ready" : "Monument not ready"}</p>
      </section>`;
      })()
    : "";
  return `<div class="structure-info-backdrop" data-structure-info-close="backdrop"></div>
    <div class="structure-info-modal" role="dialog" aria-modal="true" aria-labelledby="structure-info-title">
      <button class="structure-info-close" type="button" aria-label="Close structure details" data-structure-info-close="button">×</button>
      <div class="structure-info-scroll">
        <div class="structure-info-hero">
          ${artHtml}
          <div class="structure-info-head">
            <div class="structure-info-kicker">Structure${info.branch ? ` <span class="tech-branch-tag tech-branch-tag-${info.branch.toLowerCase()}">${info.branch}</span>` : ""}</div>
            <h3 id="structure-info-title">${info.title}</h3>
            <p>${info.detail}</p>
          </div>
        </div>
        ${componentsHtml}
        ${modifiersHtml}
        ${effectsHtml}
        <div class="structure-info-meta">
          ${costHtml}
          ${upkeepHtml}
          <div class="structure-info-meta-card"><span>Build time</span><strong>${info.buildTimeLabel}</strong></div>
          <div class="structure-info-meta-card"><span>Placement</span><strong>${info.placement}</strong></div>
        </div>
      </div>
    </div>`;
};
