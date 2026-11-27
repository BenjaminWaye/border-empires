import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACCOUNT_TEXT_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Fixed: empire rename and odd text",
  why: "Renaming your empire could close with no answer and mangle the name, and a few screens showed code-like text or dead links.",
  changes: [
    "Edit Name & Colour waits for the server and shows why a change was refused",
    "The name box starts empty, so typing no longer adds to your old name",
    "Names with an apostrophe show correctly in the reach badge",
    "Diagnostics hides most of your email and account ID; Copy Debug Info still has them",
    "View relic installation in tile details opens the relic",
    "Chronicle World's rank arrow matches your current rank"
  ]
};
