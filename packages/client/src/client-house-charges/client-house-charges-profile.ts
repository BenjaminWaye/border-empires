// The House Charges section of your own profile (HUD crest). Charges are
// private, so this is only ever rendered for your own profile; "Manage
// charges" opens the full Charges panel over it.
import { HOUSE_CHARGES_KEPT, type HouseChargesPayload } from "@border-empires/shared";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `null` means your own profile before charges are dealt. */
export const houseChargesProfileSectionHtml = (payload: HouseChargesPayload | null, nowMs: number): string => {
  const manage = '<button class="panel-btn" type="button" data-v2-open-charges>Manage charges</button>';
  if (!payload) return `<section class="v2p-panel"><h3>House Charges</h3><p class="v2p-none">Your House's sealed charges arrive once your AFC has landed.</p></section>`;
  if (payload.charges.length === 0) return `<section class="v2p-panel"><h3>House Charges</h3><p class="v2p-none">No charges for this world.</p></section>`;
  const kept = payload.charges.filter((charge) => charge.kept);
  const choosing = nowMs < payload.choiceClosesAt && payload.charges.length > Math.min(HOUSE_CHARGES_KEPT, payload.charges.length);
  const rows = kept
    .map((charge) => `<div><dt>${esc(charge.title)}</dt><dd>${charge.held ? "Held" : "Not held"}</dd></div>`)
    .join("");
  const note = choosing ? `<p class="v2p-none">You can still change which ${kept.length} you keep.</p>` : "";
  return `<section class="v2p-panel"><h3>House Charges</h3><dl class="v2p-rows">${rows}</dl>${note}${manage}</section>`;
};
