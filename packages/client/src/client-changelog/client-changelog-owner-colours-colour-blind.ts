import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OWNER_COLOURS_COLOUR_BLIND_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Empire colours that stay apart for colour-blind players",
  why: "AI empires could get near-identical reds or greens, including two 'A' empires in bright green and red. Turning on the Diplomacy map view also recoloured every crest, so your own crest turned blue. Some guide and Manifest markers were told apart only by red and green.",
  changes: [
    "AI empires now get colours that stay distinct with red-green colour blindness, and differ in lightness as well as hue. Empires with the same first letter are kept furthest apart. AI colours change once when this update reaches the server.",
    "Ranks shows two letters on a crest when two empires share a first letter (Al, As).",
    "Crests and badges always show each empire's own colour. The Diplomacy view now recolours only the map.",
    "The guide's map marker has a dark outline and four arrows pointing at the tile, in 2D and 3D.",
    "Manifest state markers use a shape as well as a colour: a tick for Commissioned, a hollow ring for Available and hatching for Locked."
  ]
};
