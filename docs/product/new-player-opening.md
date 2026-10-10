# New-player opening

Status: canonical

## Design contract

The opening teaches a useful, self-directed loop: discover food → expand and
garrison four food slots → extend reach with a Relay Beacon when necessary →
garrison a town → choose the next exploration goal. Existing economic rewards
provide the payoff; there are no new payouts, compulsory PvP encounters,
countdowns, or mandatory special landmarks.

Newly generated worlds must offer at least 50 qualified starting sites:

- First neutral FARM/FISH within five cardinal land steps.
- At least four food slots within eight land steps (FARM = 1, FISH = 2).
- A neutral town reachable within eight steps, with at least five tiles of
  straight-line Manhattan clearance from the starting capital.
- Dry, town/dock/resource-free 3×3 AFC footprint and at least ten tiles of wrapped
  Chebyshev separation between roster sites. Mountains may be flattened by
  AFC landing; sea may not.

"A resource or town within five tiles" was too weak: it could mean a useless
non-food resource, an enemy-held town, or something across an impassable bay.
The food target uses a five-step limit; the town deliberately allows a short
five-to-eight-step opening rather than crowding the capital.

Fifty sites are fifty opening opportunities, not fifty private copies of every
resource. Their routes and objectives can overlap. Runtime placement rechecks
neutral land and amenities, excluding rival reach along the opening routes as
well as across the AFC's starting disk. If a mature world has
exhausted suitable sites, the existing fallback remains available and logs
`starter_spawn_placed` with `source: fallback` and its actual quality. This is
not a perpetual safety or food guarantee for every late joiner.

## Guidance

Only settled/garrisoned food supplies slots; FRONTIER food does not count.
Owned settled TOWN, CITY, GREAT_CITY and METROPOLIS tiers satisfy the town goal.
Lightweight town identity is sufficient: no detail-fetch dependency. Enemy
towns and routes through enemy ownership/reach are excluded.

The checklist names the destination, coordinates, land-step distance and
benefit, highlighting only the next actionable tile. Both the 2D canvas and
true-3D maps consume the same target. If no actionable known route exists, it
explains building a Relay Beacon instead of highlighting an owned anchor.
Ordinary expansion does not increase reach. The first five beacons retain
their existing instant-build/no-food treatment; manpower costs still apply.

Finding a destination does not collapse the guidance. Securing food or a town
can collapse it, and finishing presents an acknowledgement and an optional
next exploration goal. Completion remains account-scoped.
Pending expansions and garrisons keep discovered goals checked but do not
count as secured supply or invite another action before resolution.

## Implementation and verification

1. Share a bounded starter-quality land-route validator in game-domain.
2. Use strict quality for world acceptance, human seed placement, runtime
   roster selection and the worldgen lab preview. Reject exhausted worldgen
   retries only when the required starter roster is missing; island-style
   preferences remain best-effort.
3. Update food-first client guidance, AFC local reach and completion feedback
   without changing resource balance or the established checklist styling.
4. Cover barriers, wrap seams, captured amenities, frontier food, upgraded
   towns, next-tile guidance and completion with regressions. The real
   world-generation coverage suite also verifies 50 qualified sites after AI
   placement across seeds and both styles. Run `pnpm ci:local`.

## Release and evaluation

This changes selection and generation, not existing terrain. A client/server
release does not retroactively add food or towns to the current staging season.
New-season activation is a separate operation; do not reset an occupied season
just to apply this change.

Use the structured placement diagnostics to audit qualified versus fallback
spawns. In a subsequent measured rollout, compare time to first garrisoned food,
four slots, first town, checklist completion and next-session return, segmented
by placement source and map style. Those funnel events and retention dashboards
are evaluation follow-up, not implemented analytics in this change.
