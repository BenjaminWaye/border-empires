import { RESOURCE_NETWORKS, emptyNetworkSiteCounts, networkManpowerRegenPerMinute, suppliedNetworkBuildings } from "@border-empires/shared";
import { networkSupplyHtml } from "@client/client-resource-networks/network-supply-html.js";

/** Uses the production slot formula and keeps each resource on its actual recipient. */
export const renderNetworkSupplyReview = (): HTMLElement => {
  const root = document.createElement("div");
  root.style.cssText = "max-width:980px;margin:auto;background:#18232b;color:#e6ded0;padding:24px;font:15px/1.6 system-ui";
  const style = document.createElement("style");
  style.textContent = ".supply-review-controls{display:flex;gap:20px;flex-wrap:wrap}.supply-review-controls label{display:grid;gap:6px}.supply-review-controls input{font:inherit;width:110px;padding:8px;color:#ead8b3;background:#24363e;border:1px solid #65716b}.supply-review-factories{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.supply-review-factory{border:1px solid #65716b;padding:12px;min-width:160px}.supply-review-factory small,.supply-review-body small{display:block;color:#aabbbd}.supply-review-body .economy-line{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-top:1px solid #3b4b50}";
  const title = document.createElement("h2"); title.textContent = "One supply slot equips one building";
  const intro = document.createElement("p"); intro.textContent = "Resin supplies depots; conductive slots supply factories.";
  const controls = document.createElement("div"); controls.className = "supply-review-controls";
  const body = document.createElement("div"); body.className = "supply-review-body";
  const fields: Record<"factories" | "depots" | "resin" | "minerals", HTMLInputElement> = {
    factories: document.createElement("input"), depots: document.createElement("input"), resin: document.createElement("input"), minerals: document.createElement("input")
  };
  const refresh = (): void => {
    const value = (key: keyof typeof fields): number => Math.min(12, Math.max(0, Math.floor(Number(fields[key].value) || 0)));
    const factories = value("factories"), depots = value("depots"), resin = value("resin");
    const minerals = value("minerals") * RESOURCE_NETWORKS.CONDUCTIVE_MINERALS.slotsPerSite;
    const supply = { ...emptyNetworkSiteCounts(), NEURAL_RESIN: resin, CONDUCTIVE_MINERALS: minerals };
    const used = { ...emptyNetworkSiteCounts(), NEURAL_RESIN: suppliedNetworkBuildings(resin, depots), CONDUCTIVE_MINERALS: suppliedNetworkBuildings(minerals, factories) };
    const total = networkManpowerRegenPerMinute(supply, { factoryCount: factories, depotCount: depots }) * 240;
    const factoriesHtml = Array.from({ length: factories }, (_, index) => {
      const bonus = index < used.CONDUCTIVE_MINERALS ? RESOURCE_NETWORKS.CONDUCTIVE_MINERALS.batchBonus : 0;
      return `<div class="supply-review-factory"><img width="96" height="96" alt="Ancillary Factory" src="/overlays/town-district/ancillary-factory.svg"><strong>Factory ${index + 1}</strong><div>+${bonus} Ancillaries/batch</div><small>${bonus ? "1 conductive slot occupied" : "No conductive supply"}</small></div>`;
    }).join("");
    const depotsHtml = Array.from({ length: depots }, (_, index) => {
      const bonus = index < used.NEURAL_RESIN ? RESOURCE_NETWORKS.NEURAL_RESIN.batchBonus : 0;
      return `<div class="supply-review-factory"><img width="96" height="96" alt="Ancillary Depot" src="/overlays/town-district/ancillary-depot.svg"><strong>Depot ${index + 1}</strong><div>+${bonus} Ancillaries/cycle</div><small>${bonus ? "1 resin slot occupied" : "No resin supply"}</small></div>`;
    }).join("");
    body.innerHTML = `<h3>Empire bonus: +${Math.round(total)} Ancillaries / 4h</h3><div class="supply-review-factories">${depotsHtml}${factoriesHtml}</div>${networkSupplyHtml({ supply, used })}`;
  };
  for (const [key, label, initial] of [["factories", "Ancillary Factories", 3], ["depots", "Ancillary Depots", 1], ["resin", "Resin Extractors", 1], ["minerals", "Implant Foundries", 1]] as const) {
    const field = fields[key]; field.type = "number"; field.min = "0"; field.max = "12"; field.value = String(initial); field.oninput = refresh;
    const wrapper = document.createElement("label"); wrapper.textContent = label; wrapper.append(field); controls.append(wrapper);
  }
  root.append(style, title, intro, controls, body); refresh(); return root;
};
