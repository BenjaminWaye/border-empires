// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_65: ClientChangelogEntry[] = [
  {
    createdAt: 1789248022065, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.12.01",
    title: "Fixed buildings rendering much darker than trees in the true-3D map (e.g. Mint Works)",
    why: "Building materials (iron, brass, rivets, etc.) use non-trivial metalness, which in three.js's PBR lighting model scales a surface's diffuse response toward zero -- metallic surfaces are lit almost entirely by reflecting an environment map, not by the scene's hemisphere/sun/fill lights. With no environment map set, metallic buildings had nothing to reflect and rendered near-black, while trees (which use no metalness) were lit normally by the same lights.",
    changes: [
      "The true-3D renderer now bakes a neutral environment reflection and gives it directly to structure materials (Mint Works and other buildings), so they read as properly lit instead of near-black",
      "The reflection is scoped to structures only, not the whole scene -- trees, terrain, and everything else keep their original brightness",
      "Sun/hemisphere/fill lighting and shadows are unchanged"
    ]
  },
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
  }
];
