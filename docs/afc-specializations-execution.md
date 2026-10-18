# AFC specialization implementation

Status: active implementation
Owner: implementing agent
Updated: 2026-10-18
Scope: execute the full [catalogue](afc-specializations-catalog.md), not just its interface.

## Delivery contract

One free, permanent choice at each of five tiers; all six paths are offered at
that tier. The highest commissioned Manifest tier banks access to earlier tiers.
No Coin or Shards are charged. At least one active owned AFC is required to
install; AFC loss never deletes an installed configuration or replays a grant.
Keep the shipped history-above-current-options layout and readiness badge.
Mechanical summaries, lore, previews, actual math, and AI share authoritative rules.

Use the existing plan's working defaults as the implementation baseline: five-minute
momentum decay, +25% fortified-town defense, ×2 core-town Coin and one-time +50%
non-Metropolis core population, tech-free Scarcity equipment, +50% logistics,
+2 Coin/day +0.02 MP/min +30 MP cap per mutual ally, +15% coalition attack,
reciprocal physical allied dock links, ×2 diplomatic contribution, five-minute
tower suppression using the existing cooldown, and a 12h unbreakable forced truce
with a 48h caster cooldown. Numbers remain centrally tunable.

Existing seasons retain their prior rules and choices. New seasons select the
complete specialization ruleset by default. Save/replay and reconnect preserve
the ruleset and outcome state; no forced live-season reset, speculative ID mapping,
refund, or repeated one-shot grant. A compatible rollback must retain support for
new-ruleset state. This execution supersedes the planning-only delivery boundaries
and optional product-review wording in the earlier proposal.

## Work and completion gates

- [ ] 1. Typed 30-entry catalogue with branch, tier, mechanical text, lore, category,
  effect contract; shared eligibility evaluator; versioned season/player state;
  INIT/update parity; no-price installation and existing-season compatibility.
- [ ] 2. Passive combat/build/reach/economy effects, authoritative previews, stable
  first-three-town membership, cache reconciliation, numeric regression tests.
- [ ] 3. Atomic Scarcity/population grants and paid recruitment; per-flag Momentum;
  non-recursive Breakthrough; persistent per-fort 24h wards; lifecycle/replay tests.
- [ ] 4. Suppression and masked flag detection/Purge; same interactions and status
  presentation in 2D canvas and true-3D, with fog authorization tests.
- [ ] 5. Mutual-alliance benefits, physical trade-link income, bounded 24h war-pair
  state, authoritative gateway forced truces, weighted victory with one winner.
- [ ] 6. Player controls for active rewards, truthful installation previews and
  one-shot outcomes; free-tier notifications; AI choices/active abilities including
  worker path. No old shard-funding tutorial in specialization progression.
- [ ] 7. Full effect/command/recovery tests, narrow-phone and desktop browser checks,
  checkpoint/performance guards, pnpm ci:local, player changelog and canonical docs.
- [ ] 8. Review complete diff, push PR against develop, verify CI, merge and cleanup;
  verify staging deployment. Any external rollout limitation is stated explicitly.

## Effect acceptance matrix

| Path | I | II | III | IV | V |
| --- | --- | --- | --- | --- | --- |
| Vanguard | ×2 vs planetary defense | +1 flag, −10s assault | flag-local +5% ×3, frontier refresh | ×0.5 fort MP baseline | one adjacent enemy capture, no recursion |
| Bastion | ×2 fort speed, three Titanium waivers | ×2 factory defense contribution | +25% fortified-town defense | ×2 attacking MP baseline | first successful breach blocked, 24h recharge |
| Dominion | ×3 beacon speed | dock reach 2 | town reach 4 | ×2 garrison speed | ×2 all build speed, beacon ×6 |
| Exchequer | ×1.5 core Coin, −2 town FOOD | least-owned legal resource boosters | ×2 Clearing House uplift | 1 Coin→5 MP, ×1.5 transfer | ×2 core Coin, core population consignment |
| Oracle | first tower CRYSTAL waiver | ×0.5 tower cooldown | +15 casting range | suppress hostile tower | exact masked flag locations/Purge |
| Chancery | per-mutual-ally income/MP/cap | doubled allied dock income | shared-war +15% attack | force 12h truce, 48h recharge | ×2 contribution, largest actual member wins |

Each box requires actual outcome tests, display/preview agreement, and persistence
coverage where it introduces durable state. Empty or placeholder effects are not done.
