import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Terrain and world-generation entries. Earlier ones aged out of the "keeps
// only the latest week" window and were moved to
// client-changelog-data-earlier-93.ts (historical record, left unreferenced)
// -- see the maintenance note atop client-changelog-data.ts.
export const CLIENT_CHANGELOG_ENTRIES_TERRAIN: ClientChangelogEntry[] = [
  {
    createdAt: 1791819900184, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.12.1",
    title: "River mountains on the 2D map, and matching snow",
    why: "The 2D map still drew rivers pouring down the mountain while 3D starts them at its foot, and the two maps disagreed on which peaks have snow.",
    changes: [
      "On the 2D map, a river now wells up at the foot of its mountain between two boulders and runs in a banked stream to the pool, like the 3D map",
      "Both maps now cap the same mountains with snow: every mountain in cold country, and most of the tallest peaks elsewhere"
    ]
  },
  {
    createdAt: 1791401674856, // frozen Date.now() value for this release
    introducedIn: "2026.10.07.2",
    title: "Rivers look like water again",
    why: "River water was a pale see-through film drawn on top of everything, so it looked like it floated over the land, glowed through fog, and hung off the edge of explored land.",
    changes: [
      "River water is now a solid deep blue-teal with a dark wet bank along the waterline, so it sits down in the land",
      "Territory colour stops at a dark wet riverbank instead of covering or bleaching the water, in both 3D and 2D",
      "Fog now darkens rivers like the land around them",
      "At the edge of explored land you see your half of a river; no more pieces hanging into unexplored space or dry riverbeds",
      "Rivers cut down through the coast and spill out into the sea instead of stopping at a square end on the shore",
      "River mouths widen and blend into the sea instead of looking cut off at the coastline (3D and 2D)",
      "Coastlines are calmer and softer: waves settle near the shore instead of flickering the square sea edges, and a light foam line runs along every coast (3D and 2D)",
      "Rivers are a little narrower so trees and towns no longer stand in the water, and trees keep off the bank"
    ]
  },
  {
    createdAt: 1791579131298, // Date.now() frozen for this entry
    introducedIn: "2026.10.09.1",
    title: "Separate continents, natural coasts and mountain ranges on new worlds",
    why: "Continent maps often fused into one supercontinent holding most of the land, mountain ranges ran in ruler-straight lines or filled wide gray wedges, and atolls were stretched into ovals or dropped onto continents.",
    changes: [
      "Continent maps now have several separate continents divided by sea, instead of one landmass holding most of the land",
      "Coastlines are more natural: capes, coves and offshore islands, with craggier coasts toward the poles, instead of long smooth or ruler-straight shores",
      "Coastal mountain ranges now sit just inland of the coast, like the Andes",
      "Straits between continents now wind and change width, with narrows and wider seas, instead of running dead straight like canals",
      "On new worlds, mountain ranges are now a thin wandering line (about 2 tiles wide at most) instead of straight lines or thick gray bands",
      "The land around a range is now hills, so terrain steps down from mountains to hills to open land",
      "Atolls are now small, irregular rings of reef islets out in open ocean, sometimes with a smaller atoll nearby, instead of continent-sized perfect circles",
      "Island chains now run along coasts as strings of small, elongated islands, instead of clusters of large round islands in the middle of the ocean",
      "Seasons already in progress keep their current map"
    ]
  }
];
