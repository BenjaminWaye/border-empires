import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_OCT_25: ClientChangelogEntry[] = [
  {
    createdAt: 1792907644912, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "No battle sound for undefended frontier",
    why: "Tapping a frontier tile being taken played the clash of regiments, even though no troops stand on frontier ground to fight.",
    changes: ["Tapping a frontier tile under attack only plays the battle sound while a garrison is holding it. Attacks on settled land still sound as before"]
  },
  {
    createdAt: 1792909372604, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "More useful sync-delay debug logs",
    why: "Debug downloads could confirm delayed attacks but failed to collect the server evidence needed to explain them.",
    changes: ["Debug downloads now collect authenticated diagnostics for your own commands, actual network send timings, browser stalls, recent sync-warning windows and disconnect details."]
  },
  {
    createdAt: 1792909218843, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Weapons Factory bonus needs a factory",
    why: "An empire with no Weapons Factories still got +100% attack against anyone missing one, which cancelled out the edge a real factory owner had over it.",
    changes: [
      "The +100% war-industry bonus now applies only for a Weapons Factory type you own and your opponent lacks",
      "Its win-chance row names just those types, e.g. \"Attacker missing Titanium Weapons Factory\"",
      "Two empires with no Weapons Factories get no bonus either way"
    ]
  },
  {
    createdAt: 1792929923604, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Sieges say when your defenses fell",
    why: "A Palisade taken without one of the siege's own assaults winning, such as by a Breakthrough, still read \"Your Palisade is holding\", with the loss shown as a separate tile row.",
    changes: [
      "A siege on a tile you then lost now shows that it fell and who took it, even when the final blow came another way",
      "Fallen sieges read \"Held off 2 assaults before it fell · Kara spent 300 manpower attacking it\"",
      "Yours names barbarians as Planetary Defense instead of their internal id"
    ]
  },
  {
    createdAt: 1792908043500, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Encirclement works for large empires",
    why: "Once an empire grew past roughly 1,800 connected tiles, the supply check gave up before it finished. Frontier cut off from supply, for example behind an origin lost to a counter-attack, stayed owned when it should have been lost.",
    changes: [
      "The supply check now looks only at your frontier, not your whole empire, so large empires lose cut-off frontier immediately",
      "This applies to captures, lost attack origins and abilities that remove tiles"
    ]
  },
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
