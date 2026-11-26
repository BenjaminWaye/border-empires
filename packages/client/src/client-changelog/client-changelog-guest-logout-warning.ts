import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUEST_LOGOUT_WARNING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Warning before a guest logs out",
  why: "A guest can't log back in, so pressing Log Out lost the empire with no warning.",
  changes: ["Guests now get a warning before logging out, with the option to stay and save their empire first."]
};
