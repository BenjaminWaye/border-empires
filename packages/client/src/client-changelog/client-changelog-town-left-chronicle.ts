import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_LEFT_CHRONICLE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Chronicle records towns that leave your empire",
  why: "A town that left your empire without being captured (abandoned, or cut off) vanished with no Chronicle entry, and the 24h summary still said no towns were lost.",
  changes: [
    "Chronicle → Yours now lists any town you lose, captured or not, and counts it in towns lost.",
    "A town nobody took says so: it stands unclaimed and you can claim it again."
  ]
};
