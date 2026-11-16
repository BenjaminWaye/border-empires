import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLACE_ANOTHER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Place reads \"Place another\" after a build",
  why: "On the town screen the Place button flashed \"✓ Placed\" briefly, then went back to \"Place\", so on a phone it was easy to think the building never went through.",
  changes: [
    "After you place a building from the town screen, the button now reads \"Place another\" once the confirmation fades, until you pick a different building or leave the town."
  ]
};
