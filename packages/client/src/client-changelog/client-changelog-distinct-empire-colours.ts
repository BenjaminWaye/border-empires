import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DISTINCT_EMPIRE_COLOURS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "No more look-alike empire colours",
  why: "A rival's pale pink land could pass for your own similar pink.",
  changes: [
    "New colour picks must look clearly different from every active empire's colour",
    "Colours too close to a rival's are greyed out in the colour picker",
    "AI empires and new guests only get colours clearly different from the rest",
    "Colours already in use are kept"
  ]
};
