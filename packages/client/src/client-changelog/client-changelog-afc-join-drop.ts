import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_AFC_JOIN_DROP: ClientChangelogEntry[] = [
  {
    createdAt: 1790766710747,
    introducedIn: "2026.09.30.7",
    title: "Your AFC lands from orbit",
    why: "Joining a season dropped you onto a map where your Automated Fabrication Complex was already sitting there, with nothing to mark the moment your empire begins.",
    changes: [
      "When you join a season, your AFC now lands from orbit in a slow re-entry, braking burn and dust cloud, in both the 3D map and the 2D fallback",
      "It waits until you have closed the changelog, tutorial and any other dialogs and your eyes are on the map, and it plays once per AFC"
    ]
  },
  {
    createdAt: 1791434436666,
    introducedIn: "2026.10.08.1",
    title: "Your AFC's landing has sound",
    why: "The orbital landing of your Automated Fabrication Complex played in silence.",
    changes: [
      "A rocket roar now plays as your AFC starts its landing from orbit, in both the 3D map and the 2D fallback",
      "It follows your music mute and volume settings and plays over the soundtrack without interrupting it"
    ]
  }
];
