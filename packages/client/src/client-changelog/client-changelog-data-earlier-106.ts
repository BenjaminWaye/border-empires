import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_106: ClientChangelogEntry[] = [
  {
    createdAt: 1791920134069, // Date.now() frozen for this entry.
    introducedIn: "2026.10.13.1",
    title: "New towns on the 3D map",
    why: "Towns on the 3D map looked out of place next to the bright terrain and the AFC.",
    changes: [
      "Every town tier on the 3D map has new art: clockwork skyscrapers of glass and grey stone banded in brass, with lamplit windows and crowns of brass cog clocks, needle spires, glowing alien bulbs and finned crystals, on an octagonal base plate",
      "Towns and cities are laid out on street grids with lamplit crossings, parks and skybridges between their towers, and cities rise to a downtown of sheer glass skyscrapers",
      "Towns grow visibly through their tiers, from a few low towers round a cog lamp to a metropolis round a brass-haloed megatower crowned with an aether crystal",
      "Towns are alive: steam rises from rooftop stacks, windows flicker with lamplight, clock cogs and orreries turn, crystals spin, and airships circle the bigger cities",
      "Neighbouring towns of the same tier now face different ways, so they no longer look like copies"
    ]
  },
  {
    createdAt: 1791921253260, // frozen Date.now() value for this release
    introducedIn: "2026.10.13.1",
    title: "Empire Integrity moves to the Economy panel",
    why: "Playtesters watched Empire Integrity fall as they expanded and read it as being punished. In fact it was still a bonus, and some updates briefly showed it lower than it really was.",
    changes: [
      "Empire Integrity now lives in the Economy panel; the top bar only shows it, with a warning, once it drops below 50% and actually reduces your coin and growth",
      "Fixed integrity sometimes showing lower than it really was (e.g. 80% for a small new empire) after changing your profile or colour, toggling auto-garrison, or using an ability"
    ]
  },
  {
    createdAt: 1791927499454, // frozen Date.now() value for this release
    introducedIn: "2026.10.13.1",
    title: "Top bar icons are labelled",
    why: "Playtesters couldn't tell what the icons in the top-right corner opened without hovering over each one.",
    changes: [
      "Manifest, Allies, Ranks, Activity, Sharding and Settings now show their name under the icon on desktop",
      "The Alerts (bell) button has been removed from the top bar and the mobile menu while the alerts feed is reworked -- the Activity dashboard is where to see what happened"
    ]
  }
];
