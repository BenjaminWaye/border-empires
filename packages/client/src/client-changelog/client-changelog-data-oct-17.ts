import type { ClientChangelogEntry } from "./client-changelog-data.js";

// October 17 releases extracted to keep the main changelog within its line limit.
export const CLIENT_CHANGELOG_ENTRIES_OCT_17: ClientChangelogEntry[] = [
  {
    createdAt: 1792203815485,
    introducedIn: "2026.10.17.1",
    title: "Enemy breakthroughs get a spiked front line",
    why: "Enemy tiles taken inside your reach only had a plain outline, which didn't read as a break-in.",
    changes: [
      "On the 3D map, enemy land inside your reach is now outlined by a thin front line in the attacker's colour, with tall spikes pointing into your land",
      "Spikes only appear where the enemy touches your own land, and the line stops at the old border when they push across it",
      "The 2D map keeps the plain outline for now"
    ]
  },
  {
    createdAt: 1792270895359,
    introducedIn: "2026.10.17.2",
    title: "Good pick Manifests stand out, and mean more",
    why: "The small orange Good pick pill was easy to miss and used the same colour as missing-resource warnings. It also appeared on almost every Manifest, because nearly any unlocked building can be built right away.",
    changes: [
      "Good pick Manifests now get a gold band across the top of the card and a gold frame, in the Manifest list, the expanded tree and the Manifest details",
      "Being able to build a Manifest's building right away no longer makes it a Good pick on its own",
      "Good pick now means signs of the resource it reveals near your land (or from a town you garrisoned), or extra Food when your Food capacity is tight"
    ]
  },
  {
    createdAt: 1792257568272,
    introducedIn: "2026.10.17.1",
    title: "Prospect clues look like what they are",
    why: "Blackwood canopy, ferrous dust and refractive ground were just coloured patches on the map, so nothing about them looked like a canopy, dust or crystal.",
    changes: [
      "Blackwood canopy: trees on the tile turn violet-black, and open ground grows gaunt blackwood trees",
      "Ferrous dust: rust-red flecks are scattered over the ground",
      "Refractive ground: a pale glassy glint or two half-buried in the soil",
      "The coloured patch under clue tiles is gone, and the tile menu only explains a clue on tiles that show it; works on both the 3D and 2D maps"
    ]
  },
  {
    createdAt: 1792265619894,
    introducedIn: "2026.10.17.1",
    title: "Better Relay Beacon tips after landing",
    why: "Right after your AFC landed, the AFC tile was selected for no reason, and the guide suggested building your first Relay Beacon on the AFC. A beacon there shows almost nothing your AFC can't already see.",
    changes: [
      "Your AFC no longer lands with its tile selected",
      "The suggested Relay Beacon spot now goes by how much new land it shows you and brings into reach, so it usually sits at the edge of your land instead of on the AFC",
      "The suggested spot can be any land inside your reach: on your frontier, Build Relay Beacon garrisons the tile first, and on unclaimed land it expands, garrisons, then builds"
    ]
  }
];
