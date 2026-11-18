import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TAP_SELECT_CONFIRM_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Tap a tile to select it, tap again to confirm",
  why: "One click next to your border claimed the tile and spent manpower at once, so players ended up with tiles they never chose. A Relay Beacon on unclaimed or unsettled land was also spent straight from the menu, with no look at the reach it would add.",
  changes: [
    "Tapping or clicking land you can claim or attack now only selects it. A big Confirm button with the action and its cost appears right above the tile. Tap it, or tap the same tile again, to spend. Tap anywhere else to cancel.",
    "Build Relay Beacon on any tile now shows the reach it would add, in 2D and 3D, with the cost and a big Build button at the tile. Nothing is spent until you confirm. Tap the same tile again to confirm, or tap another tile to move the beacon."
  ]
};
