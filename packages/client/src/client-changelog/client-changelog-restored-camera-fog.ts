import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESTORED_CAMERA_FOG_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Coming back opens on your land, not grey fog",
  why: "The map reopens where you last looked. If you lost that land while away, nothing there was visible any more: closing the Chronicle showed only grey fog, as if your whole empire was gone.",
  changes: [
    "If nothing in your last view is visible when you come back, the map opens on your nearest land instead.",
    "A view that still shows anything live, such as a front line or an ally's border, is kept, and so is a shared map link."
  ]
};
