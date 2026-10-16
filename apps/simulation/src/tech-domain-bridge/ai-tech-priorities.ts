// Current Manifest unlocks. Resource access makes a branch useful; a raw
// stockpile balance does not. IDs are checked against the catalog in tests.
export const AI_TECH_PRIORITIES: Readonly<Record<string, number>> = {
  agriculture: 65, trade: 65, pottery: 70, "organized-supply": 75,
  irrigation: 70, workshops: 60, "ledger-keeping": 55, coinage: 60,
  "civil-service": 55, "census-records": 50, "muster-discipline": 35,
  "standing-army": 40, "crystal-lattices": 45, mining: 45,
  cryptography: 35, logistics: 45, harborcraft: 35, navigation: 40,
  "terrain-engineering": 30, "beacon-towers": 30
};

export function currentAiTechPriority(id: string, access: {
  hasTown: boolean; hasDock: boolean; hasFoodSite: boolean;
  hasCrystalSite: boolean; hasTitaniumSite: boolean;
}): number {
  let score = AI_TECH_PRIORITIES[id] ?? 0;
  if ((id === "agriculture" || id === "irrigation") && access.hasFoodSite) score += 45;
  if ((id === "trade" || id === "coinage" || id === "pottery") && access.hasTown) score += 30;
  if ((id === "harborcraft" || id === "navigation") && access.hasDock) score += 35;
  if ((id === "crystal-lattices" || id === "logistics") && access.hasCrystalSite) score += 30;
  if (id === "mining" && (access.hasCrystalSite || access.hasTitaniumSite)) score += 30;
  return score;
}
