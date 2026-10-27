import { RESOURCE_NETWORKS, emptyNetworkSiteCounts, networkFactoryRegenPerMinute, suppliedNetworkBuildings } from "@border-empires/shared";
import { networkSupplyHtml } from "@client/client-resource-networks/network-supply-html.js";

/** Interactive explanation of the same exclusive-slot formula used by the sim. */
export const renderNetworkSupplyReview = (): HTMLElement => {
  const root = document.createElement("div");
  root.style.cssText = "max-width:980px;margin:auto;background:#18232b;color:#e6ded0;padding:24px;font:15px/1.6 system-ui";
  const style = document.createElement("style");
  style.textContent = ".supply-review-controls{display:flex;gap:20px;flex-wrap:wrap}.supply-review-controls label{display:grid;gap:6px}.supply-review-controls input{font:inherit;width:110px;padding:8px;color:#ead8b3;background:#24363e;border:1px solid #65716b}.supply-review-factories{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.supply-review-factory{border:1px solid #65716b;padding:12px;min-width:160px}.supply-review-factory small,.supply-review-body small{display:block;color:#aabbbd}.supply-review-body .economy-line{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-top:1px solid #3b4b50}";
  const title = document.createElement("h2"); title.textContent = "One supply slot equips one factory";
  const intro = document.createElement("p"); intro.textContent = "Add factories while keeping your extractors fixed: total resource output stops growing when every supply slot is occupied.";
  const controls = document.createElement("div"); controls.className = "supply-review-controls";
  const body = document.createElement("div"); body.className = "supply-review-body";
  const fields: Record<"factories" | "resin" | "minerals", HTMLInputElement> = {
    factories: document.createElement("input"), resin: document.createElement("input"), minerals: document.createElement("input")
  };
  const refresh = (): void => {
    const value = (key: keyof typeof fields): number => Math.min(12, Math.max(0, Math.floor(Number(fields[key].value) || 0)));
    const factories = value("factories"), resin = value("resin"), minerals = value("minerals");
    const supply = { ...emptyNetworkSiteCounts(), NEURAL_RESIN: resin, CONDUCTIVE_MINERALS: minerals * RESOURCE_NETWORKS.CONDUCTIVE_MINERALS.slotsPerSite };
    const used = { ...emptyNetworkSiteCounts(), NEURAL_RESIN: suppliedNetworkBuildings(resin, factories), CONDUCTIVE_MINERALS: suppliedNetworkBuildings(minerals * RESOURCE_NETWORKS.CONDUCTIVE_MINERALS.slotsPerSite, factories) };
    const total = networkFactoryRegenPerMinute(supply, factories) * 240;
    const cards = Array.from({ length: factories }, (_, index) => {
      const resinBonus = index < used.NEURAL_RESIN ? RESOURCE_NETWORKS.NEURAL_RESIN.batchBonus : 0, mineralBonus = index < used.CONDUCTIVE_MINERALS ? RESOURCE_NETWORKS.CONDUCTIVE_MINERALS.batchBonus : 0;
      return `<div class="supply-review-factory"><img width="96" height="96" alt="Ancillary Factory" src="/overlays/town-district/ancillary-factory.svg"><strong>Factory ${index + 1}</strong><div>+${resinBonus + mineralBonus} Ancillaries/batch</div><small>${resinBonus ? "1 resin slot occupied" : "No resin supply"}</small><small>${mineralBonus ? "1 conductive slot occupied" : "No conductive supply"}</small><small>Normal batch unchanged</small></div>`;
    }).join("");
    body.innerHTML = `<h3>Empire bonus: +${Math.round(total)} Ancillaries per batch</h3><div class="supply-review-factories">${cards}</div>${networkSupplyHtml({ supply, used })}`;
  };
  for (const [key, label, initial] of [["factories", "Ancillary Factories", 3], ["resin", "Resin Extractors", 1], ["minerals", "Implant Foundries", 1]] as const) {
    const field = fields[key]; field.type = "number"; field.min = "0"; field.max = "12"; field.value = String(initial); field.oninput = refresh;
    const wrapper = document.createElement("label"); wrapper.textContent = label; wrapper.append(field); controls.append(wrapper);
  }
  root.append(style, title, intro, controls, body); refresh(); return root;
};
