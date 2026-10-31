import { isDistrictProject } from "../client-town-district/district-catalog.js";
import { MONUMENT_ICON_CROPS } from "./monument-icon-crops.js";

export const MONUMENT_ART_VERSION = "20261025-monuments";
export const monumentArtUrl = (kind: string): string | undefined => isDistrictProject(kind)
  ? `/overlays/${kind.toLowerCase().replaceAll("_", "-")}-overlay.svg?v=${MONUMENT_ART_VERSION}` : undefined;
export const monumentMenuCrops = (): typeof MONUMENT_ICON_CROPS => Object.fromEntries(
  Object.entries(MONUMENT_ICON_CROPS).map(([url, crop]) => [`${url}?v=${MONUMENT_ART_VERSION}`, crop])
);
