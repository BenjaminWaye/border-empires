// "Auto-garrison" and "Auto-improve" settings-panel cards: the same per-category
// and per-resource switches the tile-menu / Place checkboxes set (shared
// auto-settle-prefs.ts, auto-improve-prefs.ts), editable any time. Bound through
// one document-level change listener so the HUD's re-rendered settings HTML
// needs no per-render binding (client-hud.ts is over the per-file line cap).
import { AUTO_IMPROVE_RESOURCES, AUTO_SETTLE_CATEGORIES, isAutoImproveResource, type AutoSettleCategory } from "@border-empires/shared";
import { settingsToggleRowHtml } from "../client-hud/client-settings-controls.js";
import { autoSettleCategoryGroup, autoSettleCategoryLabel } from "./client-auto-settle-labels.js";
import type { ClientAutoSettleState } from "./client-auto-settle-prefs.js";
import { autoImproveStructureLabel } from "../client-hud-v2/client-resource-improvement-action.js";

const HINTS: Partial<Record<AutoSettleCategory, string>> = {
  towns: "Also garrisons the plain tiles around a grown town."
};

export const autoSettleSettingsFieldHtml = (autoSettle: ClientAutoSettleState): string => {
  if (autoSettle.status !== "loaded") {
    return `
    <div class="settings-auto-settle-field">
      <p class="settings-section-title">Auto-garrison</p>
      <p class="settings-field-hint">Loading your auto-garrison choices…</p>
    </div>`;
  }
  const current = autoSettle.prefs;
  return `
    <div class="settings-auto-settle-field">
      <p class="settings-section-title">Auto-garrison</p>
      <p class="settings-field-hint">Spends manpower to garrison these tiles as soon as they're yours. Off means nothing garrisons until you click.</p>
      ${AUTO_SETTLE_CATEGORIES.map((category, index) => {
        const group = autoSettleCategoryGroup(category);
        const heading = index === 0 || autoSettleCategoryGroup(AUTO_SETTLE_CATEGORIES[index - 1]!) !== group
          ? `<p class="settings-field-hint settings-auto-settle-group">${group}</p>` : "";
        const hint = HINTS[category];
        return heading + settingsToggleRowHtml({
          attrs: `data-settings-auto-settle="${category}"`,
          checked: current[category],
          title: autoSettleCategoryLabel(category),
          ...(hint ? { hint } : {})
        });
      }).join("")}
    </div>
    <div class="settings-auto-settle-field">
      <p class="settings-section-title">Auto-improve</p>
      <p class="settings-field-hint">Builds the resource's improvement on every garrisoned tile of it, now and as you garrison more, whenever you have the tech, coin, manpower and a free slot.</p>
      ${AUTO_IMPROVE_RESOURCES.map((resource) =>
        settingsToggleRowHtml({
          attrs: `data-settings-auto-improve="${resource}"`,
          checked: current.improve[resource],
          title: autoSettleCategoryLabel(resource),
          hint: autoImproveStructureLabel(resource)
        })
      ).join("")}
    </div>`;
};

/** Installs the single delegated listener; `send` is the client's sendGameMessage. Idempotent per document. */
export const installAutoSettleSettingsBinding = (send: (payload: unknown) => boolean): void => {
  if (typeof document === "undefined") return;
  const doc = document as Document & { __autoSettleSettingsBound?: boolean };
  if (doc.__autoSettleSettingsBound) return;
  doc.__autoSettleSettingsBound = true;
  document.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target || !target.matches?.("[data-settings-auto-settle], [data-settings-auto-improve]")) return;
    const boxes = document.querySelectorAll<HTMLInputElement>("[data-settings-auto-settle]");
    const prefs = Object.fromEntries(AUTO_SETTLE_CATEGORIES.map((category) => [category, false])) as Record<AutoSettleCategory, boolean>;
    boxes.forEach((box) => {
      const category = box.dataset.settingsAutoSettle as AutoSettleCategory | undefined;
      if (category && category in prefs) prefs[category] = box.checked;
    });
    const improve: Record<string, boolean> = {};
    document.querySelectorAll<HTMLInputElement>("[data-settings-auto-improve]").forEach((box) => {
      const resource = box.dataset.settingsAutoImprove;
      if (isAutoImproveResource(resource)) improve[resource] = box.checked;
    });
    send({ type: "SET_AUTO_SETTLE_PREFS", ...prefs, ...(Object.keys(improve).length > 0 ? { improve } : {}) });
  });
};
