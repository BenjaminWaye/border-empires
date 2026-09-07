import { techGoldCostForResearchedCount } from "@border-empires/shared";
import {
  domainEntryById,
  hasResources,
  playerWorldFlags,
  rawResourceCountsForPlayer,
  reachableDomainChoices,
  reachableTechChoices,
  techDepth,
  techEntryById,
  toResources,
  type AiProgressionChoice,
  type AiProgressionPlannerTile,
  type AiProgressionPlayer,
  type DomainCatalogEntry,
  type TechCatalogEntry
} from "./tech-domain-bridge.js";

// AI tech/domain choice scoring, split out of tech-domain-bridge.ts
// (already over the repo's 500-line soft cap) so this doesn't grow that
// file further — see scripts/check-file-line-limits.mjs.
export const chooseAiTechChoiceForPlayer = (
  player: AiProgressionPlayer,
  tiles: Iterable<AiProgressionPlannerTile>
): AiProgressionChoice | undefined => {
  const flags = playerWorldFlags(player.id, tiles);
  const counts = rawResourceCountsForPlayer(player.id, tiles);
  const available = player.strategicResources ?? {};
  return reachableTechChoices([...player.techIds])
    .map((id) => techEntryById.get(id))
    .filter((tech): tech is TechCatalogEntry => Boolean(tech))
    .map((tech) => {
      let score = 0;
      if (tech.id === "toolmaking") score += 80;
      if (tech.id === "agriculture" && (flags.has("active_town") || (counts.FARM ?? 0) > 0 || (counts.FISH ?? 0) > 0)) score += 55;
      if (tech.id === "trade" && flags.has("active_town")) score += 50;
      if (tech.id === "trade" && flags.has("active_dock")) score += 40;
      if (tech.id === "tribal-warfare" && (counts.TITANIUM ?? 0) > 0) score += 40;
      if (tech.id === "tribal-warfare" && (flags.has("active_town") || flags.has("active_dock"))) score += 28;
      if (tech.id === "cartography" && (counts.GEMS ?? 0) > 0) score += 30;
      if (tech.id === "mining" && (flags.has("active_titanium_site") || flags.has("active_crystal_site"))) score += 55;
      if (tech.id === "masonry" && flags.has("active_town")) score += 45;
      if (tech.id === "masonry" && flags.has("active_dock")) score += 25;
      if (tech.id === "leatherworking" && (counts.UMBRITE ?? 0) > 0) score += 35;
      if (tech.id === "harborcraft" && flags.has("active_dock")) score += 65;
      if (tech.id === "maritime-trade" && flags.has("active_dock")) score += 55;
      if (tech.id === "port-infrastructure" && flags.has("active_dock")) score += 45;
      if (tech.id === "coinage" && flags.has("active_town")) score += 55;
      if (tech.id === "banking" && flags.has("active_town")) score += 45;
      if (tech.id === "civil-service" && flags.has("active_town")) score += 35;
      score += Math.max(0, 24 - techDepth(tech.id) * 6);
      const resourceCost = toResources(tech.cost);
      const goldCost = techGoldCostForResearchedCount(player.techIds.length);
      return {
        id: tech.id,
        score,
        goldCost,
        resourceCost,
        affordable: player.points >= goldCost && hasResources(resourceCost, available)
      };
    })
    // Affordable techs win over unaffordable ones regardless of score, so a
    // cheaper fallback is preferred over a pricier higher-scored option the
    // player can't pay for (techs below tier 5 are gold-only now, §6.2/§13
    // of manpower-economy-rewrite-plan.md — per-tier gold scarcity is the
    // trigger). When nothing is affordable, score order is preserved so the
    // diagnostic still surfaces the most-wanted-but-blocked tech.
    .sort((left, right) =>
      Number(right.affordable) - Number(left.affordable) ||
      right.score - left.score ||
      left.id.localeCompare(right.id)
    )[0];
};

export const chooseAiDomainChoiceForPlayer = (
  player: AiProgressionPlayer,
  tiles: Iterable<AiProgressionPlannerTile>
): AiProgressionChoice | undefined => {
  const flags = playerWorldFlags(player.id, tiles);
  const counts = rawResourceCountsForPlayer(player.id, tiles);
  const available = player.strategicResources ?? {};
  const settledTileCountForChoice =
    player.settledTileCount ??
    [...tiles].reduce((count, tile) => count + (tile.ownerId === player.id && tile.ownershipState === "SETTLED" ? 1 : 0), 0);
  return reachableDomainChoices([...player.techIds], [...(player.domainIds ?? [])])
    .map((id) => domainEntryById.get(id))
    .filter((domain): domain is DomainCatalogEntry => Boolean(domain))
    .map((domain) => {
      let score = 0;
      if (domain.id === "frontier-doctrine" && !flags.has("active_town")) score += 45;
      if (domain.id === "frontier-doctrine" && settledTileCountForChoice < 20) score += 20;
      if (domain.id === "mercantile-charter" && flags.has("active_town")) score += 65;
      if (domain.id === "mercantile-charter" && flags.has("active_dock")) score += 35;
      if (domain.id === "clockwork-stipend") score += 30;
      if (domain.id === "titanium-bastions" && flags.has("active_town")) score += 20;
      if (domain.id === "supply-raiding" && (counts.UMBRITE ?? 0) > 0) score += 18;
      const resourceCost = toResources(domain.cost);
      return {
        id: domain.id,
        score,
        goldCost: domain.cost?.gold ?? 0,
        resourceCost,
        affordable: player.points >= (domain.cost?.gold ?? 0) && hasResources(resourceCost, available)
      };
    })
    // Affordability dominates score so an AI starved of one resource still
    // picks an affordable domain (e.g. clockwork-stipend, which grants a free
    // slot of the missing resource) instead of being pinned to an unaffordable top score.
    .sort((left, right) =>
      Number(right.affordable) - Number(left.affordable) ||
      right.score - left.score ||
      left.id.localeCompare(right.id)
    )[0];
};
