import { TRADABLE_SUPPLY_RESOURCES, hasResourceSupplyOffer, supplyResourceLabel, type ResourceSupplyOffer, type ResourceSupplyAgreementStatus } from "@border-empires/shared";
import { resourceDeadlineHtml, resourceTradeServerNow } from "./client-resource-deadline.js";
import { RESOURCE_END_ARMED_LABEL, resourceEndIsArmed } from "./client-resource-end-confirm.js";

const quantities = (offer: ResourceSupplyOffer): string => TRADABLE_SUPPLY_RESOURCES.flatMap(resource => {
  const quantity = offer[resource] ?? 0;
  return quantity > 0 ? [`${quantity} ${supplyResourceLabel(resource)}`] : [];
}).join(", ") || "none";
export function activeResourceDealsHtml(rows: readonly ResourceSupplyAgreementStatus[], ownId: string, otherId: string | undefined, now = resourceTradeServerNow()): string {
  const deals = rows.filter(row => (row.proposerId === otherId || row.targetId === otherId) && (row.expiresAt === undefined || row.expiresAt > now));
  if (!deals.length) return "";
  const esc = (text: string) => text.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char] ?? char);
  return `<h3>Active agreements</h3>${deals.map(row => {
    const ownProposes = row.proposerId === ownId;
    const outgoing = ownProposes ? row.proposerCoinPerHour : row.targetCoinPerHour;
    const incoming = ownProposes ? row.targetCoinPerHour : row.proposerCoinPerHour;
    const coin = `${outgoing ? `<br>You pay up to ${outgoing * 24} Coin/day` : ""}${incoming ? `<br>You receive up to ${incoming * 24} Coin/day` : ""}`;
    // Deals are binding for their term; only open-ended agreements saved before terms existed can still be ended.
    const end = row.expiresAt === undefined
      ? `<button type="button" class="resource-trade-action" data-resource-end="${esc(row.id)}">${resourceEndIsArmed(row.id, Date.now()) ? RESOURCE_END_ARMED_LABEL : "End supply"}</button>`
      : `<small>Binding: only war between you ends it early.</small>`;
    const slots = hasResourceSupplyOffer(row.proposerGives) || hasResourceSupplyOffer(row.targetGives)
      ? `<br>You supply: ${quantities(ownProposes ? row.proposerGives : row.targetGives)}<br>You receive: ${quantities(ownProposes ? row.targetGives : row.proposerGives)}` : "";
    return `<div class="diplomacy-resource-agreement"><strong>${row.fulfilled ? (slots ? "Delivering" : "Paying") : "Paused — supply unavailable"}</strong> · ${resourceDeadlineHtml(row.expiresAt, now)}${row.expiresAt === undefined ? "" : ` · Ends ${new Date(row.expiresAt).toLocaleString()}`}${slots}${coin}<br>${end}</div>`;
  }).join("")}`;
}
