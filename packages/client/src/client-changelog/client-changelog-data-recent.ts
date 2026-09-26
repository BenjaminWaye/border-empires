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
  },
  {
    createdAt: 1789933799387,
    introducedIn: "2026.09.25.1",
    title: "MARCH flags take the straightest route to their target",
    why: "A MARCH flag picked whichever next tile left the fewest tiles to the target, ignoring how far the company had to march to get there, so it could wander down a long stretch of your own land to reach a fight near the target instead of heading straight for it.",
    changes: [
      "MARCH now counts the whole route from the flag to the target and follows the straightest one, preferring tiles on the direct line from the flag. Pick a different target if you want it to take another way",
      "When two routes are equally short, MARCH now attacks enemy frontier ground rather than settled ground"
    ]
  }
];
