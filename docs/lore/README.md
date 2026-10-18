# Lore: start here

Status: canonical lore index and maintenance policy

## Authoritative home

Read [the world bible](galactic-lore.md) before changing gameplay or writing
player-facing fiction. It is the single authoritative reference for the
setting, Houses, Coin, local industry, Manifests, AFCs and Great Projects.

| Document | Purpose |
|---|---|
| [World bible](galactic-lore.md) | Established fiction, terminology and explicitly recorded canon questions |
| [The Sable Recollections](duke-memoir.md) | Supporting in-world memoir; the character's account cannot override the world bible |
| [Game mechanics](../game-mechanics.md) | Current playable behavior, with implementation pointers |
| [Resource and manpower economy](../product/resource-and-manpower-economy.md) | Current costs, capacity, income, resource slots and economic behavior |
| [Manifest implementation plan](../manifest-full-plan.md) | Implementation history and remaining proposals; accepted fiction has moved to the world bible |

For gameplay work, go directly to [Houses and the economy](galactic-lore.md#11-houses-and-the-planetary-economy),
[Manifests and AFC modules](galactic-lore.md#12-manifests-and-afc-modules),
[Great Projects](galactic-lore.md#13-great-projects), or the
[open canon questions](galactic-lore.md#14-canon-boundaries-and-open-questions).

## Every gameplay change includes a lore check

1. Read the affected world-bible sections before changing economy, resources,
   structures, progression, territory, abilities, victory or campaign rules.
2. Update the world bible **in the same branch** whenever the change affects
   what those systems mean in the fiction. Update names, dependencies and
   explanations as well as newly introduced lore. Do not leave the accepted
   explanation only in a PR, chat, implementation plan or tech description.
3. Update the corresponding gameplay reference for actual rules and numbers.
   Keep balance values and implementation status out of the lore narrative.
   For a purely numerical change with no fictional impact, state
   "Lore reviewed; no canon change" in the PR or final change summary.
4. Check player-facing descriptions and supporting stories for contradictions.
   Link to the canonical explanation from design documents; avoid maintaining
   competing copies of it.
5. Record unresolved canon questions in the world bible's §14. Label new,
   unaccepted ideas as proposals. Do not silently turn a character's account
   or an old implementation sketch into a new canon decision.

Established lore and implementation status are separate: a setting concept
can be canon before its gameplay exists. Code and gameplay references describe
what currently runs; a mismatch calls for an explicit correction or a recorded
question, not an assumption that every lore paragraph is a shipped feature.

This policy is required by [AGENTS.md](../../AGENTS.md). The broader
[documentation maintenance runbook](../agents/documentation-maintenance.md)
covers lifecycle checks and verification commands.
