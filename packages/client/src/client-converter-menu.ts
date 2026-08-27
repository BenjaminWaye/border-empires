import { converterModeOf } from "@border-empires/shared";
import { economicStructureName } from "./client-map-display.js";
import type { Tile, TileActionDef } from "./client-types.js";

// Converter menu logic extracted out of client-tile-action-logic.ts and
// client-tile-menu-view.ts so those oversized files stay net-smaller
// (500-line budget, AGENTS.md). All converter-facing menu entries, detail
// text, and mode status lines live here.

export const isConverterStructureType = (type: NonNullable<Tile["economicStructure"]>["type"]): boolean =>
  type === "UMBRITE_SYNTHESIZER" ||
  type === "ADVANCED_UMBRITE_SYNTHESIZER" ||
  type === "TITANIUM_WORKS" ||
  type === "ADVANCED_TITANIUM_WORKS" ||
  type === "CRYSTAL_SYNTHESIZER" ||
  type === "ADVANCED_CRYSTAL_SYNTHESIZER";

export type ConverterMenuDeps = {
  buildDetailTextForAction: (actionId: string, tile: Tile) => string | undefined;
  formatCooldownShort: (ms: number) => string;
  tileActionAvailability: (
    enabled: boolean,
    reason: string,
    cost?: string
  ) => Pick<TileActionDef, "disabled" | "disabledReason" | "cost">;
};

export const converterStructureMenuEntries = (tile: Tile, deps: ConverterMenuDeps): TileActionDef[] => {
  const out: TileActionDef[] = [];
  if (!tile.economicStructure) return out;
  const downtimeRemainingMs = Math.max(0, (tile.economicStructure.disabledUntil ?? 0) - Date.now());
  const isConverter = isConverterStructureType(tile.economicStructure.type);
  if (tile.economicStructure.status === "active") {
    out.push({
      id: "disable_converter_structure" as TileActionDef["id"],
      label: `Disable ${economicStructureName(tile.economicStructure.type)}`,
      detail: deps.buildDetailTextForAction("disable_converter_structure", tile)
    });
  } else if (tile.economicStructure.status === "inactive") {
    const tileNotSettled = tile.ownershipState === "FRONTIER";
    out.push({
      id: "enable_converter_structure" as TileActionDef["id"],
      label: `Enable ${economicStructureName(tile.economicStructure.type)}`,
      detail: deps.buildDetailTextForAction("enable_converter_structure", tile),
      ...deps.tileActionAvailability(
        downtimeRemainingMs <= 0 && !tileNotSettled,
        tileNotSettled
          ? "Tile is not settled"
          : downtimeRemainingMs > 0
            ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
            : "Needs enough gold for one upkeep tick",
        isConverter ? "Pays one upkeep tick immediately" : "Resource slots and bonuses resume"
      )
    });
  }
  if (isConverter) {
    const currentMode = converterModeOf(tile.economicStructure);
    const lockRemainingMs = Math.max(0, (tile.economicStructure.modeLockedUntil ?? 0) - Date.now());
    const flipLabel = currentMode === "SYNTHESIZE" ? "Switch to Sell Off mode" : "Switch to Refine mode";
    out.push({
      id: "set_converter_structure_mode" as TileActionDef["id"],
      label: flipLabel,
      detail: deps.buildDetailTextForAction("set_converter_structure_mode", tile),
      ...deps.tileActionAvailability(
        lockRemainingMs <= 0,
        lockRemainingMs > 0 ? `Cooldown ${deps.formatCooldownShort(lockRemainingMs)}` : "Ready",
        `${currentMode === "SYNTHESIZE" ? "Refine" : "Sell Off"} → ${currentMode === "SYNTHESIZE" ? "Sell Off" : "Refine"}`
      )
    });
  }
  return out;
};

export const converterStructureDetailText = (actionId: string, tile: Tile): string | undefined => {
  if (actionId === "upgrade_umbrite_synthesizer")
    return "Upgrade this Umbrite Works into an Advanced Umbrite Works with 20% higher Refine output (45 gold/day upkeep) and 20% higher Sell off payout (12 gold/day). Still occupies exactly 1 Umbrite slot.";
  if (actionId === "upgrade_titanium_works")
    return "Upgrade this Titanium Works into an Advanced Titanium Works with 20% higher Refine output (45 gold/day upkeep) and 20% higher Sell off payout (12 gold/day). Still occupies exactly 1 Titanium slot.";
  if (actionId === "upgrade_crystal_synthesizer")
    return "Upgrade this Aether Condenser into an Advanced Aether Condenser with 20% higher output (60 gold/day upkeep). Still provides exactly 1 Crystal slot.";
  if (actionId === "enable_converter_structure")
    return "Enable this structure. It resumes occupying resource slots, paying upkeep, and providing bonuses.";
  if (actionId === "disable_converter_structure")
    return "Disable this structure. It stops occupying resource slots, stops paying upkeep, and stops providing bonuses until you enable it again.";
  if (actionId === "set_converter_structure_mode") {
    const currentMode = converterModeOf(tile.economicStructure);
    return currentMode === "SYNTHESIZE"
      ? "Sell off this structure's slot: stop Refining (gold into the resource) and instead pay out gold per day from the occupied slot. Costs nothing to upkeep while in Sell Off mode. A 60-minute cooldown starts on the flip."
      : "Refine again: start turning gold into the resource again instead of selling the slot off. Costs its normal gold upkeep while in Refine mode. A 60-minute cooldown starts on the flip.";
  }
  return undefined;
};

