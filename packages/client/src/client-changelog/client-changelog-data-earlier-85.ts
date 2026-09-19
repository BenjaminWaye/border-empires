import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_85: ClientChangelogEntry[] = [
  {
    createdAt: 1789375785264, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.14.02",
    title: "The main game HUD got a steampunk-futuristic visual pass -- brass, copper, riveted panels",
    why: "The core HUD chrome (login screen, panel frames, buttons, resource readouts, progress bars) used a generic dark sci-fi-dashboard palette that didn't feel distinct to this game or match Space View's existing steampunk redesign.",
    changes: [
      "New brass/copper/verdigris/aged-leather color palette and Cinzel (headers) + Spectral (body) + Space Mono (numeric readouts) fonts applied across the base HUD background, login/auth screen, side panels, and shared buttons",
      "The login screen's card is now a riveted brass-bordered panel with an engraved inner bevel instead of a soft rounded modern card",
      "Resource pills, the top strip, and side-panel frames now use brass borders and an aged-leather background instead of the old cold blue-gray",
      "Build/queue progress bars now read as analog brass pressure gauges -- tick-marked track, warm glowing brass fill -- instead of a flat modern progress bar",
      "Individual feature panels (fleet, senate, muster, tech tree, season lobby, etc.) still use their prior colors in this pass -- broader coverage is a follow-up"
    ]
  }
];
