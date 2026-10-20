import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SIEGE_REPORTS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792527758981, // Date.now() captured once for this entry.
    introducedIn: "2026.10.20.4",
    title: "Siege reports in Yours",
    why: "When a fortified tile fell, Activity only listed each attack separately, so you couldn't see how hard your defenses had made the enemy work for it.",
    changes: [
      "Repeated attacks on one of your tiles now appear as a single siege in a new Sieges section at the top of Yours",
      "Each siege shows the Palisade, Fort or Bastion that defended it, how many assaults it held off, who attacked, how much manpower it cost them and how long it lasted",
      "Sieges you are still holding show up too, and the costliest stand is listed first"
    ]
  }
];
