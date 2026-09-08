// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_11: ClientChangelogEntry[] = [
  {
    createdAt: 1788420390853, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.18",
    title: "Muster flags now have a starting capacity you expand on purpose",
    why: "A muster flag's only ceiling used to be your total manpower cap, so one flag -- especially with just a single flag active -- could pull in your whole pool, leaving nothing in reserve for defense or a second flag. Flags now default to 10% of your manpower cap (never more than 150), and you raise it deliberately with a new \"Expand Capacity\" action on the flag -- free for now while a proper resource cost for it is designed.",
    changes: [
      "Muster flags now default to 10% of your manpower cap (capped at 150) instead of your full manpower cap, so a single flag can no longer lock up your whole pool by default",
      "Added \"Expand Capacity\" to the muster flag menu: permanently add another 10%-of-manpower-cap share to that flag's cap, as many times as you want",
      "The muster flag menu now shows staged manpower against the flag's current cap (e.g. \"45/72\")"
    ]
  },
  {
    createdAt: 1788421282954, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.18",
    title: "Reach now claims and re-heals your territory automatically",
    why: "Reach previously only gated where you were ALLOWED to EXPAND/SETTLE -- it never actually did anything to the ground on its own, and a FRONTIER tile lost to decay or encirclement just sat neutral forever until someone spent manpower re-claiming it. Reach now does the work itself: any genuinely neutral tile your reach grows onto is claimed FRONTIER for free the instant it happens, every resource/town/dock tile you hold FRONTIER inside your reach settles itself the same way AI settlement already did, and a tile that reverts to neutral re-heals back to FRONTIER after 30 minutes if it's still neutral and still inside your reach when the timer is up.",
    changes: [
      "A neutral tile that enters your reach is now auto-claimed FRONTIER immediately, at no manpower or gold cost",
      "Every resource, town, and dock tile you hold FRONTIER inside your reach now settles itself automatically for everyone (previously AI-only), at the same manpower/gold cost and duration as manually clicking SETTLE",
      "A FRONTIER tile that reverts to neutral (out-of-reach decay or encirclement) now automatically re-heals back to FRONTIER after 30 minutes, provided it's still neutral and still inside your reach at that point"
    ]
  },
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
