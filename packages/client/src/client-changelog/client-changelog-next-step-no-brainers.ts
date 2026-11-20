import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const NEXT_STEP_NO_BRAINERS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Next step only shows when something runs low",
  why: "The tutorial teaches the game. Next step was turning into a second tutorial that never ended.",
  changes: [
    "Next step no longer suggests a Relay Beacon or counts down to the next Manifest just because a Dev slot is free. It stays hidden until manpower, coin or FOOD runs low.",
    "Low manpower: take the nearest neutral town (shows the max MP and MP per batch it adds), activate or claim a waystation, or ship salvage. With none of those in sight, Explore points at the nearest unexplored ground.",
    "Low coin: build a Manufactory, which gives +10 Coin as soon as it is built.",
    "Low FOOD: grain or fish inside your reach says Expand, then garrison. Outside your reach, tap Relay Beacon to start placing one on your land nearest it."
  ]
};
