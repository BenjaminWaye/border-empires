import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SHADER_NOISE_SEAMS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.15",
  title: "Smooth textures on roads, beaches and wonders on phones",
  why: "The fix that stopped the unexplored fog breaking into blocky rectangles on some phones applies to other 3D surfaces too.",
  changes: [
    "Dirt roads, the wet-sand band on beaches, natural wonder grounds, incursion breaches, marble bases and relics now draw their texture noise the same way on every device, so it can no longer split into cell-sized blocks.",
    "Their mottling patterns look a little different everywhere as a result."
  ]
};
