import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHRONICLE_DIPLOMACY_ROWS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Chronicle keeps your truce extensions and alliance offers",
  why: "Extending a truce, offering an alliance or having one turned down left no record in the Chronicle, so the diplomacy you had done disappeared once the screen closed.",
  changes: [
    "Chronicle → Yours now lists truce extensions (\"Truce with Astrid extended by 24h\").",
    "Alliance offers you send or receive, and offers declined either way, are listed too.",
    "The Chronicle keeps up to 40 diplomacy entries a day, so a busy day no longer pushes out the morning's truces."
  ]
};
