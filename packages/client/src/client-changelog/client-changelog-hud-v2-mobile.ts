import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HUD_V2_MOBILE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793742390269, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "The new HUD comes to phones",
    why: "Phones were still on the old HUD, with eight small tab buttons and panels that covered the map.",
    changes: [
      "Phones get the new HUD: your resources along the top, the tracker and victory race under them, and a tab bar at the bottom for Manifest, Towns, AFC, Diplomacy, Ranks and Chronicle, each with its name under the icon",
      "Tap the resource bar to open the Treasury with every resource and its daily rate; tap a resource there for its breakdown",
      "The tracker folds to one line (what needs you, dev slots, flags, the attack landing); tap it to unfold",
      "Tapping a tile opens its actions in a panel at the bottom, with the main action large and first",
      "Chronicle opens as a half-height sheet over the map; Show centres the map above it",
      "Town and battle screens fill the screen, with their buttons at the bottom",
      "Your phone's back gesture closes the open screen or sheet",
      "Turned sideways, panels dock to the right so the map keeps its height",
      "Prefer the old phone HUD? Open the game with ?hud=legacy"
    ]
  }
];
