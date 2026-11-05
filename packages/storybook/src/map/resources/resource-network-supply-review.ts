import { NETWORK_RESOURCES, RESOURCE_NETWORKS, emptyNetworkSiteCounts, frontierMaterialManpowerPerWindow, type NetworkResource } from "@border-empires/shared";
import { networkSupplyHtml } from "@client/client-resource-networks/network-supply-html.js";

/** Uses the production formulas: enter developed sites per type and see what the empire gets. */
export const renderNetworkSupplyReview = (): HTMLElement => {
  const root = document.createElement("div");
  root.style.cssText = "max-width:980px;margin:auto;background:#18232b;color:#e6ded0;padding:24px;font:15px/1.6 system-ui";
  const style = document.createElement("style");
  style.textContent = ".supply-review-controls{display:flex;gap:20px;flex-wrap:wrap}.supply-review-controls label{display:grid;gap:6px}.supply-review-controls input{font:inherit;width:110px;padding:8px;color:#ead8b3;background:#24363e;border:1px solid #65716b}.supply-review-body small{display:block;color:#aabbbd}.supply-review-body .economy-line{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-top:1px solid #3b4b50}";
  const title = document.createElement("h2"); title.textContent = "Frontier resources you hold";
  const intro = document.createElement("p"); intro.textContent = "Your first site of a material type gives +120 manpower per refill, each extra one +30. Biota feeds large towns; salvage arms your troops.";
  const controls = document.createElement("div"); controls.className = "supply-review-controls";
  const body = document.createElement("div"); body.className = "supply-review-body";
  const fields = new Map<NetworkResource, HTMLInputElement>();
  const refresh = (): void => {
    const supply = emptyNetworkSiteCounts();
    for (const [resource, field] of fields) supply[resource] = Math.min(20, Math.max(0, Math.floor(Number(field.value) || 0)));
    const total = frontierMaterialManpowerPerWindow(supply);
    body.innerHTML = `<h3>Empire bonus: +${total} manpower / 4h</h3>${networkSupplyHtml({ supply, used: supply })}`;
  };
  const initial: Record<NetworkResource, number> = { NEURAL_RESIN: 10, CONDUCTIVE_MINERALS: 5, CATALYTIC_DEPOSIT: 6, LUXURY_BIOTA: 2, PRECURSOR_SALVAGE: 3 };
  for (const resource of NETWORK_RESOURCES) {
    const field = document.createElement("input"); field.type = "number"; field.min = "0"; field.max = "20"; field.value = String(initial[resource]); field.oninput = refresh;
    fields.set(resource, field);
    const wrapper = document.createElement("label"); wrapper.textContent = `${RESOURCE_NETWORKS[resource].buildingName} sites`; wrapper.append(field); controls.append(wrapper);
  }
  root.append(style, title, intro, controls, body); refresh(); return root;
};
