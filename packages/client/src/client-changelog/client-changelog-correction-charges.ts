import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CORRECTION_CHARGES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "New House Charges",
  why: "Growing one town to a City was too small to be a House's ambition.",
  changes: [
    "Writ of Correction: capture any AFC founded by a named rival House and hold it to the end.",
    "Founding of the Three Seats: grow three towns on a named landmass to Metropolises and hold them.",
    "Founding of a Seat is no longer dealt. Seats you already hold keep counting this season.",
    "AFC tiles show which House founded them."
  ]
};
