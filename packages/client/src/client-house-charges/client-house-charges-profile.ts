// The House Charges section of your own profile (HUD crest). Charges are
// private, so this is only ever rendered for your own profile; "Manage
// charges" opens the full Charges panel over it.
import { HOUSE_CHARGES_KEPT, type HouseChargesPayload } from "@border-empires/shared";
import { HOUSE_CHARGES_HINT } from "../client-hud-v2/client-hud-v2-hints.js";
import { formatHouseChargeWhen, houseChargeHeldStatus } from "./client-house-charges-status.js";
import { manageChargesCalloutActive } from "./client-house-charges-profile-tip.js";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * `null` means your own profile before charges are dealt. Each kept row reads exactly as the Charges card's
 * status does ("Held since Wed 21:29", client-house-charges-status.ts); `formatWhen` is pinned only by tests.
 */
export const houseChargesProfileSectionHtml = (payload: HouseChargesPayload | null, nowMs: number, formatWhen: (epochMs: number) => string = formatHouseChargeWhen): string => {
  // After "Show me" in the Charges panel (client-house-charges-profile-tip.ts) the button glows for a few seconds.
  const callout = manageChargesCalloutActive(nowMs) ? " is-callout" : "";
  const manage = `<button class="panel-btn hc-manage${callout}" type="button" data-v2-open-charges>Manage charges</button>`;
  if (!payload) return `<section class="v2p-panel"><h3>House Charges</h3><p class="v2p-none">Your House's sealed charges arrive once your AFC has landed.</p></section>`;
  if (payload.charges.length === 0) return `<section class="v2p-panel"><h3>House Charges</h3><p class="v2p-none">No charges for this world.</p></section>`;
  const kept = payload.charges.filter((charge) => charge.kept);
  const choosing = nowMs < payload.choiceClosesAt && payload.charges.length > Math.min(HOUSE_CHARGES_KEPT, payload.charges.length);
  // Before a keep is recorded there may be no kept rows; say so rather than an empty list.
  const rows = kept.length === 0 ? `<div><dt>None kept yet</dt><dd></dd></div>` : kept
    .map((charge) => `<div><dt>${esc(charge.title)}</dt><dd>${esc(houseChargeHeldStatus(charge, formatWhen).text)}</dd></div>`)
    .join("");
  const note = choosing ? `<p class="v2p-none">You can still change which ${HOUSE_CHARGES_KEPT} you keep.</p>` : "";
  // Manage charges leads, so it is never below the fold.
  return `<section class="v2p-panel"><h3>House Charges</h3>${manage}<p class="v2p-none">${HOUSE_CHARGES_HINT}</p><dl class="v2p-rows">${rows}</dl>${note}</section>`;
};
