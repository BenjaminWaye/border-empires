// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
//
// Unlike the other earlier-N files, this one is intentionally NOT imported
// by client-changelog-data.ts: every entry here already aged out of the
// "latest week" rolling window at the moment it was written (moved out of
// client-changelog-data-earlier-65.ts and -76.ts to fix
// client-changelog.test.ts's "keeps only the latest week" check, which
// checks every currently-imported entry, not just the newest ones). Kept on
// disk as a historical record per this directory's convention, just
// unreferenced.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_80: ClientChangelogEntry[] = [
  {
    createdAt: 1789225435143, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.02",
    title: "Siege Outposts, Siege Towers, and Dread Towers build directly on frontier ground -- no settling first, and their attack bonus applies immediately",
    why: "Placement for the siege ladder already skipped the SETTLED requirement other structures need, but a friendly outpost's attack-aura bonus only ever applied from a SETTLED tile, and the build button still queued a settle-then-build chain (spending gold/manpower to settle a tile the structure never needed settled) that also blocked it outside your own reach even when the tile sat inside another player's -- exactly where a forward siege outpost is meant to be pushed.",
    changes: [
      "A Siege Outpost/Siege Tower/Dread Tower built on a FRONTIER (claimed but unsettled) tile now grants its attack multiplier to nearby attacks immediately, the same as one on a settled tile -- this also fixes the attack-preview shown before committing an attack, which previously undercounted the bonus from a frontier-tile outpost",
      "The \"Build Siege Outpost\"/\"Upgrade to Siege Tower\"/\"Upgrade to Dread Tower\" button no longer settles the tile first -- it builds directly on FRONTIER ground, with no settle cost/time added and no \" • settles this tile first\" label",
      "The siege ladder can now be built on an owned FRONTIER tile that currently sits inside another player's reach, not just your own -- it's still blocked only when no one's reach covers the tile at all",
      "Fixed a misleading \"Need a free UMBRITE slot\" (or other resource) message on a disabled build/upgrade button when 2+ slots were actually required (Siege Tower needs 2 UMBRITE, Dread Tower needs 3, a 2nd+ Observatory needs 1 more CRYSTAL per copy owned) -- freeing exactly one slot left the same message showing, looking stuck. It now names the real count and how many are currently free, e.g. \"Need 2 free UMBRITE slots (have 1)\""
    ]
  },
  {
    createdAt: 1789225435144, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.03",
    title: "Siege Battery/Tower/Dread Tower fire on their own attacking battles (true-3D map only)",
    why: "Siege structures gave a static damage bonus but never visibly reacted to the fights they were boosting.",
    changes: [
      "When your attack starts a battle and you own a nearby Siege Battery/Tower/Dread Tower, it snaps to aim and fires a purple Umbrite explosion on the battle tile -- attacker-owned structures only, cosmetic, no change to combat odds",
      "True-3D renderer only for now -- 2D canvas fallback players won't see it"
    ]
  },
  {
    createdAt: 1789198795334, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.03",
    title: "Fixed: a shard that no longer exists could get stuck on your tile, refusing to collect",
    why: "A shard site that expired (or was already collected) while your tile was out of view could get stuck showing on your map forever. Reselecting the tile didn't help: the tile-detail refresh that's supposed to re-sync a tile treated a shard's absence as \"unchanged\" rather than \"gone\", and re-served the same phantom shard every time you looked. Pressing Collect Shard then failed with \"no shard present\" every single time -- silently, with only a muted line in the feed, so it looked like nothing had happened at all.",
    changes: [
      "A full tile-detail refresh now explicitly reports \"no shard here\" for your own tiles, so a stale shard disappears as soon as you select the tile",
      "A rejected Collect Shard now immediately pushes fresh tile detail for that tile, so a phantom shard clears itself instead of leaving you re-pressing a button that can't succeed",
      "A failed collect (shard or tile yield) now shows a proper \"Collect failed\" alert explaining why, instead of failing silently or with only a muted feed line"
    ]
  },
  {
    createdAt: 1789149360440, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.02",
    title: "Fixed: an already-staged muster flag could go missing from the tile menu after reloading or reconnecting",
    why: "Logging back in or reconnecting rebuilds your view of the map from a fresh server snapshot, but that snapshot never mentioned muster flags at all -- so a flag you'd already staged (Hold, Advance, or a March) could vanish from the tile menu and the manpower panel's Active muster flags list until the next server update touched it, which never happens for a flag already sitting at its cap.",
    changes: [
      "A muster flag now shows up correctly in the tile menu and manpower panel immediately after logging in or reconnecting, instead of only after the next server update or a manual click on that tile"
    ]
  }
];
