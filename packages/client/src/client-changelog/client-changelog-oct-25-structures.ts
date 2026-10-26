import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OCTOBER_25_STRUCTURE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792930581798, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Distinct advanced support structures",
    why: "Similar building shapes made support structures hard to identify at a glance.",
    changes: ["Support structures now have distinct silhouettes and specialized machinery, with refined metal, ceramic and aether details suited to the Empire’s advanced technology.", "High-yield plants have larger signature assemblies, and map and menu artwork match the new models."]
  },
  {
    createdAt: 1792931842668, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Correct population-building descriptions",
    why: "Incubation Engine information still described a retired food effect, while Census Hall listed an outdated growth bonus.",
    changes: ["Incubation Engine now correctly states +10,000 population on completion and +10% ongoing growth. Census Hall describes its population-capacity and town-upgrade benefits. These descriptions use the same shared constants as the game rules."]
  },
  {
    createdAt: 1792944374596, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Verified structure identities",
    why: "Some structure descriptions still quoted retired rules and previews showed superseded artwork.",
    changes: ["Structure information now shares canonical names and verified roles with the 3D review. Thunder Bastion and Ancillary Depot descriptions reflect current rules; retired structures are labelled clearly.", "The completed Sovereign Siege Engine now includes its long barrel, power core and targeting assembly, with matching 2D artwork."]
  },
  {
    createdAt: 1792952553863, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Preserved tower and military artwork",
    why: "The district remodel is limited to the approved buildings.",
    changes: ["Relay Beacon and Aether Tower keep their original 3D models and 2D artwork. Fort, Umbrite Rig, Dread Tower and Siege Battery also retain their existing models."]
  },
  {
    createdAt: 1792952901276, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Clearer support connections and converter information",
    why: "Hidden connections could leave stray posts, and converter help omitted Sell Off rates and its mode-change lock.",
    changes: ["Hidden and unselected buried service connections now hide their posts as well as their pipes.", "Converter building information shows the current Sell Off Coin/day return and mode-change cooldown from the game rules."]
  },
  {
    createdAt: 1792960254810, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Monumental Great Project models",
    why: "Completed Great Projects needed distinct, detailed models that visibly incorporate their commissioned components.",
    changes: ["All six completed Great Projects have new 3D models, matching foundations and specialized machinery: a financial rotunda, massive elevated Worldbreaker cannon with an armoured core housing, lattice shield, orbital cradle, census index and muster gate.", "Their 2D map artwork and menu icons are generated from the same models. The Census Directorate has an integrated crescent archive and an unlit crown, and the Titanium Levy has a military assembly hall and deployment court. Project abilities and costs are unchanged."]
  }
];
