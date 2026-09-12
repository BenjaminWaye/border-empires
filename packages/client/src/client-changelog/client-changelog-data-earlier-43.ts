// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_43: ClientChangelogEntry[] = [
  {
    createdAt: 1788811800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.07",
    title: "Senate proposals now show a live quorum bar instead of just PENDING/PASSED/FAILED",
    why: "The Senate panel gave no sense of stakes while a vote was live -- a proposal just sat there labeled PENDING with a Vote button, no visible tally, no idea how close it was to passing or when it would resolve. Casting a vote felt like clicking into a void.",
    changes: [
      "Each pending proposal now shows an animated progress bar for its cast Dominion weight against the quorum it needs to clear, with a tick mark at the quorum threshold and a distinct-voters count (e.g. \"2/3 voters\")",
      "The bar turns green once both the quorum and distinct-voter floor are cleared",
      "Each proposal shows roughly when it resolves (e.g. \"resolves ~3h\")",
      "Raising a proposal now picks EMBARGO or CONTEST from two clickable cards showing their icon, Influence cost, and effect, instead of a bare dropdown",
      "New GET /hq/galaxy/senate fields (castWeight, totalWeight, quorumPct, distinctVoters, minDistinctVoters, resolvesAt) power this -- purely additive, existing callers are unaffected"
    ]
  },
  {
    createdAt: 1788810535277, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.05",
    title: "Fixed: a rare \"Frontier sync mismatch\" popup rejecting an attack on a tile you'd just fought over",
    why: "A losing attack's combat result can describe an unrelated effect on the target tile (like a post-attack shock marker) without saying anything about ownership at all. The client was treating that silence as \"this tile has no owner,\" wiping the real owner from its local map. If a queued action then reached that tile before the next full resync, it fired an illegal territory claim (EXPAND) at what was actually enemy-held land, got rejected, and surfaced a confusing \"Frontier sync mismatch\" warning telling the player to manually refresh.",
    changes: [
      "Combat-result updates no longer clear a tile's owner unless the server actually says ownership changed -- an update about something else on the tile (e.g. a post-attack shock timer) leaves current ownership alone",
      "This removes one cause of the \"Frontier sync mismatch\" popup and of an auto-queued action misfiring as a territory claim against land that was never actually neutral"
    ]
  },
  {
    createdAt: 1788811285234, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.1",
    title: "Forests now mix in leaf/deciduous trees, not just conifers",
    why: "Every forest tile only ever rendered conifers (pine and spruce, both cone-shaped) in both the true-3D and 2D-fallback map renderers, so forests read as visually uniform regardless of how much biome variety the terrain itself had.",
    changes: [
      "Forest tiles now mix in a third, leaf/deciduous tree species (a rounder, warmer-green canopy) alongside the existing pine and spruce conifers, in both the true-3D renderer and the 2D-canvas accessibility fallback",
      "Light-shaded grass tiles (which never had any trees at all) now get a sparse, purely decorative scattering of leaf saplings, so they don't read as completely bare next to dense dark-grass forest -- this has no gameplay effect (no vision or claim-timing change), unlike real forest tiles",
      "Each world tile's mix of tree species (and whether it gets a decorative sapling) is fixed (deterministic per-tile), so a forest -- or a light-grass tile's sapling -- doesn't flicker as you pan or reconnect"
    ]
  },
];
