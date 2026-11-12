import {
  BIOTA_SLOTS_PER_SITE, NETWORK_RESOURCES, RESOURCE_NETWORKS, salvageArmsMultiplier,
  type NetworkResource, type NetworkSupplyStatus
} from "@border-empires/shared";

const benefitFor = (resource: NetworkResource, status: NetworkSupplyStatus): { value: string; note: string } => {
  const supply = status.supply[resource];
  const role = RESOURCE_NETWORKS[resource].role;
  if (role === "BIOTA") {
    const slots = supply * BIOTA_SLOTS_PER_SITE, usedSites = status.used[resource];
    return { value: `${slots} biota slots`, note: usedSites < supply ? `${supply - usedSites} ${supply - usedSites === 1 ? "site" : "sites"} spare · trade spares to a House that needs them` : "All slots go to your Cities and larger towns" };
  }
  return { value: `+${Math.round((salvageArmsMultiplier(supply) - 1) * 100)}% attack and defense`, note: "Each site holds loads you can ship to the Court" };
};

/** Economy panel: what each frontier resource you hold is doing for you. */
export const networkSupplyHtml = (status: NetworkSupplyStatus | undefined): string => {
  if (!status) return "";
  const rows = NETWORK_RESOURCES.filter(resource => status.supply[resource] > 0).map(resource => {
    const { value, note } = benefitFor(resource, status);
    return `<div class="economy-line"><span>${RESOURCE_NETWORKS[resource].name} ×${status.supply[resource]}<small>${note}</small></span><strong>${value}</strong></div>`;
  });
  if (!rows.length) return "";
  return `<section class="economy-detail-card card"><h3>Frontier resources</h3><small>Developed sites you hold, including trades</small>${rows.join("")}</section>`;
};
