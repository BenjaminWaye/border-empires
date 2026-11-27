import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SETTINGS_MENU_TIDY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Tidier Settings menu",
  why: "Guests weren't told Log Out would lose their empire, inviting friends was hidden under Gameplay, and Log Out and Delete account looked like every other button.",
  changes: [
    "Guests see, at the top of Settings, that logging out loses their empire, with a Save your empire button.",
    "Invite friends (rally link) moved from Gameplay to the main Settings menu.",
    "Log Out sits apart at the bottom of Settings.",
    "Delete account is in its own warning card at the bottom of Account."
  ]
};
