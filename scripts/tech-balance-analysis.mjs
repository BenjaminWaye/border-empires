import fs from "node:fs";
import path from "node:path";

const techTreePath = path.resolve(process.cwd(), "packages/server/data/tech-tree.json");
const techTree = JSON.parse(fs.readFileSync(techTreePath, "utf8"));

const baseConnectedTownBonus = (connectedTownCount, extraPerStep = 0) => {
  const baseSteps = [0.5, 0.4, 0.3];
  const stepCount = Math.max(0, Math.min(3, connectedTownCount));
  let total = 0;
  for (let index = 0; index < stepCount; index += 1) total += baseSteps[index] + extraPerStep;
  return total;
};

const populationMultiplier = (tier) => {
  if (tier === "CITY") return 1.5;
  if (tier === "GREAT_CITY") return 2.5;
  if (tier === "METROPOLIS") return 3.2;
  return 1;
};

const townIncomePerMinute = ({
  supportRatio = 1,
  tier = "TOWN",
  connectedTownCount = 2,
  connectedTownBonusMultiplier = 1,
  market = false,
  bank = false,
  townGoldOutputMult = 1,
  populationIncomeMult = 1,
  marketIncomeBonusAdd = 0.5,
  bankIncomeBonusAdd = 0.5
} = {}) => {
  const connectedBonus = baseConnectedTownBonus(connectedTownCount) * connectedTownBonusMultiplier;
  return (
    4 *
    supportRatio *
    populationMultiplier(tier) *
    (1 + connectedBonus) *
    (market ? 1 + marketIncomeBonusAdd : 1) *
    (bank ? 1 + bankIncomeBonusAdd : 1) *
    townGoldOutputMult *
    populationIncomeMult
  );
};

const totalTechCosts = (techs) => {
  const totals = { gold: 0, FOOD: 0, IRON: 0, SUPPLY: 0, CRYSTAL: 0, SHARD: 0, researchSeconds: 0 };
  const byTier = new Map();
  for (const tech of techs) {
    const tier = tech.tier ?? 0;
    const tierTotals = byTier.get(tier) ?? { gold: 0, FOOD: 0, IRON: 0, SUPPLY: 0, CRYSTAL: 0, SHARD: 0, researchSeconds: 0, count: 0 };
    tierTotals.count += 1;
    tierTotals.gold += tech.cost?.gold ?? 0;
    tierTotals.FOOD += tech.cost?.food ?? 0;
    tierTotals.IRON += tech.cost?.iron ?? 0;
    tierTotals.SUPPLY += tech.cost?.supply ?? 0;
    tierTotals.CRYSTAL += tech.cost?.crystal ?? 0;
    tierTotals.SHARD += tech.cost?.shard ?? 0;
    tierTotals.researchSeconds += tech.researchTimeSeconds ?? 0;
    byTier.set(tier, tierTotals);

    totals.gold += tech.cost?.gold ?? 0;
    totals.FOOD += tech.cost?.food ?? 0;
    totals.IRON += tech.cost?.iron ?? 0;
    totals.SUPPLY += tech.cost?.supply ?? 0;
    totals.CRYSTAL += tech.cost?.crystal ?? 0;
    totals.SHARD += tech.cost?.shard ?? 0;
    totals.researchSeconds += tech.researchTimeSeconds ?? 0;
  }
  return { totals, byTier };
};

const dayBottleneck = (costs, incomePerDay) => {
  const results = {};
  for (const [key, value] of Object.entries(costs)) {
    if (key === "researchSeconds" || value <= 0) continue;
    const rate = incomePerDay[key] ?? 0;
    results[key] = rate > 0 ? value / rate : Infinity;
  }
  return results;
};

const maxFinite = (values) => {
  let max = 0;
  for (const value of Object.values(values)) {
    if (!Number.isFinite(value)) return Infinity;
    if (value > max) max = value;
  }
  return max;
};

const threeTownRows = [
  { label: "Base town", market: false, bank: false, connectedTownBonusMultiplier: 1 },
  { label: "Market", market: true, bank: false, connectedTownBonusMultiplier: 1 },
  { label: "Bank", market: false, bank: true, connectedTownBonusMultiplier: 1 },
  { label: "Market + Bank", market: true, bank: true, connectedTownBonusMultiplier: 1 },
  { label: "Market + Bank + Caravanary x2", market: true, bank: true, connectedTownBonusMultiplier: 2 },
  { label: "Market + Bank + Caravanary x1.5", market: true, bank: true, connectedTownBonusMultiplier: 1.5 }
];

const currentScenarios = {
  tall: {
    description: "3 connected towns, all supported, markets on all towns, focused resource empire",
    incomePerDay: {
      gold: townIncomePerMinute({ tier: "TOWN", supportRatio: 1, connectedTownCount: 2, market: true }) * 3 * 1440 + 1440,
      FOOD: 4 * 72 * 1.5,
      IRON: 2 * 60 * 1.5,
      SUPPLY: 2 * 60 * 1.5,
      CRYSTAL: 2 * 36 * 1.5,
      SHARD: 0
    }
  },
  wide: {
    description: "8 towns, average support 0.75, markets on 4 core towns, broader resource base",
    incomePerDay: {
      gold:
        townIncomePerMinute({ tier: "TOWN", supportRatio: 0.75, connectedTownCount: 2, market: true }) * 4 * 1440 +
        townIncomePerMinute({ tier: "TOWN", supportRatio: 0.75, connectedTownCount: 1, market: false }) * 4 * 1440 +
        1440,
      FOOD: 8 * 72 * 1.5,
      IRON: 5 * 60 * 1.5,
      SUPPLY: 5 * 60 * 1.5,
      CRYSTAL: 4 * 36 * 1.5,
      SHARD: 1
    }
  }
};

const goldSaturationReference = {
  goldPerMinute: 170,
  developmentSlots: 3,
  economicBuildMinutes: 5,
  structureCosts: {
    FARMSTEAD: 400,
    CAMP: 500,
    MINE: 500,
    MARKET: 600,
    GRANARY: 400,
    BANK: 700,
    AIRPORT: 900,
    TERRAIN_SHAPING: 8000
  }
};

const { totals, byTier } = totalTechCosts(techTree.techs);

console.log("CURRENT TECH TREE TOTALS");
console.log(JSON.stringify(totals, null, 2));
console.log("");

console.log("GOLD SINK PRESSURE REFERENCE");
const goldPerDay = goldSaturationReference.goldPerMinute * 1440;
const maxEconomicBuildsPerDay =
  goldSaturationReference.developmentSlots * (24 * 60 / goldSaturationReference.economicBuildMinutes);
console.log(
  `${goldSaturationReference.goldPerMinute} gold/m = ${goldPerDay.toFixed(0)} gold/day with ${goldSaturationReference.developmentSlots} development slots`
);
console.log(`Max 5-minute economic structure starts/day at slot cap: ${maxEconomicBuildsPerDay.toFixed(0)}`);
for (const [name, cost] of Object.entries(goldSaturationReference.structureCosts)) {
  console.log(`  ${name.padEnd(16)} funded/day=${(goldPerDay / cost).toFixed(1)}`);
}
console.log("");
console.log("CURRENT TECH TREE TOTALS BY TIER");
for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
  console.log(`Tier ${tier}: ${JSON.stringify(byTier.get(tier))}`);
}
console.log("");
console.log("CURRENT RESEARCH TIME IF ENFORCED");
console.log(`${(totals.researchSeconds / 3600).toFixed(1)} hours total`);
console.log("");

console.log("THREE-TOWN GOLD YIELD TABLE");
for (const tier of ["TOWN", "CITY", "GREAT_CITY"]) {
  console.log(`Population tier: ${tier}`);
  for (const row of threeTownRows) {
    const perTown = townIncomePerMinute({
      tier,
      supportRatio: 1,
      connectedTownCount: 2,
      market: row.market,
      bank: row.bank,
      connectedTownBonusMultiplier: row.connectedTownBonusMultiplier
    });
    const total = perTown * 3;
    console.log(
      `  ${row.label.padEnd(32)} perTown=${perTown.toFixed(2)} gpm total=${total.toFixed(2)} gpm daily=${(total * 1440).toFixed(0)}`
    );
  }
}
console.log("");

console.log("CURRENT TREE BOTTLENECK DAYS BY SCENARIO");
for (const [name, scenario] of Object.entries(currentScenarios)) {
  const bottlenecks = dayBottleneck(totals, scenario.incomePerDay);
  console.log(name.toUpperCase());
  console.log(scenario.description);
  console.log(`  Income/day: ${JSON.stringify(scenario.incomePerDay)}`);
  console.log(`  Bottlenecks(days): ${JSON.stringify(bottlenecks)}`);
  console.log(`  Fastest plausible full unlock pace without research timer: ${maxFinite(bottlenecks).toFixed(1)} days`);
}
