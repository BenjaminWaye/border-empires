import { TRADABLE_SUPPLY_RESOURCES, supplyResourceLabel, type ResourceSupplyOffer, type ResourceSupplyAgreementStatus } from "@border-empires/shared";
import { resourceDeadlineHtml, resourceTradeServerNow } from "./client-resource-deadline.js";

const quantities = (offer: ResourceSupplyOffer): string => TRADABLE_SUPPLY_RESOURCES.flatMap(resource => {
  const quantity = offer[resource] ?? 0;
  return quantity > 0 ? [`${quantity} ${supplyResourceLabel(resource)}`] : [];
}).join(", ") || "none";
export function activeResourceDealsHtml(rows: readonly ResourceSupplyAgreementStatus[], ownId: string, otherId: string | undefined, now = resourceTradeServerNow()): string {
  const deals = rows.filter(row => (row.proposerId === otherId || row.targetId === otherId) && (row.expiresAt === undefined || row.expiresAt > now));
  if (!deals.length) return "";
  const esc = (text: string) => text.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char] ?? char);
  return `<h3>Active supply agreements</h3>${deals.map(row => {
    const ownProposes = row.proposerId === ownId;
    const outgoing = ownProposes ? row.proposerCoinPerHour : row.targetCoinPerHour;
    const incoming = ownProposes ? row.targetCoinPerHour : row.proposerCoinPerHour;
    const coin = `${outgoing ? `<br>You pay up to ${outgoing} Coin/hour` : ""}${incoming ? `<br>You receive up to ${incoming} Coin/hour` : ""}`;
    return `<div class="diplomacy-resource-agreement"><strong>${row.fulfilled ? "Delivering" : "Paused — supply unavailable"}</strong> · ${resourceDeadlineHtml(row.expiresAt, now)}${row.expiresAt === undefined ? "" : ` · Ends ${new Date(row.expiresAt).toLocaleString()}`}<br>You supply: ${quantities(ownProposes ? row.proposerGives : row.targetGives)}<br>You receive: ${quantities(ownProposes ? row.targetGives : row.proposerGives)}${coin}<br><button type="button" class="resource-trade-action" data-resource-end="${esc(row.id)}">End supply</button></div>`;
  }).join("")}`;
}
