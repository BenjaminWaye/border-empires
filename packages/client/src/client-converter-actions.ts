import { converterModeOf } from "@border-empires/shared";
import type { OptimisticStructureKind, Tile, TileActionDef } from "./client-types.js";

export type ConverterActionDeps = {
  selected: Tile;
  sendGameMessage: (payload: unknown) => boolean;
  sendDevelopmentBuild: (
    payload: { type: "BUILD_STRUCTURE"; x: number; y: number; structureType: "ADVANCED_UMBRITE_SYNTHESIZER" | "ADVANCED_TITANIUM_WORKS" | "ADVANCED_CRYSTAL_SYNTHESIZER" },
    optimistic: () => void,
    opts: {
      x: number;
      y: number;
      label: string;
      optimisticKind: OptimisticStructureKind;
      allowQueueWhenBusy?: boolean;
      fromQueue?: boolean;
      suppressWarnings?: boolean;
    }
  ) => boolean;
  optimisticStructureBuildForAction: (actionId: TileActionDef["id"], tile: Tile, kind: OptimisticStructureKind) => () => void;
};

const upgradeStructure = (
  actionId: TileActionDef["id"],
  deps: ConverterActionDeps,
  structureType: "ADVANCED_UMBRITE_SYNTHESIZER" | "ADVANCED_TITANIUM_WORKS" | "ADVANCED_CRYSTAL_SYNTHESIZER",
  label: string
): boolean =>
  deps.sendDevelopmentBuild(
    { type: "BUILD_STRUCTURE", x: deps.selected.x, y: deps.selected.y, structureType },
    deps.optimisticStructureBuildForAction(actionId, deps.selected, structureType),
    { x: deps.selected.x, y: deps.selected.y, label, optimisticKind: structureType }
  );

// Converter actions extracted out of client-action-flow.ts (§phase 5) so that
// file stays net-smaller instead of growing past its 500-line budget. Each
// converter action (upgrades, enable/disable, mode flip) lives here and is
// dispatched from handleTileAction via handleConverterTileAction.
export const handleConverterTileAction = (deps: ConverterActionDeps) => (actionId: string): boolean => {
  if (actionId === "upgrade_umbrite_synthesizer")
    return upgradeStructure(actionId, deps, "ADVANCED_UMBRITE_SYNTHESIZER", `Advanced Umbrite Works at (${deps.selected.x}, ${deps.selected.y})`);
  if (actionId === "upgrade_titanium_works")
    return upgradeStructure(actionId, deps, "ADVANCED_TITANIUM_WORKS", `Advanced Titanium Works at (${deps.selected.x}, ${deps.selected.y})`);
  if (actionId === "upgrade_crystal_synthesizer")
    return upgradeStructure(actionId, deps, "ADVANCED_CRYSTAL_SYNTHESIZER", `Advanced Aether Condenser at (${deps.selected.x}, ${deps.selected.y})`);
  if (actionId === "enable_converter_structure")
    return deps.sendGameMessage({ type: "SET_CONVERTER_STRUCTURE_ENABLED", x: deps.selected.x, y: deps.selected.y, enabled: true });
  if (actionId === "disable_converter_structure")
    return deps.sendGameMessage({ type: "SET_CONVERTER_STRUCTURE_ENABLED", x: deps.selected.x, y: deps.selected.y, enabled: false });
  // Aether Tower on/off switch rides along here rather than in its own
  // dispatcher: handleTileAction in client-action-flow.ts is at its line
  // budget, so it routes both structure toggles through this one call.
  if (actionId === "enable_observatory" || actionId === "disable_observatory")
    return deps.sendGameMessage({ type: "SET_OBSERVATORY_ENABLED", x: deps.selected.x, y: deps.selected.y, enabled: actionId === "enable_observatory" });
  if (actionId === "set_converter_structure_mode") {
    const targetMode = converterModeOf(deps.selected.economicStructure) === "SYNTHESIZE" ? "EXCHANGE" : "SYNTHESIZE";
    return deps.sendGameMessage({ type: "SET_CONVERTER_STRUCTURE_MODE", x: deps.selected.x, y: deps.selected.y, mode: targetMode });
  }
  return false;
};
