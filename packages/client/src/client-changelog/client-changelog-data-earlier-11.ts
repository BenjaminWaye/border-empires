// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_11: ClientChangelogEntry[] = [
  {
    createdAt: 1788425000000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.2",
    title: "Tech details now show where to find a strategic resource",
    why: "The tech that reveals Titanium, Crystal, or Umbrite told you it was revealed but not what the resource looks like or where on the map to look for it, especially if you hadn't stumbled onto a deposit yet.",
    changes: [
      "The tech detail panel now shows a \"Resource revealed\" card on the tech that reveals Titanium/Crystal/Umbrite, with the resource's icon/color and a hint of where it tends to be found"
    ]
  },
  {
    createdAt: 1788451366292, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Muster flag Expand Capacity: capped at your manpower cap, and the menu now stays open to press again",
    why: "A muster flag's cap could be raised past the player's own manpower cap with enough Expand Capacity presses, letting a flag demand more manpower than the empire could ever actually hold -- the exact problem the cap was meant to prevent, just moved up a level. Separately, pressing Expand Capacity closed the tile menu every time, forcing the player to reopen it before the next press even though the whole point is pressing it repeatedly.",
    changes: [
      "A muster flag's cap can no longer be raised above the player's manpower cap, however many times Expand Capacity is pressed; the action now disables itself once a flag is already maxed out",
      "The tile menu now stays open after pressing Expand Capacity, updating live as the new cap comes back from the server, so you can press it again right away"
    ]
  },
  {
    createdAt: 1788446839833, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Settle + Build combo now finishes its build step after a server restart",
    why: "A combined \"Settle and Build X\" order registers its build as a follow-up step behind the settlement. If the server restarted while that settlement was still in progress, the settlement itself would still complete on restart, but the queued build step was silently dropped -- the tile ended up permanently settled with nothing built and no error shown.",
    changes: [
      "A settlement that was still in progress during a server restart now correctly starts its queued build once the settlement completes"
    ]
  }
];
