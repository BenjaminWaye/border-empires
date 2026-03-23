# AI Players With GOAP

## Why server-side AI

The current repo already has two distinct models:

- `packages/server/src/main.ts` owns the real game state, spawn flow, combat resolution, and timed world simulation.
- `packages/server/src/simulate.ts` is a websocket load generator that behaves like a noisy client.

For AI empires that should make the world feel inhabited, the correct home is the server runtime, not the websocket simulator. That gives us:

- full state access without fog-of-war hacks
- deterministic tick cadence
- no fake auth/socket lifecycle
- easier spawn, despawn, and difficulty control

## Why GOAP fits here

A simple scripted bot would quickly become brittle because the game already has:

- frontier vs settled territory
- resource and gold constraints
- defensive structures
- multiple attack modes
- town network and economy considerations
- opportunistic combat against barbarians and players

GOAP is a good fit if we keep the planner narrow. The planner should choose short tactical-operational plans from curated actions, not try to solve the whole game tree.

## Recommended architecture

### 1. Add server-owned AI empires

Extend the server with explicit AI player metadata instead of pretending they are websocket users.

Suggested state:

- `AiPlayerProfile`
- `AiBrainState`
- `AiPlanStep`
- `aiPlayersById`

Each AI empire should still reuse the existing `Player` type for core economy/combat/territory ownership.

### 2. Extract an internal action executor

Today, human actions are validated and resolved inside the websocket message handler in `packages/server/src/main.ts`.

Before meaningful AI work, extract reusable helpers such as:

- `tryQueueFrontierAction(actor, action)`
- `tryQueueAttackAction(actor, action)`
- `tryBuildStructureAction(actor, action)`
- `tryStartSettlementAction(actor, tile)`

The websocket handler should become a thin translation layer from client messages to these internal commands.

### 3. Run AI on a low-frequency planning loop

Use two loops:

- `plan` loop every 2-5 seconds
- `act` loop every 500-1000 ms

That keeps planning cost bounded while still making the world feel alive.

## GOAP state model

The planner should work from a compact snapshot, not raw world state.

Suggested facts:

- `hasFrontierNeighbor`
- `hasNeutralLandOpportunity`
- `hasBarbarianTarget`
- `hasWeakEnemyBorder`
- `needsSettlement`
- `goldHealthy`
- `ironHealthy`
- `crystalHealthy`
- `staminaHealthy`
- `underThreat`
- `capitalExposed`
- `canBuildFort`
- `canBuildEconomy`
- `townNetworkWeak`

Suggested scored goals:

- `expand_frontier`
- `clear_barbarians`
- `harass_enemy_border`
- `settle_interior`
- `fortify_capital`
- `grow_income`
- `connect_towns`
- `recover_resources`

The planner should score goals from the current snapshot, then search only the top few.

## Active season victory paths

The current branch treats these as the explicit season victory routes the AI should reason about:

- `TOWN_CONTROL`: control 50% of world towns and hold it for 24 hours
- `SETTLED_TERRITORY`: control 66% of all claimable land as settled territory and hold it for 24 hours
- `ECONOMIC_HEGEMONY`: reach at least 200 gold per minute while staying 33% ahead of second place for 24 hours

These are implemented through the existing timed-objective framework, but presented to players as season victory paths rather than generic pressure rewards.

## First action set

Keep the initial action library small and tied to existing mechanics:

- `claim_neutral_border_tile`
- `attack_barbarian_border_tile`
- `attack_enemy_border_tile`
- `settle_owned_frontier_tile`
- `build_fort_on_exposed_tile`
- `build_economic_structure`
- `collect_visible_yield`
- `wait_and_recover`

That is enough to make the map feel populated without immediately tackling every tech or special ability.

## Behavioral phases

The easiest way to stop GOAP from becoming noisy is to gate actions by empire phase:

- opening: prioritize food-adjacent spawn expansion and first settlement
- growth: prioritize neutral claims, barbarians, and economy
- pressure: opportunistic attacks on weak neighbors
- defense: fortify, settle, and recover when exposed

Phase is not the plan. Phase narrows the action set and retunes goal scores.

## First implementation milestone

### Milestone A

- create AI player records on server start or when online population is low
- spawn them with normal player rules
- rank the active season victory paths for each empire, then run the planner over local empire snapshots
- support only neutral expansion, barbarian clearing, settlement, and fort building

This is enough for "less empty world" testing.

### Milestone B

- add enemy border pressure
- add economy structures
- add town network awareness

### Milestone C

- add tech/domain choice heuristics
- add special attacks
- add diplomacy or personality variance

## Risks to avoid

- Do not give AI direct ownership mutations that bypass validation helpers.
- Do not plan from full-world tile graphs each tick; snapshot and score first.
- Do not try to make AI respect client fog unless we explicitly want "fair" AI.
- Do not start with dozens of goals/actions; branch factor will explode.

## Practical next step

Refactor the websocket action path into reusable server commands, then wire a small GOAP brain to those commands.
