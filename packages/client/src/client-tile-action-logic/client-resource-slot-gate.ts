import { fortIsWithinSlotWaiver, SYNTHESIZER_STRUCTURE_TYPES, structureSlotRequirements, observatoryCrystalSlotCostForOwnedCount, type SlotResource, type SlotStructureType, type StructureSlotRequirement } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import type { ClientState } from "../client-state/client-state.js";
import { ownedActiveOrBuildingObservatoryCount } from "../client-tile-action-support/client-tile-action-support.js";

// Resource slots: the real
// build-time affordability gate for FOOD/TITANIUM/CRYSTAL/UMBRITE now that Step 5
// item 4 Slice A retired their build-time stockpile spend server-side
// (hasFreeResourceSlots, runtime-structure-command-handlers.ts). Mirrors
// that gate exactly, including the in-place-upgrade netting
// (currentTileFieldSlotRequirements) and the synthesizer skip (a
// synthesizer PROVIDES a slot, never consumes one, §6.4).
const freeResourceSlotCount = (state: ClientState, resource: SlotResource): number =>
  (state.resourceSlots?.supply[resource] ?? 0) - (state.resourceSlots?.demand[resource] ?? 0);

export const additionalResourceSlotRequirements = (
  state: ClientState,
  type: SlotStructureType,
  currentType?: SlotStructureType,
  target?: Tile
): StructureSlotRequirement[] => {
  if (SYNTHESIZER_STRUCTURE_TYPES.includes(type as (typeof SYNTHESIZER_STRUCTURE_TYPES)[number])) return [];
  const newRequirements =
    type === "OBSERVATORY"
      ? [{ resource: "CRYSTAL" as const, count: observatoryCrystalSlotCostForOwnedCount(ownedActiveOrBuildingObservatoryCount(state)) }]
      : structureSlotRequirements(type);
  const effect = (key: string): number => Math.max(0, ...state.domainCatalog.filter(item => state.domainIds.includes(item.id)).map(item => typeof item.effects?.[key] === "number" ? item.effects[key] : 0));
  const forts = [...state.tiles.values()].filter(tile => tile.ownerId === state.me && tile.fort?.ownerId === state.me).length;
  const waived = newRequirements.filter(req => !(
    (req.resource === "CRYSTAL" && type === "OBSERVATORY" && ownedActiveOrBuildingObservatoryCount(state) < effect("observatoryCrystalSlotWaiverCount")) ||
    (req.resource === "TITANIUM" && ["FORT", "PALISADE", "TITANIUM_BASTION", "THUNDER_BASTION"].includes(type) && ((!currentType && forts < effect("fortTitaniumSlotWaiverCount")) || (target && fortIsWithinSlotWaiver(target, state.tiles.values(), state.me, effect("fortTitaniumSlotWaiverCount")))))
  ));
  if (!currentType) return waived;
  const currentByResource = new Map(structureSlotRequirements(currentType).map((r) => [r.resource, r.count]));
  return waived
    .map((r) => ({ resource: r.resource, count: r.count - (currentByResource.get(r.resource) ?? 0) }))
    .filter((r) => r.count > 0);
};

export const hasFreeResourceSlots = (state: ClientState, type: SlotStructureType, currentType?: SlotStructureType, target?: Tile): boolean =>
  additionalResourceSlotRequirements(state, type, currentType, target).every((r) => freeResourceSlotCount(state, r.resource) >= r.count);

// First unmet requirement's reason text, or undefined when all are met.
// Names the actual count still required, not just the resource -- a
// requirement of 2+ slots (e.g. SIEGE_TOWER needs 2 free UMBRITE, DREAD_TOWER
// needs 3) previously always read as "Need a free UMBRITE slot" regardless of
// how many were missing, so freeing exactly one slot left the message
// unchanged and looked like a stuck/buggy button instead of "still short one
// more".
export const missingResourceSlotReason = (state: ClientState, type: SlotStructureType, currentType?: SlotStructureType, target?: Tile): string | undefined => {
  const missing = additionalResourceSlotRequirements(state, type, currentType, target).find((r) => freeResourceSlotCount(state, r.resource) < r.count);
  if (!missing) return undefined;
  if (missing.count === 1) return `Need a free ${missing.resource} slot`;
  const free = Math.max(0, freeResourceSlotCount(state, missing.resource));
  return `Need ${missing.count} free ${missing.resource} slots (have ${free})`;
};

