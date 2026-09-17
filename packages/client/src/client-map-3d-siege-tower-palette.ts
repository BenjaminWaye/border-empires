// Shared Siege Tower palette — the visual shorthand for the two upgraded siege
// variants that replace the low watchtower+catapult with a real siege tower.
// Both tell the same steampunk material story (heavy black iron skeleton, aged
// brass gimbals, one enormous glowing aether lens), but each tier reads as a
// distinct weapon: SIEGE_TOWER fires a cyan-violet beam, DREAD_TOWER a hotter
// molten violet-magenta beam out of a bulkier, darker frame. Keeping the swatch
// in one module lets the 3D overlay and its regression tests read one source of
// truth instead of drifting apart.
export type SiegeTowerVariant = "SIEGE_TOWER" | "DREAD_TOWER";

export type SiegeTowerPalette = {
  readonly iron: string;
  readonly ironDark: string;
  readonly brass: string;
  readonly brassBright: string;
  readonly brassDark: string;
  readonly lensEmissive: string;
  readonly lensCore: string;
  readonly halo: string;
  readonly beamViolet: string;
  readonly beamCyan: string;
};

export const SIEGE_TOWER_PALETTES: Record<SiegeTowerVariant, SiegeTowerPalette> = {
  SIEGE_TOWER: {
    iron: "#23252c",
    ironDark: "#191b20",
    brass: "#9b7b51",
    brassBright: "#b08a54",
    brassDark: "#6f5a38",
    lensEmissive: "#8f6bff",
    lensCore: "#9feaff",
    halo: "#5798ff",
    beamViolet: "#a85cff",
    beamCyan: "#2fd6ff"
  },
  DREAD_TOWER: {
    iron: "#191a1f",
    ironDark: "#101116",
    brass: "#6f5f40",
    brassBright: "#8a7450",
    brassDark: "#4e4230",
    lensEmissive: "#c03aff",
    lensCore: "#ff85f0",
    halo: "#d93cff",
    beamViolet: "#ff41d9",
    beamCyan: "#ff9cf0"
  }
} as const;