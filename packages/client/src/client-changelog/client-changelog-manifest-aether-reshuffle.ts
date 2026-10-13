import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_MANIFEST_AETHER_RESHUFFLE: ClientChangelogEntry[] = [
  {
    createdAt: 1791923806383, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.2",
    title: "Aether Manifests reshuffled, and real icons in Manifest details",
    why: "Aether EMP only hits Ambaric Transformers, which no one has early on, yet it sat at Tier 2. Survey Sweep and Reveal Empire were split across two Manifests, and the Manifest details marked every building and ability with the same generic symbol.",
    changes: [
      "Counterphase Core Module (Aether EMP) now sits at the end of the Aether branch, after Resonance Grid Module",
      "Tideway Lattice Module (Aether Bridge) moves into EMP's old Tier 2 slot, straight after Aether Resonance Core; Aetherward Coil Module (Aether Wall) now follows it",
      "Augury Office now unlocks Survey Sweep as well as Reveal Empire and Reveal Stats, at Tier 2; Echo-Reader Crew is gone, and if you owned it you now own Augury Office",
      "Hidden Hand now needs Augury Office instead of Counterphase Core Module",
      "\"What you get\" in Manifest details shows each building's own map art, each ability's own symbol, and the resource icon for revealed resources",
      "The Hydrogarden shows its new hydroponic dome in the build menu, and Hydroworks gets its own thumbnail"
    ]
  }
];
