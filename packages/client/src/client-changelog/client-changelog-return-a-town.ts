import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RETURN_A_TOWN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Give back a town for peace",
  why: "An AI that could still win back its land refused every truce, so a player who had taken one of its towns had no way to make peace.",
  changes: [
    "The trade screen lists towns you took from that empire in the last day: add one to a truce to hand it back",
    "An AI values getting its own town back, and takes it as reparations even while it would otherwise fight on",
    "An AI's counter-offer can ask for one of its towns back when your coin and income don't cover its price",
    "A returned town goes back settled, with its buildings and people. You can also give one to an AI as a gift"
  ]
};
