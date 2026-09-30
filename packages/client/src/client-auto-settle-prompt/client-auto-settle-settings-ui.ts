// "Auto-settle" settings-panel card: the same per-category opt-in the join
// prompt sets (shared auto-settle-prefs.ts), editable any time. Bound through
// one document-level change listener so the HUD's re-rendered settings HTML
// needs no per-render binding (client-hud.ts is over the per-file line cap).
import { AUTO_SETTLE_CATEGORIES, DEFAULT_AUTO_SETTLE_PREFS, type AutoSettleCategory, type AutoSettlePrefs } from "@border-empires/shared";

const ROWS: Record<AutoSettleCategory, { label: string; hint: string }> = {
  towns: { label: "Towns & docks", hint: "Also settles the plain tiles around a grown town." },
  food: { label: "Food (farms, fish)", hint: "Keeps your towns fed." },
  resources: { label: "Other resources", hint: "Titanium, gems, umbrite." }
};

export const autoSettleSettingsFieldHtml = (prefs: AutoSettlePrefs | undefined): string => {
  const current = prefs ?? DEFAULT_AUTO_SETTLE_PREFS;
  return `
    <div class="settings-auto-settle-field">
      <p>Auto-settle</p>
      <p class="settings-field-hint">Spends manpower to settle these tiles as soon as they're yours. Off means nothing settles until you click.</p>
      ${AUTO_SETTLE_CATEGORIES.map(
        (category) => `
      <label class="row"><input type="checkbox" data-settings-auto-settle="${category}" ${current[category] ? "checked" : ""} /> ${ROWS[category].label}<span class="settings-field-hint"> ${ROWS[category].hint}</span></label>`
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
    if (!target || !target.matches?.("[data-settings-auto-settle]")) return;
    const boxes = document.querySelectorAll<HTMLInputElement>("[data-settings-auto-settle]");
    const prefs = { towns: false, food: false, resources: false };
    boxes.forEach((box) => {
      const category = box.dataset.settingsAutoSettle as AutoSettleCategory | undefined;
      if (category && category in prefs) prefs[category] = box.checked;
    });
    send({ type: "SET_AUTO_SETTLE_PREFS", ...prefs });
  });
};
