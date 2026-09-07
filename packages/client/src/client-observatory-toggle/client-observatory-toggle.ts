import { converterStructureMenuEntries, type ConverterMenuDeps } from "../client-converter-menu.js";
import type { Tile, TileActionDef } from "../client-types.js";

// Aether Tower (Observatory) enable/disable menu entries, plus the combined
// entry point client-tile-action-logic.ts calls for every on/off switch a
// tile can offer. Lives outside that file (and outside client-converter-menu.ts,
// whose entries are all economicStructure-shaped) so both stay within their
// line budgets -- AGENTS.md.

export const observatoryToggleMenuEntries = (tile: Tile, deps: ConverterMenuDeps): TileActionDef[] => {
  const observatory = tile.observatory;
  if (!observatory) return [];
  // The Watchtower Engine's free tower is re-stamped active by the wonder
  // itself and costs no CRYSTAL, so it has no switch (matches the sim's
  // OBSERVATORY_TOGGLE_INVALID rejection for the same tile).
  if (tile.naturalWonder?.type === "WATCHTOWER_ENGINE") return [];
  // Only a finished tower can be switched; under_construction/removing towers
  // have their own Cancel/Remove actions instead.
  if (observatory.status === "active") {
    return [
      {
        id: "disable_observatory" as TileActionDef["id"],
        label: "Disable Aether Tower",
        detail: deps.buildDetailTextForAction("disable_observatory", tile)
      }
    ];
  }
  if (observatory.status !== "inactive") return [];
  const tileNotSettled = tile.ownershipState === "FRONTIER";
  return [
    {
      id: "enable_observatory" as TileActionDef["id"],
      label: "Enable Aether Tower",
      detail: deps.buildDetailTextForAction("enable_observatory", tile),
      ...deps.tileActionAvailability(
        !tileNotSettled,
        tileNotSettled ? "Tile is not settled" : "",
        "Vision, crystal casting, and CRYSTAL slot upkeep resume"
      )
    }
  ];
};

/** Every structure on/off switch this tile offers — converter structures and Aether Towers. */
export const structureToggleMenuEntries = (tile: Tile, deps: ConverterMenuDeps): TileActionDef[] => [
  ...(tile.economicStructure ? converterStructureMenuEntries(tile, deps) : []),
  ...observatoryToggleMenuEntries(tile, deps)
];

export const observatoryToggleDetailText = (actionId: string): string | undefined => {
  if (actionId === "disable_observatory")
    return "Switch this Aether Tower off. It stops giving vision, stops powering crystal abilities and Sky Docks, and stops occupying CRYSTAL slots until you enable it again. Nothing is lost — the tower stays built.";
  if (actionId === "enable_observatory")
    return "Switch this Aether Tower back on. It resumes its vision bonus and crystal casting, and starts occupying CRYSTAL slots again (each tower you own costs progressively more).";
  return undefined;
};
