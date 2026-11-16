import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SALVAGE_TRIBUTE_BALANCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Salvage deliveries are a flat 1000 manpower, and AI Houses now ship salvage too",
  why: "Shipping salvage to the Court paid a share of the manpower cap, so larger empires earned more per load, and AI Houses built Works but never shipped a single load.",
  changes: [
    "Each load of precursor salvage shipped to the Court now brings a flat 1000 manpower, never above your cap (was 25% of your manpower cap), so a larger empire gets no more per load.",
    "AI Houses ship a load from their Reclamation Works when they run short of manpower, one load per shortage.",
    "Shipping the last load no longer removes the Reclamation Works: it stays on the map as a depleted, empty yard with no attack or defense bonus, which you can dismantle to free the tile. Its tile panel reads \"Depleted Reclamation Works\" for you and for other players."
  ]
};

export const SALVAGE_TOAST_DECLUTTER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Salvage markers no longer cover the map",
  why: "Every Reclamation Works with loads got its own large \"Salvage ×3\" banner, so a deposit of adjacent Works stacked several banners on top of each other and hid the map, especially when zoomed out.",
  changes: [
    "Works close together on screen now share one marker showing their total loads; tapping it opens the field that can ship now.",
    "When zoomed out the marker shrinks to a small number pip; zoomed in it is a smaller \"Salvage 3\" tag."
  ]
};
