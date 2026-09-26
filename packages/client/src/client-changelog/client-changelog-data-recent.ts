import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_RECENT: ClientChangelogEntry[] = [
  {
    createdAt: 1789933799381,
    introducedIn: "2026.09.23.1",
    title: "Space View gets a flat strategic map of the whole galaxy, with the Court at the centre",
    why: "Space View only had a 3D orbit view, so there was no way to read at a glance where you sit in the galaxy, who your neighbours are, or how far you are from the centre of power. Territory was also invisible as territory: every system was just a separate dot.",
    changes: [
      "Zoom out from your system past the wide galaxy view -- or press the new Strategic Map button in Space View -- to see a flat 2D map of every system",
      "Systems connect to their real nearest neighbours; a Duke's adjacent systems merge into one bigger territory patch instead of separate dots",
      "The Court is drawn as a fixed landmark at the centre and is not on any travel route",
      "Only your own, contested, and threatened systems are labelled, so the map stays readable with hundreds of systems; click any system to fly in on it",
      "Any raid that gets through to an undefended Sector now costs a flat 20 Stability, whatever size the attacking fleet is, so a Sector takes five hits to fall into contestation instead of being wiped by one big raid"
    ]
  }
];
