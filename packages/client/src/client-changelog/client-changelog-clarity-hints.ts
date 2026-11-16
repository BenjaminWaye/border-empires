import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLARITY_HINTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.15",
  title: "Clearer reach, Manifest unlocks, resources and town coin",
  why: "Playtesters couldn't find where to build a Hydrogarden, saw nothing after Reveal Titanium, couldn't tell what \"Beyond your reach\" meant, and had a fed town earning nothing with no reason given.",
  changes: [
    "A Manifest's detail says where each building it unlocks is built, such as a Hydrogarden on a garrisoned grain tile",
    "Reveal chips in the Manifest say they mark deposits on tiles in sight, and open the Resources lens",
    "The Resources lens shows a key of resource colours",
    "With no tiles of Titanium, Crystal or Umbrite, Economy says to garrison a deposit, with Find on map",
    "Tapping \"Beyond your reach\" on a tile opens Details, which explains reach and how far towns and Relay Beacons extend it",
    "A Relay Beacon now lists its reach (5 tiles) as well as its vision",
    "A fed town with ungarrisoned support plots shows how many are garrisoned on its coin line and in the Towns list"
  ]
};
