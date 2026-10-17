import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_100: ClientChangelogEntry[] = [
  {
    createdAt: 1791527749820, // frozen Date.now() value for this release
    introducedIn: "2026.10.09.1",
    title: "Manpower refills every 4 hours, shown as a gauge",
    why: "Manpower crept up a few points a minute, so \"can I afford this attack yet?\" meant watching a number tick, and a short wait for one more attack felt like a constant chore.",
    changes: [
      "Manpower is now paid out in one refill every 4 hours instead of ticking up continuously. Your total regeneration is unchanged, it just lands in chunks; each player's refill moment is staggered, so yours is not the same as everyone else's",
      "The Manpower chip is now a brass gauge: the fill shows what you can spend right now (ember when below an ordinary attack, green when full, shimmering above the cap), copper plating shows manpower already staged in muster flags, and a countdown shows when the next refill lands",
      "The Manpower panel now shows what one refill pays, when the next refill is, and how long until you are full",
      "The Development chip is now a row of gears, one per slot: busy slots spin, free slots sit still, and a full set glows copper. It takes much less room on the top bar",
      "All top-bar chips (Player, Coin, Manpower, Integrity, Development) now match the brass-and-leather style of the resource pills, and on phones Integrity and Development line up with the other chips"
    ]
  },
  {
    createdAt: 1791579529000, // frozen Date.now() value for this release
    introducedIn: "2026.10.09.1",
    title: "Top ribbon hover highlight no longer blinks",
    why: "The gold hover border on the top-bar chips flickered because the bar redraws often and each redraw restarted the fade-in.",
    changes: [
      "Hovering a top-bar chip now keeps a steady highlight"
    ]
  },
  {
    createdAt: 1791581686000, // frozen Date.now() value for this release
    introducedIn: "2026.10.09.2",
    title: "Choose your effort when launching an attack",
    why: "Committing extra manpower to a fight was only possible through March To. Launch Attack always sent the minimum.",
    changes: [
      "Launch Attack on a settled enemy tile now opens the Normal / Extra / Double effort picker March To uses, with a live win chance",
      "Attacks on several tiles (box-select or Attack Connected Region) get one picker that applies to each settled target",
      "Expand To & Attack asks for an effort level too; the waypoint's final attack uses it, even while you're offline",
      "Frontier and barbarian targets still attack on the first click, since extra manpower doesn't improve odds there"
    ]
  },
  {
    createdAt: 1791643448668, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.10.1",
    title: "Better starter sites and accurate checklist goals",
    why: "A nearby town was not always reachable, and claiming food without garrisoning it looked like progress even though it supplied no food slots.",
    changes: [
      "New worlds require 50 spaced starter sites with first food within three land steps and AFC reach, four food slots within six, and a town within eight; live joins recheck neutral routes and amenities before using those sites",
      "The existing town-first checklist still highlights town and food tiles directly in both map renderers; only garrisoned food counts as usable food slots",
      "Your AFC's reach is included in local target selection, and pending targets stop highlighting until their action resolves",
      "Upgraded towns and lightweight town data count correctly, and enemy towns are not suggested as neutral expansion goals"
    ]
  }
];
