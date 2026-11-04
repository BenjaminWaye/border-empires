import { TRADABLE_SUPPLY_RESOURCES, supplyResourceLabel, type ResourceSupplyOffer, type ResourceSupplyAgreementStatus } from "@border-empires/shared";
const quantities = (offer: ResourceSupplyOffer): string => TRADABLE_SUPPLY_RESOURCES.flatMap(resource => {
  const quantity = offer[resource] ?? 0;
  return quantity > 0 ? [`${quantity} ${supplyResourceLabel(resource)}`] : [];
}).join(", ") || "none";
export function activeResourceDealsHtml(rows: readonly ResourceSupplyAgreementStatus[], ownId: string, otherId: string | undefined, now = Date.now()): string {
  const deals = rows.filter(row => (row.proposerId === otherId || row.targetId === otherId) && (row.expiresAt === undefined || row.expiresAt > now));
  if (!deals.length) return "";
  const esc = (text: string) => text.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char] ?? char);
  return `<h3>Active supply agreements</h3>${deals.map(row => {
    const ownProposes = row.proposerId === ownId;
    const minutes = row.expiresAt === undefined ? undefined : Math.max(1, Math.ceil((row.expiresAt - now) / 60_000));
    return `<div class="diplomacy-resource-agreement"><strong>${row.fulfilled ? "Delivering" : "Paused — supply unavailable"}</strong>${minutes ? ` · ${minutes >= 60 ? `${Math.ceil(minutes / 60)}h` : `${minutes}m`} remaining` : " · Until cancelled"}<br>You supply: ${quantities(ownProposes ? row.proposerGives : row.targetGives)}<br>You receive: ${quantities(ownProposes ? row.targetGives : row.proposerGives)}<br><button type="button" class="resource-trade-action" data-resource-end="${esc(row.id)}">End supply</button></div>`;
  }).join("")}`;
}
