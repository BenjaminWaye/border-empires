import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPAND_ATTACK_CONFIRM_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Expand To asks before it attacks",
  why: "The way to an empty tile can pass through barbarian or rival land, and Expand To attacked it, raising muster flags, without asking.",
  changes: ["When the way there means attacking, Expand To names who, says a muster flag may be raised, and asks first"]
};
