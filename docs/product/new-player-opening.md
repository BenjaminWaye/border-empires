# New-player opening

Status: canonical

## Design contract

Keep the existing town-first checklist and direct town/resource highlights.
The main improvement is qualified spawn placement, not a redesigned tutorial.
Existing economic rewards provide the payoff; there are no new payouts,
compulsory PvP encounters, countdowns, or mandatory special landmarks.

Newly generated worlds must offer at least 50 qualified starting sites:

- First neutral FARM/FISH within three cardinal land steps, inside AFC reach.
- At least four food slots within six land steps (FARM = 1, FISH = 2).
- A neutral town reachable within eight steps, with at least five tiles of
  straight-line Manhattan clearance from the starting capital.
- Dry, town/dock/resource-free 3×3 AFC footprint and at least ten tiles of wrapped
  Chebyshev separation between roster sites. Mountains may be flattened by
  AFC landing; sea may not.

"A resource or town within five tiles" was too weak: it could mean a useless
non-food resource, an enemy-held town, or something across an impassable bay.
The first food target tightens the requested five-tile limit to three, so the
first food garrison requires no beacon, regardless of checklist order. The town deliberately allows a short
five-to-eight-step opening rather than crowding the capital.

The six-step supply limit also avoids a manpower stall. At current base costs,
the conservative opening uses at most 29 neutral claims (290 MP), five
food/town garrisons (100), four beacon-site garrisons (80), and four early
beacons (200): 670 MP
against 720 starting MP. A radius-five beacon on a route's third tile covers
the remaining five land steps. Shared routes and fishing usually cost less;
optional actions or later competition can still spend or disrupt that budget.
The early beacon cost is 50 MP; the reviewed plan's older 30-MP assumption is
not used. Automatic frontier claims make the bound conservative.

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
towns are excluded from neutral expansion goals, and actionable objectives
must be inside uncontested reach.

Keep the existing four rows: find a town, Expand To it, find food, Expand To
four food slots. Highlight the actual in-reach town or resource, never an
intermediate route tile. Keep the existing town-anchor highlights, Relay
Beacon note, collapse behavior and automatic dismissal on completion.
Both the 2D canvas and true-3D maps consume the same objective list.

Land routes are a world-generation quality check, not a sequence of required
garrisons. Reach automatically claims neutral ground as FRONTIER. Plain-land
garrisons do not extend reach. The first five beacons retain their existing
instant-build/no-food treatment; manpower costs still apply.

The narrow checklist fixes count only garrisoned food and towns, use
lightweight town identity (including upgraded tiers), exclude enemy town
targets, include AFC reach, and suppress actions on pending targets.
Pending food remains discovered but is not usable supply. Completion keeps
the existing account-scoped persistence; no new acknowledgement UI is added.

## Implementation and verification

1. Share a bounded starter-quality land-route validator in game-domain.
2. Use strict quality for world acceptance, human seed placement, runtime
   roster selection and the worldgen lab preview. Reject exhausted worldgen
   retries only when the required starter roster is missing; island-style
   preferences remain best-effort.
3. Preserve the original checklist flow/UI and direct objective highlights.
   Apply only verified counting, identity, target and AFC-reach fixes.
4. Cover barriers, wrap seams, captured amenities, frontier food, upgraded
   towns, direct objective highlights and pending actions with regressions. The real
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
