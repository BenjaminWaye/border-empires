import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MUSTER_PANEL_SIZE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Muster flag size in the tile panel, and no more old tile menu",
  why: "Tapping a muster flag on a phone gave no way to see how much manpower it held, and the Reports link opened the old tile menu on its Attack screen instead.",
  changes: [
    "Tapping your muster flag shows its staged manpower against its cap (e.g. 40 / 150 manpower) and its current order (Hold, Advance, Hunt or March) at the top of the panel.",
    "A flag's Attack commitment ▸ and Combat reports ▸ each open their own sheet beside the tile panel (full screen on a phone), like Build ▸ and Aether ▸.",
    "An AFC's Modules ▸ opens the same way. The old tile menu no longer appears in the new HUD."
  ]
};
