import { NETWORK_VARIANTS, NETWORK_VARIANT_NAMES, networkDepositFilename } from "./network-variants.js";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, type NetworkResource } from "@border-empires/shared";
import { modelIconSvg } from "../client-town-district/district-icon-svg.js";
import { createNetworkGeometry } from "./network-models.js";

export const networkIconExports = (): ReadonlyArray<{ filename: string; svg: string; building: boolean }> =>
  NETWORK_RESOURCES.flatMap(resource => [
    ...NETWORK_VARIANTS.map(variant => ({filename: networkDepositFilename(resource,variant),
      svg:modelIconSvg(createNetworkGeometry(resource,false,variant),`${RESOURCE_NETWORKS[resource].name} — ${NETWORK_VARIANT_NAMES[resource][variant]}`,1),building:false})),
    {filename:`${RESOURCE_NETWORKS[resource].building.toLowerCase().replaceAll("_", "-")}-overlay.svg`,
      svg:installationIcon(resource),building:true},
    ...(resource === "PRECURSOR_SALVAGE" ? [{filename:DEPLETED_RECLAMATION_WORKS_OVERLAY, svg:installationIcon(resource, true), building:true}] : [])
  ]);

/** 2D art for a Reclamation Works whose field shipped its last load. */
export const DEPLETED_RECLAMATION_WORKS_OVERLAY = "reclamation-works-depleted-overlay.svg";

// The tall crane needs headroom in the shared 128px isometric projection.
const installationIcon = (resource: NetworkResource, depleted = false): string => {
  const geometry = createNetworkGeometry(resource, true, 0, depleted);
  if (resource === "PRECURSOR_SALVAGE")
    for (const layer of Object.values(geometry.layers)) layer.scale(0.9, 0.9, 0.9);
  return modelIconSvg(geometry, `${depleted ? "Depleted " : ""}${RESOURCE_NETWORKS[resource].buildingName}`, 0.3);
};
