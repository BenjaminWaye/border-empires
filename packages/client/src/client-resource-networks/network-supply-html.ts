import { NETWORK_RESOURCES, RESOURCE_NETWORKS, type NetworkSupplyStatus } from "@border-empires/shared";

export const networkSupplyHtml = (status: NetworkSupplyStatus | undefined): string => {
  if (!status) return "";
  const rows = NETWORK_RESOURCES.filter(resource => status.supply[resource] > 0).map(resource => {
    const { name, batchBonus, creditPerDay, target } = RESOURCE_NETWORKS[resource];
    const used = status.used[resource], supply = status.supply[resource];
    const benefit = batchBonus ? `+${used * batchBonus} Ancillaries/${target === "ANCILLARY_DEPOT" ? "cycle" : "batch"}` : `+${(used * creditPerDay).toFixed(1)} Coin/day`;
    const recipient = target === "ANCILLARY_DEPOT" ? "Ancillary Depot" : target === "ANCILLARY_FACTORY" ? "Ancillary Factory" : target === "TRADE_NEXUS" ? "Trade Nexus" : "Manufactory";
    return `<div class="economy-line"><span>${name}<small>One slot per ${recipient} · ${supply - used} free</small></span><strong>${used} / ${supply} slots used · ${benefit}</strong></div>`;
  });
  if (!rows.length) return "";
  return `<section class="economy-detail-card card"><h3>Industrial supply</h3><small>One slot per building · Coin before modifiers</small>${rows.join("")}</section>`;
};
