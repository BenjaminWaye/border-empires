import type { NaturalWonderType } from "./natural-wonder-types.js";

// Single source of truth for natural wonder display copy, shared by the sim
// (event-log claim text) and the client (tile overview). Matches
// docs/natural-wonders-design.md §2's descriptions.
export const NATURAL_WONDER_LABELS: Record<NaturalWonderType, { name: string; flavor: string; boon: string }> = {
  FOUNDRY_HEART: {
    name: "the Foundry Heart",
    flavor: "a pulsing crystal geode cracks the earth open, aether light bleeding through fresh fissures",
    boon: "+1 slot for FOOD, TITANIUM, CRYSTAL, and UMBRITE"
  },
  DEEPWATER_ENGINE: {
    name: "the Deepwater Engine",
    flavor: "gear-driven pumps and copper piping hum to life, drawing the tide itself into your economy",
    boon: "dock gold income doubled; dock-launched attacks +15% ATK"
  },
  CONSCRIPTION_ENGINE: {
    name: "the Conscription Engine",
    flavor: "smoke rises from the barracks compound's towers as fresh recruits fall into formation",
    boon: "+2,000 manpower cap, plus an instant +2,000 manpower on first claim"
  },
  WARPRESS: {
    name: "the Warpress",
    flavor: "a colossal stamping hammer strikes the anvil, sparks scattering across the forge floor",
    boon: "mustering flags fill 2x faster, with one extra flag (6 max instead of 5)"
  },
  BASTION_FRAME: {
    name: "the Bastion Frame",
    flavor: "aether energy threads through a copper pipe lattice buried in the landscape",
    boon: "+0.5x additive defense multiplier on every fort you control"
  },
  CALCULATING_ENGINE: {
    name: "the Calculating Engine",
    flavor: "brass rings turn in silence, scrolling data across glass panels lit from within",
    boon: "tech research gold costs -10%"
  },
  QUICKFORGE: {
    name: "the Quickforge",
    flavor: "pneumatic pistons hiss and slam in rapid rhythm, forge-glow washing over red-hot steel",
    boon: "once per day (UTC midnight), rush-buy one in-progress build for 40 gold cheaper"
  },
  WATCHTOWER_ENGINE: {
    name: "the Watchtower Engine",
    flavor: "a brass telescope sweeps a cyan aether beam slowly across the night sky",
    boon: "acts as a free Aether Tower with +10 cast radius, no CRYSTAL upkeep"
  },
  CARTOGRAPHERS_LENS: {
    name: "the Cartographer's Lens",
    flavor: "concentric rings spin around a prismatic lens, casting rainbow light in every direction",
    boon: "+1 vision range on every tile you own"
  }
};
