# Gold Sinks And Converter Proposal

## Current Gold Pressure

Grounded in the live server rules in `packages/server/src/main.ts`:

- Base town gold is `4 gold/m`
- Dock gold is `2 gold/m`
- Frontier claim / attack cost is only `1 gold`
- Breakthrough cost is only `2 gold`
- Settle is `60s`
- Economic structure build is `5m`
- Fort / siege build is `10m`
- Development process limit is `3`

Current structure gold costs:

- `Farmstead`: `400`
- `Camp`: `500`
- `Mine`: `500`
- `Market`: `600`
- `Granary`: `400`
- `Bank`: `700`
- `Airport`: `900`
- Terrain shaping action: `8000`

Current ongoing gold upkeeps:

- `Farmstead`: `1 / 10m`
- `Camp`: `1.2 / 10m`
- `Mine`: `1.2 / 10m`
- `Granary`: `1 / 10m`
- Fort: `2 / 10m`
- Siege outpost: `2 / 10m`
- Settled land: `1 / 10m per 40 settled tiles`

Conclusion:

- Gold is not scarce enough once an empire reaches strong city income.
- The real brake becomes build slots, resource inputs, and now research time.
- A player at `170 gold/m` produces `244,800 gold/day`.
- That can fund:
  - `612` farmsteads per day
  - `408` markets per day
  - `350` banks per day
  - `272` airports per day
  - only `30.6` terrain-shaping actions per day
- With only `3` development slots and `5m` economic builds, the hard cap is `864` economic structure starts per day.

So the economy problem is real:

- gold eventually stops being the deciding limiter
- advanced empires need more repeatable gold sinks
- those sinks should convert excess wealth into weaker strategic output, not free progression

## Design Rule

Do not solve this by allowing multiple simultaneous tech researches.

Why:

- research pacing collapses again
- rich players turn gold into tree completion instead of map strength
- it makes expansion less relevant than treasury snowballing

Better rule:

- one active research at a time
- extra gold gets spent on infrastructure, war tempo, and inefficient conversion

## Converter Branch

Your suggested direction is good, but it should not be one universal building.

Better:

- one converter structure for each synthesizeable strategic resource
- all of them consume `gold + food`
- all of them are clearly weaker than holding the real map resource
- all of them are buildable on empty settled land
- none of them produce `SHARD`

`SHARD` should stay expansion / ancient-site gated.

## Resource Baselines

From current live resource rates:

- `1 FARM = 72 FOOD/day`
- `1 FISH = 48 FOOD/day`
- `1 IRON tile = 60 IRON/day`
- `1 FUR or WOOD tile = 60 SUPPLY/day`
- `1 GEMS tile = 36 CRYSTAL/day`
- `1 OIL tile = 48 OIL/day`

So:

- `4 farms = 288 FOOD/day`
- `2 crystal tiles = 72 CRYSTAL/day`

That means your original crystal idea is workable only if it is intentionally very inefficient.

## Proposed Converter Structures

### Crystal Synthesizer

- Role: emergency crystal bridge for teching and observatory play
- Placement: empty settled land
- Unlock tier: `3`
- Upfront build cost: `900 gold + 60 FOOD`
- Upkeep: `120 gold / 10m + 2 FOOD / 10m`
- Output: `12 CRYSTAL/day`

Reason:

- one real crystal tile gives `36/day`
- this gives one-third of a real tile
- it helps a food-rich player reach crystal techs without making gems optional

### Ironworks

- Role: emergency iron bridge for forts, breach, and steel branch
- Placement: empty settled land
- Unlock tier: `2` or `3`
- Upfront build cost: `800 gold + 50 FOOD`
- Upkeep: `100 gold / 10m + 2 FOOD / 10m`
- Output: `18 IRON/day`

Reason:

- one real iron tile gives `60/day`
- this gives less than one-third of a real tile

### Fur Synthesizer

- Role: converts wealth and agriculture into logistics
- Placement: empty settled land
- Unlock tier: `2`
- Upfront build cost: `800 gold + 50 FOOD`
- Upkeep: `100 gold / 10m + 2 FOOD / 10m`
- Output: `18 SUPPLY/day`

Reason:

- one real supply tile gives `60/day`
- this gives less than one-third of a real tile
- wide players still want real fur/wood control

### Synthetic Fuel Plant

- Role: late-game oil bridge for airport empires
- Placement: empty settled land
- Unlock tier: `6`
- Upfront build cost: `1200 gold + 80 FOOD`
- Upkeep: `160 gold / 10m + 2 FOOD / 10m`
- Output: `12 OIL/day`

Reason:

- this should never replace real oil fields
- it only prevents a rich empire from being fully hard-stalled if no oil field is nearby

## Unlock Recommendation

Do not add four separate early techs just for these.

Best fit:

- Tier 2 `Preservation` or `Provisioning`
  - unlocks `Fur Synthesizer`
- Tier 3 `Proto-Industry`
  - unlocks `Ironworks`
  - unlocks `Crystal Synthesizer`
- Tier 6 `Plastics`
  - unlocks `Synthetic Fuel Plant`

This keeps the tree readable and gives early non-expansion empires a backup path.

## Why Tier 2-3 Is Correct

You are right that converters need to exist before the midgame.

If they arrive too late:

- players who spawn with only food and towns still get hard-locked out of crystal and iron branches
- the game says “expand or stall”

If they arrive too early and are too efficient:

- map expansion becomes optional
- food starts solving every branch too easily

Tier 2-3 is the right zone if the structures are intentionally weak.

## Important Implementation Rule

These should be weaker than real map control in three ways:

- lower output than real resource tiles
- high gold upkeep
- food upkeep competes directly with town feeding

That third point is important because it creates a real tall-vs-tech tradeoff:

- do I feed cities for gold and growth
- or burn food to synthesize missing inputs

That is a good strategic decision.

## Recommended Next Revision To The Tree

If we revise the current 1-6 table again, the cleanest additions are:

- add `Fur Synthesizer` unlock in tier 2
- add `Proto-Industry` unlock in tier 3
- keep `Coinage -> Bank`
- keep `Ledger Keeping` as connected-city / storage support
- keep `Industrial Extraction -> Foundry`
- keep `Aeronautics -> Airport`
- keep `Plastics` as the late oil branch

## Strong Opinion

Do not make converters good enough that “rich + safe + tall” beats “controls the map.”

They should do this:

- prevent hard lockout
- give rich empires a place to spend surplus gold
- smooth bad starts

They should not do this:

- replace iron, crystal, supply, or oil expansion

## Suggested Names

Best names:

- `Crystal Synthesizer`
- `Ironworks`
- `Fur Synthesizer`
- `Synthetic Fuel Plant`

If you want a more cohesive naming family:

- `Resonance Plant` for crystal
- `Steelworks` for iron
- `Provisioner` for supply
- `Fuel Cracker` for oil
