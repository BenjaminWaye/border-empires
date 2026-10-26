import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "@border-empires/shared";
import { modelIconSvg } from "../client-town-district/district-icon-svg.js";
import { createNetworkGeometry } from "./network-models.js";

export const networkIconExports = (): ReadonlyArray<{ filename: string; svg: string; building: boolean }> =>
  NETWORK_RESOURCES.flatMap(resource => [false, true].map(developed => ({
    filename: developed ? `${RESOURCE_NETWORKS[resource].building.toLowerCase().replaceAll("_", "-")}-overlay.svg`
      : `${resource.toLowerCase().replaceAll("_", "-")}-deposit.svg`,
    svg: modelIconSvg(createNetworkGeometry(resource, developed), developed ? RESOURCE_NETWORKS[resource].buildingName : RESOURCE_NETWORKS[resource].name, developed ? 0.3 : 1),
    building: developed
  })));
