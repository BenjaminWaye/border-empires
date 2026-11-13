import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DOCK_ART_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Docks rebuilt to match the other structures",
  why: "Docks were still a timber steam-age harbour with a paddle-steamer, out of place beside the marble, iron and brass of every other structure.",
  changes: [
    "3D map: the quay now stands on black-and-gold marble with a brass inlay, like the other structures' platforms, with a glazed control office, a powered gantry crane, a cell bank, sealed cargo containers and an armoured troop carrier moored at the pier.",
    "The landing slipways on the beaches beside a dock are restyled to match: iron ramps with brass rails and armoured landing barges.",
    "2D map: the dock picture is now drawn from the same model, so both maps show the same harbour."
  ]
};
