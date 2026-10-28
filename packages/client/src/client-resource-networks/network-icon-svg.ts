import { NETWORK_VARIANTS, NETWORK_VARIANT_NAMES, networkDepositFilename } from "./network-variants.js";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, type NetworkResource } from "@border-empires/shared";
import { modelIconSvg } from "../client-town-district/district-icon-svg.js";
import { createNetworkGeometry } from "./network-models.js";

export const networkIconExports = (): ReadonlyArray<{ filename: string; svg: string; building: boolean }> =>
  NETWORK_RESOURCES.flatMap(resource => [
    ...NETWORK_VARIANTS.map(variant => ({filename: networkDepositFilename(resource,variant),
      svg:modelIconSvg(createNetworkGeometry(resource,false,variant),`${RESOURCE_NETWORKS[resource].name} — ${NETWORK_VARIANT_NAMES[resource][variant]}`,1),building:false})),
    {filename:`${RESOURCE_NETWORKS[resource].building.toLowerCase().replaceAll("_", "-")}-overlay.svg`,
      svg:installationIcon(resource),building:true}
  ]);

// The tall crane needs headroom in the shared 128px isometric projection.
const installationIcon = (resource: NetworkResource): string => {
  const geometry = createNetworkGeometry(resource, true);
  if (resource === "PRECURSOR_SALVAGE")
    for (const layer of Object.values(geometry.layers)) layer.scale(0.9, 0.9, 0.9);
  return modelIconSvg(geometry, RESOURCE_NETWORKS[resource].buildingName, 0.3);
};
