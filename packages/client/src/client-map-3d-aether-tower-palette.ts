// Shared Aether Tower palette — the visual shorthand for the empire's Aether
// network. Every Aether Tower (and its future matching 2D icon) tells the same
// three-way material story: dark iron engineering, weathered brass machinery
// and luminous cyan aether energy. Keeping the swatch in one module lets the 3D
// overlay, its regression tests and the 2D icon all read from the same source
// of truth instead of drifting apart.

export const AETHER_TOWER_COLORS = {
  // Metals — dark iron skeleton, aged brass clockwork, copper trim.
  brass: "#b08d55",
  brassBright: "#cfa86a",
  brassDark: "#7c6134",
  copper: "#a8643a",
  iron: "#2c2e34",
  ironDark: "#23262b",
  // Aether energy — cyan/blue-white luminous core fading to deep ice blue.
  aetherCore: "#bff2ff",
  aetherBright: "#eaffff",
  aetherMid: "#9fe6ff",
  aetherDeep: "#46bbee"
} as const;

export type AetherTowerColor = (typeof AETHER_TOWER_COLORS)[keyof typeof AETHER_TOWER_COLORS];