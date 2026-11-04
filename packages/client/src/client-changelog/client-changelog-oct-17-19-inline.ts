import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Inline entries from the 2026.10.17 - 2026.10.19 releases, moved out of
// client-changelog-data.ts to keep that file under the 500-line cap. Order
// doesn't matter: entries are sorted by createdAt at render time.
export const CLIENT_CHANGELOG_ENTRIES_OCT_17_19_INLINE: ClientChangelogEntry[] = [
  {
    createdAt: 1792269690926, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.17.2",
    title: "Manufactories turn town industry into Coin credit",
    why: "The stackable economic building represents manufactured output backing offworld purchasing credit.",
    changes: ["Mintworks are now Manufactories, preserving their costs, income, stacking and Clearing House bonuses", "The Industrial Tooling Module fabricates and refurbishes equipment for local Manufactories; new construction requires the module installed on an active AFC", "New factory artwork appears in both the 3D and 2D maps; existing buildings and queued builds carry over"]
  },
  {
    createdAt: 1792274781110, // Date.now() captured once for this release.
    introducedIn: "2026.10.18.1",
    title: "Automatic reconnection keeps trying through server updates",
    why: "Long outages exhausted the retry budget and forced page reloads; a reopened connection could also get stuck before restoring your empire.",
    changes: [
      "Long interruptions keep retrying in place without automatically refreshing the page",
      "A reconnect that makes no progress for a minute automatically starts a fresh connection",
      "Login queue updates and ongoing map downloads extend that timeout so active recovery can finish",
      "Recovery pauses after sign-out; signing back in reopens a closed connection"
    ]
  },
  {
    createdAt: 1792307935274, // Date.now() frozen for this release.
    introducedIn: "2026.10.18.1",
    title: "AFC upgrades are easier to find and compare",
    why: "Upgrade choices were easy to miss, and opening a separate detail screen made comparing them awkward on phones.",
    changes: [
      "AFC Upgrades replaces Sharding in navigation, with installed upgrades and their tiers above the current choices, inline details on phones and comparison cards beside details on desktop",
      "A clickable upgrade-ready badge appears above your active AFCs in both map renderers; the navigation count stays visible when the AFC is offscreen",
      "Owned AFC overviews link directly to upgrades, and availability follows your current resources and prerequisites; existing upgrade costs and rewards stay the same"
    ]
  },
  {
    createdAt: 1792399197096, // Date.now() frozen for the changelog gate.
    introducedIn: "2026.10.19.1",
    title: "Choose exactly which tiles to garrison",
    why: "Garrison Connected queued a whole region immediately, making it hard to control where manpower went.",
    changes: [
      "Garrison Many lets you tap frontier tiles to select or deselect them, with highlights in both map renderers",
      "The bottom bar shows the selected count and total cost, with Confirm and Cancel; keep tapping tiles to adjust the selection",
      "Confirmation checks ownership, reach and resources; unavailable selected tiles turn orange so you can deselect them before spending",
      "Dragging and pinching still move the map; taps select tiles once",
    "Alert markers still center on their targets, and deselected tiles lose their outline in both map renderers"
    ]
  },
  {
    createdAt: 1792418764643, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.19.2",
    title: "Diplomacy offers say what's offered, and you can counter them",
    why: "Pending offers in the Alliances tab only showed a name, an internal player ID and a duration, so it wasn't clear whether a card was an alliance or a truce, and the only answers were yes or no.",
    changes: [
      "Pending offers now read \"Offers an alliance\" or \"Offers a 12h truce\" under the player's name (\"You offered…\" for your own)",
      "New Counter button on offers you receive: it opens the trade screen with their offer filled in, so you can change the duration or ask for coin (\"only if you pay 24 coin\") and send it back",
      "Sending a counter replaces their offer with yours, without the 30-minute wait a plain Reject puts on them offering again",
      "Internal player IDs are no longer shown on alliance, truce and ally cards"
    ]
  },
  {
    createdAt: 1792430700163, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.19.3",
    title: "No more ground poking through the fog beside mountains",
    why: "In the 3D map, an unexplored mountain at the edge of the fog could push a straight-edged wedge of bare ground up through the storm, cutting a notch in its glowing edge.",
    changes: ["Ground at the fog's edge now stays under the storm, so the fog and its glowing edge stay unbroken next to mountains"]
  },
  {
    createdAt: 1792444750777, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.19.5",
    title: "Tidier combat reports on muster flags",
    why: "The flag's combat report list still used the old blue colours inside the brass tile popup, and its long tab label squeezed onto two lines.",
    changes: ["The Recent combat tab is now just \"Combat\", with its unread count as a small bubble on the tab's corner, so all the tile popup tabs fit on one row", "Combat reports use the same brass-and-parchment look as the rest of the popup"]
  }
];
