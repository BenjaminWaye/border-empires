import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INFRASTRUCTURE_CHANGELOG: readonly ClientChangelogEntry[] = [
  {
    createdAt: 1792996913204, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.1",
    title: "Renewed frontier infrastructure",
    why: "Extraction, trade and field infrastructure needed clearer identities and a consistent architectural finish.",
    changes: ["Mine, Harbor Exchange, Relay Beacon and Aether Tower have renewed 3D models and matching 2D artwork. Mines retain distinct Titanium and Crystal loads, and tower animations and disabled states are preserved.", "Umbrite Rig keeps its existing machinery on a matching marble platform. Gameplay effects and costs are unchanged."]
  },
  {
    createdAt: 1793000020608, introducedIn: "2026.10.26.1", title: "Orbital Relay Beacon",
    why: "Relay Beacon needed to explain how it extends settlement reach.",
    changes: ["A skyward receiver dish and local transmitters relay the House AI’s orbital command signal. Updated 3D model, matching 2D art and lore; reach rules are unchanged."]
  },
  {
    createdAt: 1793020488390, introducedIn: "2026.10.26.1", title: "Gravitational Relay Beacon",
    why: "The House AI’s orbital link should express the civilisation’s advanced technology.",
    changes: ["Replaced the radio dish with nested gravity-sensing frames and a suspended instrument. Local field projectors explain settlement reach. Updated lore, descriptions, 3D and matching 2D art. Construction completes the mast before revealing the sensing frames."]
  },
  {
    createdAt: 1793015430836, introducedIn: "2026.10.26.1", title: "Relay Beacon finish",
    why: "The orbital receiver needed cleaner reflections and more convincing mechanical joins.",
    changes: ["Smoothed the curved receiver, refined its brass seams and added transmitter mounts, cable routing and a recessed service hatch. Both 3D and matching 2D artwork updated."]
  },
];
