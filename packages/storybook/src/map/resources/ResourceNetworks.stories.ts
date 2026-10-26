import { renderNetworkSupplyReview } from "./resource-network-supply-review.js";
import { renderStructureIdentityReview } from "../structures/town-district-identity-review.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "@border-empires/shared";
import { createResourceOverlay } from "@client/client-map-3d-resource-overlay.js";
import { createStructureOverlay } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

function gallery(): HTMLElement {
  const stage = createStage({ width:1100,height:400,camera:"orthographic",orthoHalfHeight:1.7,background:"#18232b" });
  stage.camera.position.set(0,6,7); stage.camera.lookAt(0,0,0);
  const deposits = createResourceOverlay(stage.scene, 5);
  const shadows = createContactShadowOverlay(stage.scene, 20);
  const structures = createStructureOverlay(stage.scene, 5, shadows);
  NETWORK_RESOURCES.forEach((resource,index) => {
    const x=(index-2)*1.6;
    deposits.addInstance(x,-0.8,0,resource,index,0);
    structures.addInstance(x,0.8,0,RESOURCE_NETWORKS[resource].building);
  });
  deposits.commit(); structures.commit(); shadows.commit();
  const root=wrapWithCleanup(stage,[deposits.dispose,structures.dispose,shadows.dispose]);
  const heading=document.createElement("h2");heading.textContent="Frontier resources — raw sites above, developed installations below";
  heading.style.cssText="font:18px system-ui;color:#ead8b3;margin:16px";root.prepend(heading);
  const cards=document.createElement("div");cards.style.cssText="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;background:#18232b;color:#e6ded0;padding:16px;font:13px/1.5 system-ui";
  for (const resource of NETWORK_RESOURCES) {
    const spec=RESOURCE_NETWORKS[resource], name=resource.toLowerCase().replaceAll("_","-"), building=spec.building.toLowerCase().replaceAll("_","-");
    const card=document.createElement("div");
    card.innerHTML=`<strong>${spec.name}</strong><div><img alt="${spec.name}" width="80" height="80" src="/overlays/${name}-deposit.svg"><img alt="${spec.buildingName}" width="80" height="80" src="/overlays/${building}-overlay.svg"></div><strong>${spec.buildingName}</strong><p>${spec.effect}</p>`;
    cards.appendChild(card);
  }
  root.appendChild(cards);return root;
}
const meta: Meta = { title:"Map/Resources/Resource Networks",render:gallery };
export default meta;
export const DepositsAndBuildings: StoryObj = {};

export const InstallationReview: StoryObj = {
  render: () => renderStructureIdentityReview(NETWORK_RESOURCES.map(resource => RESOURCE_NETWORKS[resource].building), "Frontier installation")
};

export const SupplySlots: StoryObj = { render: renderNetworkSupplyReview };
