import type { DistrictMap3D } from "../client-town-district/district-map-3d.js";
import type { Tile } from "../client-types.js";
import { constructionSiteForRebuild } from "../client-construction-afc-offset/client-construction-afc-offset.js";
import { DEFAULT_CONTACT_SHADOW_RADIUS_TILES, type ContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { STRUCTURE_KINDS_HANDLED_BY_3D, mineResourceHintFor, type StructureKind, type StructureOverlay } from "../client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import type { UmbriteExtractionRigOverlay } from "../client-map-3d-umbrite-extraction-rig.js";
import type { UmbriteWeaponsFactoryOverlay } from "../client-map-3d-umbrite-weapons-factory.js";
import type { TradeNexusOverlay } from "../client-map-3d-trade-nexus-overlay.js";
import type { AmbaricTransformerOverlay } from "../client-map-3d-ambaric-transformer-overlay.js";
import type { ObservatoryCooldownBadgeOverlay } from "../client-map-3d-observatory-cooldown-badge-overlay/client-map-3d-observatory-cooldown-badge-overlay.js";

type BuildingOverlays = {
  district?: Pick<DistrictMap3D, "addTile">;
  contactShadowOverlay: Pick<ContactShadowOverlay, "addShadow">;
  structureOverlay: Pick<StructureOverlay, "addInstance">;
  umbriteExtractionRigOverlay: Pick<UmbriteExtractionRigOverlay, "addInstance">;
  umbriteWeaponsFactoryOverlay: Pick<UmbriteWeaponsFactoryOverlay, "addInstance">;
  tradeNexusOverlay: Pick<TradeNexusOverlay, "addInstance">;
  ambaricTransformerOverlay: Pick<AmbaricTransformerOverlay, "addInstance">;
  observatoryCooldownBadgeOverlay: Pick<ObservatoryCooldownBadgeOverlay, "addInstance" | "addSiphonModeInstance">;
};

type BuildingState = { tiles: Map<string, Tile>; tilesRevision: number; me: string | undefined };
type BuildingSite = { x: number; z: number; surfaceY: number; wx: number; wy: number };

export const buildingAnimationFrozen = (status: string | undefined): boolean =>
  status === "under_construction" || status === "removing";

// A disabled Aether Tower (observatory toggled off) stops animating and dims
// its glowing core; see client-map-3d-ambaric-transformer-dim.ts.
export const aetherTowerDisabled = (status: string | undefined): boolean => status === "inactive";

// Both shared and dedicated building overlays receive the construction state.
export const addBuildingInstancesForTile = (
  tile: Tile,
  site: BuildingSite,
  overlays: BuildingOverlays,
  state: BuildingState,
  rebuildStartAt: number,
  tileResource: string | undefined
): void => {
  if (tile.terrain !== "LAND") return;
  const { x, z, surfaceY, wx, wy } = site;
  const shadow = (): void => overlays.contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
  const handled = overlays.district?.addTile(tile, site, rebuildStartAt);
  const structure = tile.economicStructure;
  if (structure && !handled?.economic) {
    const frozen = buildingAnimationFrozen(structure.status);
    if (structure.type === "UMBRITE_RIG") {
      overlays.umbriteExtractionRigOverlay.addInstance(x, z, surfaceY, wx, wy);
      shadow();
    } else if (structure.type === "UMBRITE_WEAPONS_FACTORY") {
      overlays.umbriteWeaponsFactoryOverlay.addInstance(x, z, surfaceY, wx, wy, frozen);
      shadow();
    } else if (structure.type === "TRADE_NEXUS") {
      overlays.tradeNexusOverlay.addInstance(x, z, surfaceY, wx, wy, frozen);
      shadow();
    } else if (STRUCTURE_KINDS_HANDLED_BY_3D.has(structure.type as StructureKind)) {
      overlays.structureOverlay.addInstance(x, z, surfaceY, structure.type as StructureKind, mineResourceHintFor(structure.type, tileResource), constructionSiteForRebuild(state, tile, "economicStructure", rebuildStartAt));
    }
  }
  if (tile.observatory) {
    if (!handled?.observatory && tile.naturalWonder?.type !== "WATCHTOWER_ENGINE") {
      const { status } = tile.observatory;
      overlays.ambaricTransformerOverlay.addInstance(x, z, surfaceY, wx, wy, buildingAnimationFrozen(status), aetherTowerDisabled(status));
      shadow();
    }
    const cooldownActive = tile.ownerId === state.me && tile.observatory.status === "active" && (tile.observatory.cooldownUntil ?? 0) > Date.now();
    if (cooldownActive) overlays.observatoryCooldownBadgeOverlay.addInstance(x, z, surfaceY);
    else if (tile.observatory.siphon) overlays.observatoryCooldownBadgeOverlay.addSiphonModeInstance(x, z, surfaceY);
  }
};
