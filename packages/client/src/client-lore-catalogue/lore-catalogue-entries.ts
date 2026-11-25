// The lore catalogue: short player-facing entries on the setting, shown in the
// Chronicle's Lore tab (client-hud-v2-chronicle-lore.ts). Each one condenses a
// section of the world bible (docs/lore/galactic-lore.md, the authority);
// change the bible first and keep these in step. No rules or numbers here:
// those belong to the game's own panels.

export type LoreGroup = "The old world" | "The Imperium" | "Your House" | "On this world";

export type LoreEntry = {
  readonly id: string;
  readonly group: LoreGroup;
  readonly title: string;
  readonly body: readonly string[];
};

export const LORE_GROUPS: readonly LoreGroup[] = ["The old world", "The Imperium", "Your House", "On this world"];

export const LORE_ENTRIES: readonly LoreEntry[] = [
  {
    id: "concordance",
    group: "The old world",
    title: "The Concordance",
    body: [
      "The Concordance once ruled known space from a single home planet. Its power was the World Engine, which focused aether sharply enough to tear a hole in the universe and let ships cross vast distances in seconds.",
      "A war over who would control the Engine destroyed it, and the home planet with it. Instant travel was lost, and the colonies were left reachable only by slow crossings."
    ]
  },
  {
    id: "bleed",
    group: "The old world",
    title: "The Bleed",
    body: ["The aether that ran through the World Engine did not vanish. It poured into open space, ownerless: mindless, and lethal to unshielded matter and life."]
  },
  {
    id: "wardens",
    group: "The old world",
    title: "The Wardens",
    body: [
      "Automated constructs the Concordance built to hunt the Bleed. They burned most of it away, but could not tell it from the aether in the Concordance's own works, and turned on everything aether-built.",
      "The Court was forged in the war against them, and won it. Survivors still roam beyond the Core."
    ]
  },
  {
    id: "crystal",
    group: "The old world",
    title: "Crystal",
    body: ["Aether gone dormant in stable rock, the way carbon becomes diamond. It is safe to mine because it is quiet. Refined, it powers Aether Towers and a House's other aether-work."]
  },
  {
    id: "imperium",
    group: "The Imperium",
    title: "The Imperium and the Court",
    body: [
      "The Concordance remnants on the colony worlds closest together rebuilt as the Imperium. It is ruled by the Court, a dictatorship forged in the war against the Wardens that never gave up its war powers. Its secured heartland is the Core.",
      "The Court rules through noble Houses. A House that holds a world for the Court is led by a Duke."
    ]
  },
  {
    id: "frontier",
    group: "The Imperium",
    title: "The frontier",
    body: [
      "Every colony beyond the Core was cut off when the Engine fell. For generations these worlds have kept their own rulers and plain machinery, with no Court.",
      "Their towns avoided aether-work, because aether-work drew the Wardens. Concordance machinery recovered here is worth more to the Court than almost anything a House can build."
    ]
  },
  {
    id: "sector-contest",
    group: "The Imperium",
    title: "The Sector Contest",
    body: [
      "The Court retakes the frontier one world at a time. It opens a Sector and lands rival Houses on it together to fight for it, and the Core watches the campaign as the Sector Contest. While the nobility fights, nobody looks at the dictatorship at home.",
      "The winning House holds the world for good, and its leader becomes a Duke."
    ]
  },
  {
    id: "dukes",
    group: "The Imperium",
    title: "Dukes",
    body: ["A Duke's world is a star system to develop, defend and keep stable. Influence is a Duke's standing in the Imperium. Dukes sit in a Senate the Court permits, raid one another, and may yet wager together against the Court."]
  },
  {
    id: "afc",
    group: "Your House",
    title: "AFCs and Manifests",
    body: [
      "A House lands with an Automated Fabrication Complex: its imported industrial seed. Structures are fabricated there and flown out in sealed pods by courier drones.",
      "A Manifest names what the House commissions from offworld: machinery docked to an AFC, crews and cargo, charters, or a Great Project's supply chain."
    ]
  },
  {
    id: "coin",
    group: "Your House",
    title: "Coin",
    body: ["Offworld purchasing credit backed by the food, freight, ore, manufacturing and tolls a House controls. It pays offworld for machines, crews and market access. It is not local wages."]
  },
  {
    id: "relay-beacons",
    group: "Your House",
    title: "Relay Beacons",
    body: [
      "The cheapest form of the Court's anchor technology: an unarmed tower that declares ground anchored to a House.",
      "A beacon receives the command stream of the House AI in orbit and projects a local control field. The field's coverage is reach: ground inside it is the House's to settle and build on."
    ]
  },
  {
    id: "house-charges",
    group: "Your House",
    title: "House Charges",
    body: ["Before landing, a House seals a few goals of its own for this world, separate from the Court's terms: a road between market towns, a landmass charted under its name, a Concordance installation woken. They count only if still held when the campaign is decided, and are opened in public at the end."]
  },
  {
    id: "planetary-defense",
    group: "On this world",
    title: "Planetary Defense",
    body: ["What is left of the planet's own defense force after the Court strips its government. It holds out in fortified camps and cannot raise new garrisons, so every camp taken is gone for good. The Court pays a bounty for each one."]
  },
  {
    id: "relics",
    group: "On this world",
    title: "Concordance relics",
    body: [
      "Surviving Concordance installations, each under the same ziggurat access structure; what lies beneath differs. They are aether-powered, which is why frontier towns left them dormant.",
      "A House that captures and garrisons one puts it back into service and gains what it does. Some hold reserves that never refill."
    ]
  },
  {
    id: "aether-wake",
    group: "On this world",
    title: "Aether wakes",
    body: ["A running relic draws on the aether and leaves a wake every rival House can read across the whole world: where it works and whose control codes drive it, never what it is or what it still holds. Waking a relic announces it to every rival."]
  }
];

export const loreEntryById = (id: string): LoreEntry | undefined => LORE_ENTRIES.find((entry) => entry.id === id);

let requestedEntry: string | undefined;

/** Asks the HUD to open the Chronicle on this Lore entry (a "?" elsewhere in the game). */
export const requestLoreEntry = (id: string): void => { requestedEntry = id; };

/** The entry asked for since the last call, once. */
export const takeRequestedLoreEntry = (): string | undefined => {
  const id = requestedEntry;
  requestedEntry = undefined;
  return id;
};
