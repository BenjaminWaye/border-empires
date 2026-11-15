import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLAIN_LOSS_REPORTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Chronicle says plainly what you lost",
  why: "Reports of attacks on you read like a war ledger (\"1m siege\", \"cost them 220 manpower\", \"−12 tiles lost (Konrad)\") and the 24h summary showed a net \"+1 towns\" that read as how many towns you hold.",
  changes: [
    "Losses name who took what: \"Lost 12 tiles to Konrad\", \"Astrid took your Palisade after 1h of attacks\", \"Your tile held: repelled 5 attacks from Kara\".",
    "Rows about attacks on you no longer list the attacker's manpower spending.",
    "The 24h summary counts towns taken and towns lost separately, and each rival's tally is written out in words."
  ]
};
