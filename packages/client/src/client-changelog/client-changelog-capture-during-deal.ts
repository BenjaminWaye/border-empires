import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURE_DURING_DEAL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.15",
  title: "Town Captured waits for your deal",
  why: "The Town Captured card could pop up over a deal you were drafting, and the draft was lost.",
  changes: ["While a deal is open, the Town Captured card waits and appears once you send or close the deal"]
};
