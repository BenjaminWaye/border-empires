import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLANETARY_DEFENSE_CAMPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Planetary Defense camps",
  why: "Planetary Defense patrols wandered the map, giving up the tile they left with every step, so they seemed to jump from tile to tile, and there was nothing to destroy, only patrols that kept moving. They could also keep eating your land while you were offline.",
  changes: [
    "Planetary Defense now holds camps that never move. A camp spreads frontier around itself and takes your land from there",
    "Taking a town or a dock gives Planetary Defense a new camp. Camps destroyed by players never come back, so Planetary Defense shrinks as Houses clear it",
    "Capture a camp and all of its land falls with it, back to neutral",
    "A camp only acts while a player who is online, or an AI empire, can see one of its tiles",
    "Each camp can attack a House's garrisoned tiles at most 10 times per manpower window, so a camp next to you while you're offline can only do limited damage",
    "Pacification Routines now pays its 25 Coin bounty per camp captured instead of per tile",
    "Hunt Planetary Defense now acts like a plain Advance order; with camps there is nothing left to chase"
  ]
};

export const PLANETARY_DEFENSE_CAMP_GROWTH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Planetary Defense camps grow slower and stand out",
  why: "Planetary Defense spread across the map too quickly: AI empires keep most camps awake, and each camp took a neutral tile every 15 seconds with no limit on its size. Soldiers also stood on every one of its tiles, so you couldn't tell a camp from the land around it.",
  changes: [
    "A camp now rests a minute after taking neutral land instead of 15 seconds. Attacks on Houses keep their 15 second rest and raid limit",
    "A camp stops spreading at 20 tiles: it no longer takes neutral land or your frontier. It can still raid your garrisoned tiles, within the raid limit, and take a town or a dock that becomes a new camp",
    "Soldiers now stand only on the camp itself, on both the 3D and 2D maps. The plain grey land around them is the camp's frontier: capture the camp and all of it falls"
  ]
};
