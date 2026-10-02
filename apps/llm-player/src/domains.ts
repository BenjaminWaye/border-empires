// Which domains the bot offers the LLM on a given turn. The server already
// computes the open choices and per-domain requirements and ships them in
// INIT/TECH_UPDATE/DOMAIN_UPDATE (apps/simulation/src/tech-domain-bridge/), so
// unlike tech (tech-tree.ts) there is no bundled copy of the tree to drift:
// this only re-checks the live parts the server computed at send time (gold
// and stockpile move constantly) and drops what the bot can't send.
//
// A domain is a permanent, mutually exclusive pick -- one per tier, tiers in
// order. Tier 1 costs gold only; tier 2+ also costs SHARD from a stockpile
// this bot never builds up (shard collection is out of scope), so in practice
// only tier 1 is ever offered. That falls out of the affordability check
// below rather than a hard-coded tier cap, so it stays correct if shards ever
// show up in strategicResources.
import type { DomainOption, DomainState } from "./game-types.js";

export type DomainChoice = { id: string; name: string; tier: number; description: string; goldCost: number };

const canAffordResources = (cost: Record<string, number>, stockpile: Record<string, number>): boolean =>
  Object.entries(cost).every(([resource, amount]) => (stockpile[resource] ?? 0) >= amount);

export const isDomainOffered = (option: DomainOption, state: DomainState, techIds: readonly string[], gold: number): boolean =>
  state.openChoiceIds.includes(option.id) &&
  !state.domainIds.includes(option.id) &&
  // The sub-choice (which trickle resource) isn't something the bot sends.
  !option.needsResourceChoice &&
  techIds.includes(option.requiresTechId) &&
  gold >= option.goldCost &&
  canAffordResources(option.resourceCost, state.strategicResources);

export const availableDomainChoices = (state: DomainState, techIds: readonly string[], gold: number): DomainChoice[] =>
  state.catalog
    .filter((option) => isDomainOffered(option, state, techIds, gold))
    .map((option) => ({
      id: option.id,
      name: option.name,
      tier: option.tier,
      description: option.description,
      goldCost: option.goldCost
    }));
