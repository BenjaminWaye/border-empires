import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SUPPLY_AGREEMENT_LIMIT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "See your supply agreement limit before a deal fails",
  why: "Accepting a trade could fail with \"too many active resource agreements\", with no warning beforehand and no word on whose limit was full.",
  changes: [
    "The trade screen and Alliances panel show how many supply agreements you have, out of 16, and highlight it when you're nearly or completely full.",
    "At 16/16, Accept and Send are disabled for deals that add resource supply, and say why. End one of your agreements to make room.",
    "A resource trade offer to or from a House that is already full is refused when it is made, naming that House. AI Houses no longer start resource trades with anyone who is full, or while they are full themselves.",
    "If a deal still fails because someone filled up in the meantime, the message now says whose limit was reached."
  ]
};

export const SUPPLY_AGREEMENT_LIMIT_OTHER_HOUSE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Know before you offer when the other House's supply agreements are full",
  why: "An offer to a House with 16/16 supply agreements was only refused after pressing Send, as \"Error RESOURCE_TRADE_FAILED: …\".",
  changes: [
    "The trade screen now says when the other House already has 16/16 supply agreements, and Send is disabled for deals that add resource supply.",
    "Resource trade refusals show as plain messages, without the error code."
  ]
};
