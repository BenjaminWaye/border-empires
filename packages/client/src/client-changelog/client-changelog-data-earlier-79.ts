// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_79: ClientChangelogEntry[] = [
  {
    createdAt: 1789549757917, // frozen, one past the previous newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.3",
    title: "Server no longer re-scans the whole world on every income tick (prod stall fix)",
    why: "Three server hot spots kept the production simulation over its CPU budget even after the auto-settle fixes earlier today, which the host then throttles until logins and commands stall. Every 15-second income update scanned all 202,500 world tiles per player just to count Weapons Factories; every minute the population-growth pass threw away each player's cached economy for no reason (growth doesn't change income -- only a town's tier or fed status does), forcing a full re-derivation of large empires' economy and trade network; and the metrics endpoint sorted every latency series three times per scrape.",
    changes: [
      "Weapons Factory counts in the Manpower/Combat modifier breakdown are now read from the same live structure index combat already uses, so the breakdown always matches the multiplier actually applied in battle",
      "Population growth no longer forces an economy recompute unless a town's fed status actually changed",
      "No gameplay, cost, or timing changes -- this is purely server load"
    ]
  }
];
