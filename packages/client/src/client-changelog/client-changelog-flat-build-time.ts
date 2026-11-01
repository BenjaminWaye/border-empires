import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FLAT_BUILD_TIME_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793516167643,
    introducedIn: "2026.11.01",
    title: "Every building finishes in 1 minute",
    why: "Manpower is what limits how much you build. Build times that grew with cost just made you wait.",
    changes: [
      "Every building, Fort and Siege tier now builds in 1 minute and is removed in 30 seconds",
      "Fortification Patterns (Bastion I): Forts cost 50% less manpower instead of building twice as fast",
      "Relay Fabrication Line (Dominion I): Relay Beacons cost 67% less manpower instead of building 3 times as fast",
      "Universal Fabrication Line (Dominion V): all buildings cost 50% less manpower instead of building twice as fast",
      "Cancelling a build refunds the discounted manpower you actually paid",
      "Buildings already under construction keep their current finish time",
      "The retired Quartermaster's Office is removed from the game; any left on the map are cleared"
    ]
  }
];
