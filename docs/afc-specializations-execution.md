# AFC specialization implementation

Status: implemented; PR validation and staging rollout pending
Owner: implementing agent
Updated: 2026-10-20
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
10% of each mutual ally’s domestic Coin income/MP capacity/regen, +15% coalition attack,
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

- [x] 1. Typed 30-entry catalogue with branch, tier, mechanical text, lore, category,
  effect contract; shared eligibility evaluator; versioned season/player state;
  INIT/update parity; no-price installation and existing-season compatibility.
- [x] 2. Passive combat/build/reach/economy effects, authoritative previews, stable
  first-three-town membership, cache reconciliation, numeric regression tests.
- [x] 3. Atomic Scarcity/population grants and paid recruitment; per-flag Momentum;
  non-recursive Breakthrough; persistent per-fort 24h wards; lifecycle/replay tests.
- [x] 4. Suppression and masked flag detection/Purge; same interactions and status
  presentation in 2D canvas and true-3D, with fog authorization tests.
- [x] 5. Mutual-alliance benefits, physical trade-link income, bounded 24h war-pair
  state, authoritative gateway forced truces, weighted victory with one winner.
- [x] 6. Player controls for active rewards, truthful installation previews and
  one-shot outcomes; free-tier notifications; AI choices/active abilities including
  worker path. No old shard-funding tutorial in specialization progression.
- [x] 7. Full effect/command/recovery tests, narrow-phone and desktop browser checks,
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
| Chancery | 10% allied domestic income/MP cap/regen | doubled allied dock income | shared-war +15% attack | force 12h truce, 48h recharge | ×2 contribution, largest actual member wins |

Each box requires actual outcome tests, display/preview agreement, and persistence
coverage where it introduces durable state. Empty or placeholder effects are not done.

## Verification record

- The catalogue has six paths and thirty rewards with separate mechanical text
  and lore. Runtime tests cover free choices, legacy-season compatibility, grants,
  paid overflow, suppression, war eligibility, trade, ward recharge/transfer,
  normal battle blocking, and a non-recursive garrisoned bonus capture.
- Installation choices and one-shot final tile values share one journal event;
  recruitment journals its Coin debit and paid manpower together. Recovery tests
  cover these without relying on a later checkpoint.
- AI worker tests cover free picks, AFC eligibility, masked Purge targeting, and
  paid recruitment. Existing planner regression and full CI suites remain gates.
- Chrome component checks at 390px and 1440px exercised fresh choices, installed
  history and recruitment: six options, one AFC header, no horizontal overflow,
  and 44px install controls. Signal tests exercise real projection callbacks in
  both renderer modes, masked fog targeting, and no projection work for an
  ordinary 8,000-tile viewport.
- Code review also checked recent develop changes to tower dormancy, AFC Modules
  overview, manpower restart recovery, and removal of tile shedding. No legacy
  server changes, manual season rollover, or production deployment are included.
- Local CI passed all stages through the client suite except an obsolete source
  location assertion for the extracted Purge dispatcher. That assertion now tests
  actual accepted/rejected sends. The full client rerun passed 734 files / 5,051
  tests; client lint and production build also passed. Other full-suite results:
  shared 691, game-domain 148, simulation 3,392, gateway 1,457 tests; simulation
  performance (10) and slow (2) tests passed. Existing skips/todos are retained.
  File-size, documentation, changelog and strict TypeScript gates passed.
- Latest develop's captured-building survival fix was retained on rebase.
  PR checks, merge, cleanup and staging verification remain the release gate;
  completion is confirmed in the linked PR and deployment checks.

### Envoy percentage revision (2026-10-20)

Envoy now reads domestic values before Envoy contributions. The economy cache
holds domestic snapshots; a fresh allied-income overlay prevents circular bonus
reads and picks up an ally’s changed income even when the recipient’s cache is
warm. Manpower formulas share the same percentage collector. Direct Envoy
dependents settle their old refill rate before relevant domestic tile/command
changes; alliance transitions restamp capacity without awarding new manpower.

Both full and per-player exports carry the computed Coin contribution for the
reconnect source row. This derived scalar is not written to durable snapshots.
Visible exports also supply the requesting player’s actual capacity, refill rate,
logistics and breakdown. Required callback contracts prevent silent omissions.
Regression tests cover mutual upgrades, accrual, changing allied production,
alliance loss/reformation, restart, zero work without the upgrade, and linear
reads across twelve contributing allies.
