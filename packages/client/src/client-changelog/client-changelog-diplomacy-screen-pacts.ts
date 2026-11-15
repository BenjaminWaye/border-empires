import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DIPLOMACY_SCREEN_PACTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Diplomacy: break pacts and reach Alliances from any screen size",
  why: "On a phone, Break Truce and the Alliances panel could only be reached by tapping a partner's land, an ally's deal still offered a truce and priced an alliance you already had, and the empire list overlapped and jumped back to the top after every deal.",
  changes: [
    "A truce partner's or ally's deal now shows the pact with Break Truce or Break Alliance (after the usual confirmation) and a link to Alliances",
    "The Diplomacy list has an Alliances & supply link at the top",
    "An ally's deal offers goods only: no truce or alliance buttons",
    "The Diplomacy list scrolls as one column, so the met and unmet empires no longer squeeze into overlapping strips, and it keeps its place when you come back from a deal",
    "With no empires met, the note now spans the list instead of one narrow column"
  ]
};
