import { DISTRICT_BUILDING_KINDS, isDistrictBuilding, type DistrictBuildingKind } from "./district-catalog.js";

export const districtArtUrl = (kind: string): string | undefined => isDistrictBuilding(kind)
  ? `/overlays/town-district/${kind.toLowerCase().replaceAll("_", "-")}.svg?v=20261024`
  : undefined;

export const districtOverlayImages = (load: (filename: string) => HTMLImageElement): Record<DistrictBuildingKind, HTMLImageElement> =>
  Object.fromEntries(DISTRICT_BUILDING_KINDS.map(kind => [kind, load(`town-district/${kind.toLowerCase().replaceAll("_", "-")}.svg`)])) as Record<DistrictBuildingKind, HTMLImageElement>;
