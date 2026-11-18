import type { ClientChangelogEntry } from "./client-changelog-data.js";

// createdAt is set where this is listed in client-changelog-data.ts, which is
// the only file the changelog gate (scripts/check-client-changelog-update.mjs) reads.
export const CONSISTENT_NUMBERS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Numbers that agree from screen to screen",
  why: "Playtesters found the same thing counted differently on different screens: a build that charged twice its listed manpower, town population and coin that disagreed between the Towns list and the town itself, and several labels that didn't say what their number meant.",
  changes: [
    "A queued build that you send yourself now charges its listed manpower once; above your manpower cap it used to charge double",
    "Claiming an unowned town now counts in the Chronicle's \"Last 24 hours\" towns",
    "Towns list and town capture card show population toward the next tier, like the town screen, and the column reads Coin/day",
    "A town's coin in the Towns list updates when its income changes instead of keeping an old figure",
    "Manpower above the cap shows how far over you are and that regen waits until you spend below it",
    "Muster flags show the same whole \"amount / cap\" in the Manpower panel and the tracker, including expanded flags",
    "A slot shortfall on the phone bar now reads −4 instead of the same 4 used for free slots",
    "Integrity explains that 100% is relative to your empire's size, and says when the new-empire floor is holding it up",
    "Relay Beacon and other garrison-and-build buttons split the total into garrison and build cost",
    "The deal header says \"you have N\" for your own tile count"
  ]
};
