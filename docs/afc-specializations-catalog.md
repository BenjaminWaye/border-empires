# AFC Specializations — upgrade catalogue and explanations

Status: implementation reference (v3 rework, 2026-11-02; plan in [`design/afc-v3-plan.md`](design/afc-v3-plan.md))
Owner: Benjamin Waye (product decisions); implementing agent (delivery)
Last verified: 2026-11-02
Replaces: paid domains in new `afc-v1` campaigns; existing seasons retain their rules

Thirty entries, six branches, five tier choices. IDs are slot-stable: `afc-<branch>-<tier>`
always names that branch's pick at that tier, so the v3 Bastion reorder changed what
`afc-bastion-1..3` grant rather than leaving tiers empty or double-filled. Tiers mix
branches freely, so **no upgrade may require an earlier pick to work**: a link between
picks only ever adds a bonus, and the picker shows each link on the later card
(`AFC_SYNERGIES`, `packages/shared/src/afc-specializations/afc-synergies.ts`).
All choices are free; active recruitment still spends Coin. Mechanical copy and the
explanation are separate catalogue fields, both shown in the UI.

## Vanguard — conquest through assault coordination

The AFC's assault command systems combine formation telemetry, breach planning,
and occupation broadcasts. Their benefits follow actual attacks and particular
formations; they do not confer an unexplained permanent martial temperament.

| Tier / ID | Name | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-vanguard-1` | **Pacification Routines** | ×2 attack against Planetary Defense/barbarian holdings; +25 Coin bounty per Planetary Defense tile an ATTACK captures (`barbarianCaptureCoinBonus`). | Command software loads assault patterns for the planet's residual defense positions, and the Court pays for every position cleared. |
| II `afc-vanguard-2` | **Assault Command Lattice** | +1 muster flag; fights resolve in 10s instead of 15s (−5s, floored at 5s with other reductions). Travel time unchanged. | Additional command channels coordinate another formation while accelerated orders shorten the assault phase. |
| III `afc-vanguard-3` | **Battlefield Momentum** | Garrisoned victories grant the launching flag +10% attack per stack, max five stacks (+50%). Frontier captures refresh the timer; one stack decays per five idle minutes; moving/disbanding clears it. | A formation's captured intelligence and coordinated advance produce a temporary local advantage. |
| IV `afc-vanguard-4` | **Sapper Coordination** | Fort attack commitment requirement ×0.5, with consistent combat baseline and preview. | Breach crews identify access routes and demolition points, reducing the force needed to assault a fortified position. |
| V `afc-vanguard-5` | **Breakthrough Protocol** | A primary garrisoned victory captures one random adjacent tile of the same defender; two when the launching flag is at full Momentum (🔗 Battlefield Momentum). No second roll or recursive grant. Both sides see a breach effect. | Occupation broadcasts and the collapse of local command compel neighboring positions to capitulate. |

Breakthrough preserves ordinary capture consequences, ownership state, fort
destruction/asset capture, alerts, and encirclement. Skip water, allies/truces,
active combat/pending claims, warded forts and Aegis-locked tiles. The surrendered
tiles do not build Momentum, issue another Breakthrough, or mint plunder. The chosen
targets are stored with the combat roll. The simulation sends `AFC_BREAKTHROUGH`
(attacker and each defender) and the client draws the breach line and shockwave in
both renderers through the shared AFC effects layer.

## Bastion — a prepared defensive empire

| Tier / ID | Name | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-bastion-1` | **Citadel Reserves** | Towns keep growing during nearby war (skip the `NEARBY_WAR_PAUSE_MS` pause); +25% defense on garrisoned towns with an active Palisade or Fort. | Trained reserves and protected supply stores keep the town working and reinforce its garrison. |
| II `afc-bastion-2` | **Fortification Patterns** | Forts buildable without the Titanium Forge Module; the first three Forts built cost no manpower (`freeFortCount`, counted in `afcCampaign.freeFortsUsed`) and three keep no TITANIUM slot; later Forts −50% manpower. A cancelled free Fort returns its allowance. | Prefabricated plans and starter stores make the first defensive works cheap and light on crews. |
| III `afc-bastion-3` | **Armour Production Mandate** | Double the defense contributed by Titanium and Umbrite Weapons Factories, including the Arsenal concentration multiplier. | The headquarters prioritizes protective equipment. |
| IV `afc-bastion-4` | **Defensive Depth** | Attacks against active owned forts require ×2 MP commitment (odds baseline too; no doubled casualties). | Layered obstacles require a larger assault force. |
| V `afc-bastion-5` | **Ablative Ward Network** | First otherwise successful attack on each ready fort is blocked; attacker spends its full commitment; 24h recharge that survives rebuilding/transfer. | A sacrificial aether ward absorbs one breach. |

## Dominion — territorial development

| Tier / ID | Name | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-dominion-1` | **Relay Fabrication Line** | Relay Beacon manpower ×1/3; every Relay builds instantly; the first ten Relays need no FOOD slot instead of five. | Standardized relay assemblies that small crews install at once. |
| II `afc-dominion-2` | **Colonial Charter** | Each garrisoned town receives one free, active Incubation Engine on an open support tile — no Coin, manpower or Incubation Corps — with the usual population burst. It still uses its FOOD slot. Delivered once per town (`town.colonialIncubationGranted`) by a 15s sweep over charter holders; towns without an open support tile are retried. | Colonial charters ship a starter incubation plant with every new settlement. |
| III `afc-dominion-3` | **Provincial Survey Array** | Town reach radius 3 → 4. | Survey and dispatch equipment widen each town's jurisdiction. |
| IV `afc-dominion-4` | **Expansion Doctrine** | EXPAND is priced as if the House held half its frontier tiles; garrisoning costs 50% less manpower (sent to the client as `settleManpowerCost`). | Prepared settlement packages let crews secure new ground quickly. |
| V `afc-dominion-5` | **Universal Fabrication Line** | All building manpower ×0.5 and every non-monument build is instant; with tier I Relays cost ×1/6 (🔗 Relay Fabrication Line). | A common assembly and dispatch system for all construction. |

## Exchequer — a compact Coin powerhouse

| Tier / ID | Name | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-exchequer-1` | **Founding Concession** | First three towns ×1.5 Coin; each uses two fewer FOOD slots. | Favorable starter export contracts and coordinated provisioning. |
| II `afc-exchequer-2` | **Scarcity Consignment** | One-time delivery of boosters to every eligible deposit of the scarcest known resource; fallback +1 FOOD slot. | Finished extraction equipment bought offworld. |
| III `afc-exchequer-3` | **Clearing Privilege** | Clearing House uplift doubled: +60% town Coin per linked Manufactory. | Preferential clearing terms. |
| IV `afc-exchequer-4` | **Orbital Recruitment Contract** | Buy 5 MP for 1 Coin, uncapped, retaining paid overflow; +50% pool-to-flag throughput. | Ancillary contingents bought from offworld suppliers. |
| V `afc-exchequer-5` | **Metropolitan Concession** | Core towns ×2 Coin (×3 with tier I, 🔗 Founding Concession); one-time +50% population below Metropolis; Economic Hegemony needs a 20% income lead instead of 33% for this House. | The Court recognizes preferred export centers and their House's commercial standing. |

## Oracle — Aether Tower operations

Every tower ability spends one of the tower's shots (3 per 24h; 6 with Resonance Governor).

| Tier / ID | Name | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-oracle-1` | **Starter Resonance Cell** | First qualifying Aether Tower requires no CRYSTAL slot. | A dedicated starter power cell. |
| II `afc-oracle-2` | **Resonance Governor** | ×2 shots per tower (6 per 24h). | Automated phase balancing. |
| III `afc-oracle-3` | **Long-Range Resonator** | Tower casting range +15 tiles (20 → 35). | A tuned resonator holds a control signal further out. |
| IV `afc-oracle-4` | **Counterphase Emitter** | Suppress a hostile tower's casting and shield for five minutes (1 shot); Aegis Domes block it. A suppressed tower is open to Resonance Hijack. | Interference matched to the hostile resonator. |
| V `afc-oracle-5` | **Resonance Hijack** | Target a hostile tower with no shot left, or suppressed. 1 shot starts a 10-minute takeover: the target is suppressed throughout, its owner gets an in-game and email alert, and the casting tower's coordinates are revealed to them. If the caster is still owned, active, powered and unsuppressed at the end, the tower and its tile transfer (settled, muster destroyed, owner's cut-off frontier re-checked); otherwise it fails and the target unlocks. Aegis Domes block; towers in towns/AFCs are excluded; once per 24h per House (`afcCampaign.hijackReadyAt`). | The resonator overrides an exhausted or jammed tower's control lattice and claims it. |

Hijack state lives only on the target (`observatory.hijack`), so snapshots carry it and
there is no per-hijack timer: the existing 1s Aether Tower tick resolves finished or
broken takeovers by walking the active-tower index. Players involved receive
`AFC_HIJACKS` (full list, replayed to new tabs) and a one-shot `AFC_HIJACK_OUTCOME`.
The client shows a "Hijackable" marker on open enemy towers, a last-shot warning on the
player's own towers, and the takeover beam, progress ring and ending effect in both
renderers through the shared AFC effects layer.

## Chancery — diplomacy and alliances

| Tier / ID | Name | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-chancery-1` | **Envoy Accreditation** | +10% of the House's own Coin income per active truce or mutual alliance (Court armistices included), capped at +50%. Each partner counts once. | Accredited envoys turn standing agreements into trade credit. |
| II `afc-chancery-2` | **Diplomatic Corps** | AI empires judge the House +15 opinion warmer; truces bought from them cost 50% less. | A permanent diplomatic staff. |
| III `afc-chancery-3` | **Allied Levies** | +15% manpower cap and regeneration per mutual ally, counting at most three (+45%). Scales the House's own numbers, never reads an ally's. | Allied Houses send ancillary contingents. |
| IV `afc-chancery-4` | **Court Armistice Mandate** | Impose a binding 12h truce; 48h cooldown. With Envoy Accreditation it pays like any other truce (🔗). | The Court enforces the armistice. |
| V `afc-chancery-5` | **Suzerainty Recognition** | Own territory counts ×2 toward the bloc's Diplomatic Dominance metric; actual territory still decides the largest member and winner. | Court recognition of the guarantor House's claims. |

Truce changes settle both Houses' income at the old rate before the Envoy rate moves.

## Copy and presentation rules

- Keep card effects to one short line; use percentage changes (+100%, −50%) instead of multiplier notation. Put qualifications and lore in the expanded description.
- Show branch + playstyle, tier, effect, affected scope, and explanation separately.
- Label one-time consignments **On installation** and enduring effects **Ongoing**.
- Do not describe ×2.5 as double, −2 FOOD as food independence, or population
  delivery as a growth-rate multiplier. Keep Coin/day and MP/refill units explicit.
- Spell out zero eligible targets before commitment, and distinguish missing
  infrastructure from a locked upgrade tier. Construction-tech-free delivery is
  deliberately distinct from permission to build future copies.
- Slot-stable IDs mean a v3 deploy changes what an existing `afc-v1` pick grants in
  place (notably the Bastion I–III reorder); this was accepted for the v3 rework.
