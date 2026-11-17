import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TRUCE_TIME_LEFT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Truce and alliance timers show hours and minutes",
  why: "Time left on a truce was rounded up to the next whole hour, so a truce with 1h 5m left read \"2h\".",
  changes: [
    "Diplomacy, Alliances, the empire strip and map tags now show time left as hours and minutes, e.g. \"Truce 1h 23m\", instead of rounding up to the next hour.",
    "Alliance break notices, Launch Attack on a breaking ally and pending offers count down the same way."
  ]
};
