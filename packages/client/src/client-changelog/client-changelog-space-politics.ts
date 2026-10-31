import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SPACE_POLITICS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793460638169, // Date.now() captured once for this entry.
    introducedIn: "2026.10.31",
    title: "Space: AI Dukes, grievances, Writs and the Blind Eye",
    why: "The space layer had little to do between seasons, raids won the attacker nothing, and with few players there was nobody to play politics with.",
    changes: [
      "Sectors won by AI empires are now held by AI Dukes, named for their House. They build, probe, raid, wager against the Court and take Writs, using the same rules as you. Their Sectors do not lower Court Strength",
      "Declare a grievance against a rival Duke for 5 Influence. For 14 days, each of your raids that gets through on them earns 3 Renown and takes up to 3 of their Influence. Renown counts toward Domain Weight. A grievance with no hits costs 2 Renown",
      "The Court now sends private Writs of Advancement: a free Fighter, or a Court Fighter that raids a rival. Taking one gives the Court back 3 Strength. Refusing leaves no trace",
      "A Duke whose Domain Weight stays at 1.5 times second place for a Cycle loses the Court's Favor. Their weakest Sector loses 4 Stability each Cycle, Court protection stops covering them, and rivals can declare against them for free, earning double Renown. Lending a Fighter to the Court for 7 days restores its Favor",
      "Raids in the air are drawn on both the 2D strategic map and the 3D galaxy, so everyone can watch one coming",
      "The Warden pool is now shared across every Planet, AI Dukes' included, so each Planet is attacked a little less often"
    ]
  }
];
