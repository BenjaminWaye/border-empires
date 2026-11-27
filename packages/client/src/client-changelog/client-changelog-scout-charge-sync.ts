import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCOUT_CHARGE_SYNC_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Fixed: Explore showing scout drone charges you didn't have",
  why: "After a reconnect, Explore could show all 8 charges while the server had none left, so a send failed with \"No scout drone charges left\".",
  changes: [
    "Your charge count stays right after reconnecting",
    "A refused send corrects the count straight away",
    "With no charges, Send scout drone is greyed out and shows when the next charge is back"
  ]
};
