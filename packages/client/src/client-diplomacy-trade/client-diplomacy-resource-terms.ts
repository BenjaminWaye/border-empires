import { TRADABLE_SUPPLY_RESOURCES, hasResourceSupplyOffer, supplyResourceLabel, type DiplomacyTerms, type ResourceSupplyOffer } from "@border-empires/shared";

export function resourceTermsHtml(terms: DiplomacyTerms, available: ResourceSupplyOffer | undefined): string {
  if (!available) return "";
  return `<div class="diplomacy-resource-terms"><h3>Resource supply</h3>
    <p>Commit spare slots for the full term. Supply returns to its owner when the term ends.</p>
    <label class="diplomacy-supply-term">Supply term <select data-supply-duration aria-label="Resource supply term"><option value="12" ${terms.supplyDurationHours !== 24 ? "selected" : ""}>12 hours</option><option value="24" ${terms.supplyDurationHours === 24 ? "selected" : ""}>24 hours</option></select></label>
    <table><thead><tr><th scope="col">Resource <small>Available</small></th><th scope="col">You supply</th><th scope="col">You request</th></tr></thead><tbody>
      ${TRADABLE_SUPPLY_RESOURCES.map(resource => `<tr><th scope="row">${supplyResourceLabel(resource)} <small data-supply-available="${resource}">${available[resource] ?? 0} spare</small></th>
        ${(["give", "ask"] as const).map(side => `<td><input type="number" inputmode="numeric" min="0" max="10000" step="1" data-supply-${side}="${resource}" aria-label="${supplyResourceLabel(resource)} slots you ${side === "give" ? "supply" : "request"}" value="${terms[side].resources?.[resource] ?? 0}"></td>`).join("")}</tr>`).join("")}
    </tbody></table><p>Coin and Shards change hands once. Resources supply slots throughout the term. Both deliveries pause if either supplier cannot fulfil the deal.</p></div>`;
}
export function readResourceTerms(overlay: HTMLElement): Pick<DiplomacyTerms, "supplyDurationHours"> & { give: ResourceSupplyOffer; ask: ResourceSupplyOffer } {
  const read = (side: "give" | "ask"): ResourceSupplyOffer => {
    const values: ResourceSupplyOffer = {};
    for (const resource of TRADABLE_SUPPLY_RESOURCES) {
      const raw = Number(overlay.querySelector<HTMLInputElement>(`[data-supply-${side}="${resource}"]`)?.value ?? 0);
      if (Number.isFinite(raw) && raw > 0) values[resource] = Math.min(10000, Math.floor(raw));
    }
    return values;
  };
  const give = read("give"), ask = read("ask");
  return { give, ask, ...((hasResourceSupplyOffer(give) || hasResourceSupplyOffer(ask)) ?
    { supplyDurationHours: overlay.querySelector<HTMLSelectElement>("[data-supply-duration]")?.value === "24" ? 24 as const : 12 as const } : {}) };
}
export function writeResourceTerms(overlay: HTMLElement, terms: DiplomacyTerms): void {
  for (const side of ["give", "ask"] as const) for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    const field = overlay.querySelector<HTMLInputElement>(`[data-supply-${side}="${resource}"]`);
    if (field) field.value = String(terms[side].resources?.[resource] ?? 0);
  }
  const duration = overlay.querySelector<HTMLSelectElement>("[data-supply-duration]");
  if (duration) duration.value = String(terms.supplyDurationHours ?? 12);
}
export const resourceTermsEqual = (a: DiplomacyTerms, b: DiplomacyTerms): boolean =>
  (a.supplyDurationHours ?? 12) === (b.supplyDurationHours ?? 12) && TRADABLE_SUPPLY_RESOURCES.every(resource =>
    (a.give.resources?.[resource] ?? 0) === (b.give.resources?.[resource] ?? 0) && (a.ask.resources?.[resource] ?? 0) === (b.ask.resources?.[resource] ?? 0));
