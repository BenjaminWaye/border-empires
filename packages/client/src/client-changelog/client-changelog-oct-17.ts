import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_OCT_17: ClientChangelogEntry[] = [
  {
    createdAt: 1792324607133,
    introducedIn: "2026.10.18.2",
    title: "Locked resource buildings say what they're waiting for",
    why: "With Umbrite Rigging Module researched but not installed on an active AFC, tapping an Umbrite deposit showed no Umbrite Rig and no reason why, and the Manifest's name never mentioned Umbrite.",
    changes: [
      "The Umbrite Rig no longer disappears when Umbrite Rigging Module is researched but not installed: it shows greyed out and says to install the module on an active AFC",
      "On farm, Titanium and gem tiles, a locked Hydrogarden or Mine now shows greyed out with the Manifest it needs, plus a View Manifest link that opens it",
      "Rigging Works Module is now called Umbrite Rigging Module, and Umbrite Synthesis Module's description points to it for harvesting Umbrite deposits"
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
