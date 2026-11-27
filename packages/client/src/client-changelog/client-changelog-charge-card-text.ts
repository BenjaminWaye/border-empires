import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHARGE_CARD_TEXT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Charge card text no longer cut in half",
  why: "On long charges the House's letter scrolled in its own tiny box, showing half-cut lines, and the last line could be clipped with no sign of more.",
  changes: [
    "The objective, progress and status come first and the House's letter last, in one scroll",
    "Long card text fades at the bottom while there is more to scroll"
  ]
};
