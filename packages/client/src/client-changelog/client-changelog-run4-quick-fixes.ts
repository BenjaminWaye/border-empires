import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RUN4_QUICK_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Fairer AFC replacement, a guide that doesn't loop, clearer numbers",
  why: "Fixes from the November playtest: a lost AFC could cost more than a new player could ever earn, and several screens quoted numbers that didn't match.",
  changes: [
    "Replacing a lost AFC costs a flat 20 Coin; it no longer rises with every AFC lost on the planet",
    "Once you've built a Relay Beacon and still know of no town, the guide says no town is near your start and offers Skip instead of asking for more beacons",
    "The Chronicle's summary is headed \"Since you last looked\"",
    "A town's Garrison quotes a manpower range: the tiles around it are only garrisoned once its reach claims them",
    "Trade offers show Coin per day instead of Coin per hour",
    "The Ranks panel names the victory leader even when an update left the name blank",
    "The Manifest coin line shows what you still need and your daily income, without a \"ready in\" time that sat still between deliveries",
    "Grassland towns are Standard Towns, shown with no terrain bonus instead of +0% on every stat",
    "Break Alliance in the Alliances panel confirms in the game instead of a browser pop-up that could be blocked",
    "\"Muster flags full\" counts a flag that's still being placed"
  ]
};
