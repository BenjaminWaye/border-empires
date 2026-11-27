import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HOUSE_CREST_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Fixed: House crest rough edges",
  why: "A crest change could take a while to reach 3D flags, a flag could show a blank patch, and a refused name dropped the crest.",
  changes: [
    "3D muster flags redraw as soon as a House changes its crest or flag",
    "A 3D flag keeps its cog until its crest has loaded, never a blank patch",
    "A refused name or colour no longer drops your crest: it is still saved",
    "The once-per-contest confirmation no longer lists the crest, which can change any time"
  ]
};
