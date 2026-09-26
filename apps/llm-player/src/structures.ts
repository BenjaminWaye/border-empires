// Eligibility for basic resource-tile economic structures (starter set:
// FARMSTEAD, MINE), reusing the same predicates the real server/client use
// rather than reimplementing them:
//   - structureShowsOnTile (packages/shared/src/structure-placement.ts):
//     data-driven placement rule (structure-placement-metadata.json) --
//     FARMSTEAD only shows on a "FARM" resource tile, MINE on "TITANIUM" or
//     "GEMS", both placementMode "same_tile" (no town/dock support routing
//     to worry about here).
//   - TECH_REQUIREMENTS_BY_STRUCTURE (packages/shared/src/structure-
//     registry-economic.ts): the tech that must be researched first.
//   - structureSlotRequirements (packages/shared/src/structure-slots/
//     structure-slots.ts): the real build-time gate for FOOD/TITANIUM/
//     CRYSTAL/UMBRITE structures is a global per-resource slot supply/demand
//     pool, NOT the retired strategicResources stockpile amounts in
//     structure-costs.ts's resourceCost field (§5 of docs/manpower-economy-
//     rewrite-plan.md; apps/simulation/src/runtime-structure-command-
//     handlers.ts's hasFreeResourceSlots is the server's real gate). Notably
//     FARMSTEAD needs no slot at all, and MINE needs a free FOOD slot (not a
//     TITANIUM one) -- neither matches what structure-costs.ts's resourceCost
//     field would suggest.
// Deliberately a small curated allowlist rather than every EconomicStructureType
// the wire protocol accepts -- see the conversation this was scoped from:
// evidence from public LLM game-agent research (CivBench) shows a large flat
// action surface for a cheap model causes systematic underutilization, not
// better play, so this starts narrow and only grows if it's actually used.
import {
  structureBuildManpowerCost,
  structureShowsOnTile,
  structureSlotRequirements,
  TECH_REQUIREMENTS_BY_STRUCTURE,
  type EconomicStructureType,
  type ResourceType
} from "@border-empires/shared";
import { freeResourceSlotCount, type ResourceSlots } from "./game-socket.js";
import { ownedSettledSitesInViewport, type CameraPosition, type TileIndex } from "./viewport.js";

export const BUILDABLE_STRUCTURE_TYPES = ["FARMSTEAD", "MINE"] as const satisfies readonly EconomicStructureType[];
export type BuildableStructureType = (typeof BUILDABLE_STRUCTURE_TYPES)[number];

export type StructureSite = { x: number; y: number; structureType: BuildableStructureType; manpowerCost: number };

const RESOURCE_TYPES: readonly ResourceType[] = ["FARM", "TITANIUM", "GEMS", "FISH", "UMBRITE"];
const isResourceType = (value: string | undefined): value is ResourceType =>
  value !== undefined && (RESOURCE_TYPES as readonly string[]).includes(value);

const hasFreeSlots = (resourceSlots: ResourceSlots, structureType: BuildableStructureType): boolean =>
  structureSlotRequirements(structureType).every(({ resource, count }) => freeResourceSlotCount(resourceSlots, resource) >= count);

export const buildStructureSites = (
  index: TileIndex,
  camera: CameraPosition,
  playerId: string,
  techIds: readonly string[],
  resourceSlots: ResourceSlots
): StructureSite[] => {
  const ownedTechIds = new Set(techIds);
  const sites: StructureSite[] = [];
  for (const { x, y, tile } of ownedSettledSitesInViewport(index, camera, playerId)) {
    if (!isResourceType(tile.resource)) continue;
    for (const structureType of BUILDABLE_STRUCTURE_TYPES) {
      const techId = TECH_REQUIREMENTS_BY_STRUCTURE[structureType];
      if (techId && !ownedTechIds.has(techId)) continue;
      // ownedSettledSitesInViewport already guarantees ownershipState is
      // SETTLED here; GameTile's wire type is a bare string, not the
      // narrower OwnershipState union, so pass the known literal instead of
      // an unchecked cast.
      if (!structureShowsOnTile(structureType, { ownershipState: "SETTLED", resource: tile.resource })) continue;
      if (!hasFreeSlots(resourceSlots, structureType)) continue;
      sites.push({ x, y, structureType, manpowerCost: structureBuildManpowerCost(structureType) });
    }
  }
  return sites;
};
