import { DISTRICT_ICON_CROPS, type DistrictIconCrop } from "./district-icon-crops.js";
import { DISTRICT_BUILDING_KINDS, isDistrictBuilding, type DistrictBuildingKind } from "./district-catalog.js";

const imageUrl = (kind: DistrictBuildingKind): string => `/overlays/town-district/${kind.toLowerCase().replaceAll("_", "-")}.svg?v=20261025-district-refined`;
export const districtArtUrl = (kind: string): string | undefined => isDistrictBuilding(kind) ? imageUrl(kind) : undefined;
export const districtMenuArtCrops = (): Readonly<Record<string, DistrictIconCrop>> =>
  Object.fromEntries<DistrictIconCrop>(DISTRICT_BUILDING_KINDS.map(kind => [imageUrl(kind), DISTRICT_ICON_CROPS[kind]] as const));

export const districtOverlayImages = (load: (filename: string) => HTMLImageElement): Record<DistrictBuildingKind, HTMLImageElement> =>
  Object.fromEntries(DISTRICT_BUILDING_KINDS.map(kind => [kind, load(`town-district/${kind.toLowerCase().replaceAll("_", "-")}.svg`)])) as Record<DistrictBuildingKind, HTMLImageElement>;
