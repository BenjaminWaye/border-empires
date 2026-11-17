import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_COIN_INCOME_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Pay for a truce from future income; deals are binding",
  why: "Offering Coin per hour for a truce asked for a resource slot, and AI Houses refused Coin income even with one. Deals could also be ended the moment they were made, so a promise to pay meant little.",
  changes: [
    "A truce or truce extension can now carry Coin per hour with no resource slot. It is paid for the truce's own hours from acceptance, so 64 Coin per hour on a 12h extension is up to 768 Coin.",
    "AI Houses accept Coin per hour for a truce, counting it at half the value of the same Coin paid upfront, since payments can pause or shrink with your income, and only up to the income you haven't already pledged. They never pledge their own income, and alliances and resource trades with AI Houses still take Coin upfront.",
    "A truce's Coin per hour ends early if the truce does, for example when either side breaks it.",
    "Deals are now binding, as in Civ: neither side can end a resource supply or Coin pledge before its term. Only the term running out or war between you ends one early."
  ]
};
