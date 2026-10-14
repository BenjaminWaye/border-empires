type TechAgeMeta = {
  name: string;
  blurb: string;
  stageBlurb: string;
};

const TECH_AGE_BY_TIER: Record<number, TechAgeMeta> = {
  1: {
    name: "Founding Age",
    blurb: "Food, trade, scouting, and warbands establish a viable frontier state.",
    stageBlurb: "Garrison basics, first mintworks, first maps."
  },
  2: {
    name: "Mechanical Age",
    blurb: "Measured stonework, prospecting, docks, and field gear turn survival into systems.",
    stageBlurb: "Machine craft, fortification, extraction."
  },
  3: {
    name: "Industrial Age",
    blurb: "Guild production, ledgers, convoy planning, and siege engines make expansion scalable.",
    stageBlurb: "Scaled production, finance, and campaign logistics."
  },
  4: {
    name: "Aether Age",
    blurb: "Resonance networks, state accounting, and advanced extraction create aetherpunk empire play.",
    stageBlurb: "Aether infrastructure, signal control, and heavy industry."
  },
  5: {
    name: "Sky Age",
    blurb: "Ministries, intelligence, long campaigns, and civic systems harden the imperial core.",
    stageBlurb: "Administrative power, covert reach, and strategic mobility."
  },
  6: {
    name: "Astral Age",
    blurb: "Sky docks, resonance grids, and imperial circulation prepare the world for a future orbital leap.",
    stageBlurb: "Air power, refined fuel, and world-scale coordination."
  },
  7: {
    name: "Monument Age",
    blurb: "Empire-scale monuments, shield domes, and global aether systems decide the season.",
    stageBlurb: "Monuments, power grids, and world-shaping systems."
  }
};

export const techAgeMetaForTier = (tier: number): TechAgeMeta => TECH_AGE_BY_TIER[tier] ?? { name: `Tier ${tier}`, blurb: "Advanced empire technology.", stageBlurb: "Advanced unlocks." };

