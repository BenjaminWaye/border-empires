// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_11: ClientChangelogEntry[] = [
  {
    createdAt: 1788373475633, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.15",
    title: "3D map: rival border lines no longer cross yours (real fix, not just the connect-time budget patch)",
    why: "The earlier fix for crossing border lines only patched how rival borders got pushed to you on connect -- but the 3D map's rival-border overlay itself still fell back to guessing a rival's territory from a plain union of their town/dock/outpost radii whenever authoritative server data hadn't arrived yet for that owner. That guess could never see the server's own contest resolution between neighboring empires, so two owners' boundary lines still didn't reliably land on the same shared line: they'd either miss each other or visibly cross. The 3D overlay now reads each tile's actual, already-contest-resolved reach owner straight from the tile data you already have, the same way ownership itself is drawn, instead of guessing.",
    changes: [
      "Rival territory borders on the 3D map are now traced from the server's real, already-resolved reach data instead of a local guess, so they no longer visibly cross your own or a neighbor's border"
    ]
  },
  {
    createdAt: 1788373600000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.16",
    title: "Titanium and Thunder Bastions now appear on the 3D map after being built",
    why: "The 3D renderer only ever drew FORT, Wooden Fort, and Siege Outpost meshes — the TITANIUM_BASTION and THUNDER_BASTION variants were never wired into the fort overlay's instance switch, so a bastion tile stayed completely bare on the 3D map even though the game state had the active structure. Only the 2D canvas fallback (which reuses the same fort ring for all fort tiers) ever showed them.",
    changes: [
      "Titanium Bastions and Thunder Bastions now render on the 3D map with their own metal-tinted walls and towers, including the same gate opening as the 2D renderer"
    ]
  },
  {
    createdAt: 1788378181284, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.17",
    title: "New players now spawn farther from existing empires",
    why: "Joining players were placed at the first precomputed spawn site that happened to still be open, in the site roster's original fill order -- a spread-out roster overall, but not necessarily the best remaining choice once other players had already claimed nearby sites. Picking is now based on which open site is actually farthest from every currently-settled player, so a new empire lands with as much breathing room as the map allows instead of settling for whichever open slot came first in list order.",
    changes: [
      "Joining and respawning players are now placed on the open starting location farthest from every other player's territory, instead of just the first available site in the precomputed roster"
    ]
  },
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
    createdAt: 1788373700000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.18",
    title: "Clicking an adjacent tile to expand with 0 manpower now shows a clear warning",
    why: "Clicking a neutral tile next to your border checked gold up front and showed an immediate \"Insufficient gold\" alert on failure, but had no matching check for manpower -- a 0-manpower click instead silently queued a durable waypoint that only ever surfaced a quiet feed-panel line once it got drained later, so the click looked like it did nothing.",
    changes: [
      "Clicking an adjacent neutral tile with insufficient manpower now shows an immediate \"Insufficient manpower\" alert, matching the existing insufficient-gold warning"
    ]
  },
  {
    createdAt: 1788382181806, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.19",
    title: "3D map: fixed a border 'gate' popping up where two of your own territory pieces touched at a single corner",
    why: "The border-line tracer walks your reach boundary corner by corner. Where two pieces of your own territory touch only diagonally (at a single grid point, not a shared edge), that corner has two valid ways to continue the walk -- one belonging to each piece -- and the tracer picked between them arbitrarily instead of by which one actually continued the direction you were walking in. Picking wrong sent the walk off onto the wrong piece's perimeter and back, which could stitch two distant parts of the border into one loop with a long bogus connecting chord; that chord then got dropped as clearly bogus, leaving two real border posts standing with no line between them -- a visible gap in an otherwise solid border.",
    changes: [
      "The 3D map border line no longer shows a gap/opening where two pieces of your own territory meet at a single corner"
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
