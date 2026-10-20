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
  },
  {
    createdAt: 1792530292230, // Date.now() captured once for this entry.
    introducedIn: "2026.10.20.5",
    title: "Yours reads like a battle report",
    why: "Your activity list repeated the same capture twice, split one fight into unrelated rows and gave every line the same weight.",
    changes: [
      "A capture shows up once, and an attack you repelled reads as one line with the tile you seized from the attacker",
      "Bursts of attacks against or from one rival fold into a single line, such as \"Your assault on Maren: 3 attacks, all repelled\"",
      "A new Rivals section tallies the ground you took and lost against each opponent and who is ahead",
      "Fights name the Palisade or Fort involved and show the manpower they cost",
      "Each line is coloured and marked by whether you gained ground, lost it or held",
      "Coin totals too small to matter no longer appear in the headline, and \"−0 coin raided\" is gone"
    ]
  }
];
