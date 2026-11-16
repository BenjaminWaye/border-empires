import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MUSTER_PANEL_SIZE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Muster flag size in the tile panel, and links that open what they say",
  why: "Tapping a muster flag on a phone gave no way to see how much manpower it held, and the Reports link opened the old Attack commitment screen instead.",
  changes: [
    "Tapping your muster flag shows its staged manpower against its cap (e.g. 40 / 150 manpower) and its current order (Hold, Advance, Hunt or March) at the top of the panel.",
    "A flag's old-style views now get one link each: Attack commitment ▸ opens the manpower commitment slider and Combat reports ▸ opens the flag's recent fights."
  ]
};
