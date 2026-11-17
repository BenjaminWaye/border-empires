import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WHOLE_COIN_BALANCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Coin balance shows only coin you can spend",
  why: "The top bar rounded your coin to the nearest whole number, so 11.6 coin read as 12 and a 12-coin trade then failed.",
  changes: [
    "Your coin balance now shows whole coin only, rounded down, and goes up each time you earn a full coin.",
    "Economy and the trade screen's \"You only have N coin\" warning show the same whole number."
  ]
};
