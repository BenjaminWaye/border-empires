# AFC Specializations — upgrade catalogue and explanations

Status: active proposal; proposed names and initial balance
Owner: Benjamin Waye (product decisions); implementing agent (delivery)
Last verified: 2026-10-17
Replaces: the player-facing domain catalogue when the [implementation plan](afc-specializations-plan.md) ships

Thirty entries, six branches, five tier choices. IDs below are proposed stable
new-ruleset IDs; previous titles identify conversation continuity, not migration
aliases. Unless marked **working default**, the effect follows the conversation.
All choices are free; active recruitment still spends Coin. Mechanical copy and
the explanation must be separate catalogue fields, both shown in the UI.

## Vanguard — conquest through assault coordination

The AFC's assault command systems combine formation telemetry, breach planning,
and occupation broadcasts. Their benefits follow actual attacks and particular
formations; they do not confer an unexplained permanent martial temperament.

| Tier / ID | New name (previous name) | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-vanguard-1` | **Pacification Routines** (Raider's Instinct) | ×2 attack against Planetary Defense/barbarian holdings. | Command software loads specialized assault patterns for the planet's residual defense positions. |
| II `afc-vanguard-2` | **Assault Command Lattice** (Ironclad Command) | +1 muster flag; attack resolution 10 seconds faster. Preserve travel and minimum valid timing. | Additional command channels coordinate another formation while accelerated orders shorten the assault phase. |
| III `afc-vanguard-3` | **Battlefield Momentum** (War Momentum) | Garrisoned victories grant the launching flag +5% attack, max three stacks. Frontier captures refresh its timer. Moving/disbanding clears it. Decay one stack per five idle minutes is a **working default**. | A formation's captured intelligence and coordinated advance produce a temporary local advantage. Frontier gains sustain initiative; defeating a garrison deepens it. |
| IV `afc-vanguard-4` | **Sapper Coordination** (Sapper Corps) | Fort attack commitment requirement ×0.5, with consistent combat baseline and preview. | Breach crews identify access routes and demolition points, reducing the force needed to assault a fortified position. |
| V `afc-vanguard-5` | **Breakthrough Protocol** (Warlord's Gambit) | A primary garrisoned victory captures one random adjacent tile owned by the same defender, including garrisoned tiles. No second combat roll or recursive grant. | Occupation broadcasts and the collapse of local command compel a neighboring position to capitulate. |

Breakthrough preserves ordinary capture consequences, ownership state, fort
destruction/asset capture, alerts, and encirclement. Garrisoned towns/resources/
fortified tiles remain eligible: do not quietly reinstate the withdrawn frontier-
only restriction. Skip water, allies/truces, active combat/pending claims, and
otherwise invulnerable/uncapturable targets. If none qualify, award no extra tile.
The bonus tile does not build Momentum, issue another Breakthrough, or mint a
second primary-combat plunder payout. Persist the chosen random result for replay.

## Bastion — a prepared defensive empire

The AFC configures local military production, fortification patterns, reserve
stores, and sacrificial ward equipment. Its defining rewards are passive and
visible in attack previews; they do not depend on an undiscoverable flag mode.

| Tier / ID | New name (previous name) | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-bastion-1` | **Fortification Patterns** (Garrison Basics) | ×2 fort build speed; waive Titanium slot demand for three qualifying forts using the existing waiver semantics. | Standardized prefabricated plans and dedicated starter stores make the first defensive works inexpensive to sustain and quick to assemble. |
| II `afc-bastion-2` | **Armour Production Mandate** (Ironclad Bastions) | Double the defense bonus contributed by Titanium and Umbrite Weapons Factories, including the existing applicable factory-equivalent calculation. | The headquarters optimizes military production for protective equipment and defensive formations. |
| III `afc-bastion-3` | **Citadel Reserves** (replacement for Fortified Resolve) | **Working default:** +25% defense on owned garrisoned towns with active forts. No adjacent halo, factory prerequisite exemption, or HOLD action requirement. | Fortified towns maintain trained local reserves and protected supply stores that reinforce their garrisons. |
| IV `afc-bastion-4` | **Defensive Depth** (Punishing Ramparts) | Attacks against active owned forts require ×2 MP commitment. Apply it to the odds baseline too; do not separately charge doubled casualties. | Layered obstacles and compartmentalized approaches require a larger assault force to mount a viable attack. |
| V `afc-bastion-5` | **Ablative Ward Network** (Unbroken Line) | First otherwise successful attack on each ready fort is blocked; attacker spends its full commitment. Recharge 24 hours after use. | A sacrificial aether ward absorbs one breach, then the local installation regenerates its reserve. |

Ward readiness is visible; blocked attacks grant no victory-triggered effects.
Record consumption across rebuilding/ownership transfers until recharge expiry.
Display Sapper ×0.5 and Defensive Depth ×2 as cancelling cost modifiers, with
consistent combat odds. Citadel Reserves remains a product/balance review item.

## Dominion — territorial development

Survey equipment expands the area the expedition can administer. Fabrication
and assembly protocols turn new ground into an operating territorial network.

| Tier / ID | New name (previous name) | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-dominion-1` | **Relay Fabrication Line** (Beacon Foundries) | Relay Beacon construction ×3 speed. | The AFC mass-produces standardized relay assemblies for rapid field installation. |
| II `afc-dominion-2` | **Harbor Survey Array** (Harbor Reach) | Dock reach radius 1 → 2. | Hydrographic and coastal survey crews extend the terrain a dock's administration can reliably support. |
| III `afc-dominion-3` | **Provincial Survey Array** (Provincial Reach) | Town reach radius 3 → 4. | Town offices gain survey, dispatch, and communication systems for a wider surrounding jurisdiction. |
| IV `afc-dominion-4` | **Settlement Assembly Line** (Rapid Settlement) | Settlement ×2 speed. | Prepared settlement packages and coordinated crews shorten the work of establishing a garrison. |
| V `afc-dominion-5` | **Universal Fabrication Line** (Universal Construction) | All building construction ×2 speed, including Relay Beacons; with tier I beacons build ×6 faster. | The expedition adopts a common assembly and dispatch system across its construction operations. |

Use build duration, not build cost, for speed effects. Respect active structures,
dormancy, terrain, and resource slots. Apply reach upgrades to existing anchors
through the normal border reconciliation, and show new reach in both renderers.

## Exchequer — a compact Coin powerhouse

The AFC factorate concentrates export privileges, supplies, and investment in
three core towns. Coin buys offworld claims and consignments; no food or population
appears merely because a building is called efficient. A supply concession reduces
waste; a one-time population grant is an actual resettlement delivery.

| Tier / ID | New name (previous name) | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-exchequer-1` | **Founding Concession** (Founding Charter) | First three towns ×1.5 Coin; each uses two fewer FOOD slots. Support buildings retain full FOOD requirements. | Favorable starter export contracts and coordinated provisioning make the core more profitable and reduce food losses. |
| II `afc-exchequer-2` | **Scarcity Consignment** (Scarcity Doctrine) | One-time free, instant delivery of boosters to every eligible owned, garrisoned deposit of the selected scarcest resource. **Working default:** no construction tech required. | The factor buys finished extraction equipment offworld, even when the local AFC lacks the capability to manufacture more. |
| III `afc-exchequer-3` | **Clearing Privilege** (Clearing House Charter) | Double the Clearing House uplift: +10% ordinary Manufactory contribution plus +50 percentage points with Clearing House = +60% per Manufactory. | Preferential clearing terms increase the extra export credit earned by an established Clearing House network. |
| IV `afc-exchequer-4` | **Orbital Recruitment Contract** (Quartermaster's Ledger) | Buy 5 MP for 1 Coin with no purchase quota. **Working default:** +50% pool-to-flag transfer throughput. Normal paid-overflow reserve semantics. | The factor orders ancillary contingents from offworld suppliers; improved dispatch puts purchased and existing reserves into formations faster. |
| V `afc-exchequer-5` | **Metropolitan Concession** (replacement for Population Surge) | **Working default:** first three towns ×2 Coin; one-time +50% current population in those core towns below Metropolis, clamped to caps. No empire-wide MP bonus. | The Court recognizes preferred export centers, and the factor arranges a resettlement consignment for their continuing development. |

The first-three-town set excludes the starting AFC/SETTLEMENT and is shared by
all relevant calculations and UI. Preserve it deterministically through saves.
The proposed tier-V ×2 multiplies tier I's ×1.5 for a combined ×3 on qualifying
production; do not double flat income components accidentally excluded by the
existing town-output modifier. Show exactly which components receive the benefit.

Scarcity considers FOOD, TITANIUM, CRYSTAL, UMBRITE, using counts of known owned
garrisoned deposits, not spare slots (spending slots must not manipulate the pick).
Choose among resources with at least one legal unboosted tile: FARM → Hydrogarden,
TITANIUM/GEMS → Mine, UMBRITE → Umbrite Rig. FISH is part of FOOD deposit supply
but cannot host a Hydrogarden; disclose this in preview. No unknown resource is
revealed, no existing economic structure is overwritten, and no building tech is
permanently unlocked. Propose a deterministic FOOD/TITANIUM/CRYSTAL/UMBRITE tie
order and recompute eligibility at commit. Existing FOOD/other slot requirements
still apply, with normal dormancy if the completed grant exceeds supply.

Recruitment grants no free manpower regeneration and never resets a refill bank.
Population consignments do not auto-upgrade towns, waive FOOD, or bypass upgrade
Coin costs. At max population, the preview shows zero population gain honestly.

## Oracle — information and aether operations

Hardware and specialist signal processing give actionable information and improve
the control of existing towers. Detection, casting range, and ordinary vision
are separate capabilities; a flag signal does not reveal an entire hidden army.

| Tier / ID | New name (previous name) | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-oracle-1` | **Starter Resonance Cell** (Watcher's Eye) | First qualifying Aether Tower requires no CRYSTAL slot, with a stable single waiver. | A dedicated starter power cell supplies that installation's normal slot requirement. |
| II `afc-oracle-2` | **Resonance Governor** (Resonance Tuning) | Tower ability cooldown multiplier ×0.5 through existing cooldown policy. | Automated phase balancing shortens recovery between operations. |
| III `afc-oracle-3` | **Long-Range Resonator** (Crystal Network) | Tower casting range +15 tiles. | A tuned resonator maintains a usable control signal over longer distances. |
| IV `afc-oracle-4` | **Counterphase Emitter** (replacement for Piercing Sight) | Suppress one hostile tower's shielding and casting for five minutes; consume the caster's ordinary shared cooldown, with normal modifiers. | The tower transmits interference matched to the hostile resonator, disrupting its ability to maintain a shield or cast. |
| V `afc-oracle-5` | **Command-Signal Intercept** (Ambush Doctrine) | Continuously detect exact hostile flag locations and owners inside active tower detection range, through fog; allow normal Purge targeting. Hide MP and orders. | Signal processors locate formation command traffic without decoding its full contents. |

No fixed ten-minute suppression cooldown is introduced. Choose the existing tower
ability policy/base during implementation, and use its standard calculator; do
not silently bypass Resonance Governor. Suppression bypasses the target tower's
own shield for that cast, while Aegis Dome protection remains effective. The
target's normal cooldown continues and does not reset; suppression is not a
free instant recharge. Siphon/dormancy interactions need lifecycle tests.

Proposed detection radius is the effective tower casting range, including tier III.
Show detection reach separately from ordinary vision. Detected coordinates grant
only the necessary interaction authorization, never hidden town/resource/MP data.

## Chancery — diplomacy and alliances

The AFC's accredited chancery administers a named Sector campaign. Its secure
records and liaison personnel implement agreements; the Court supplies their
authority. The Court awards a single House the world, so coalition cooperation
and competition for leadership remain part of the same political contest.

| Tier / ID | New name (previous name) | Mechanical promise | Explanation |
| --- | --- | --- | --- |
| I `afc-chancery-1` | **Envoy Accreditation** (Envoy's Charter) | Coin income, MP refill accrual, and MP cap scale with mutual allies, without an ally-count cap. Coefficients are **working defaults** in the main plan. | Coalition members contribute credit, ancillary contingents, and reserve facilities to an accredited liaison headquarters. |
| II `afc-chancery-2` | **Reciprocal Trade Pact** (Trade Pact; replaces Coalition Ledger) | Allied physical dock links count for dock/Harbor Exchange income; the Pact owner's allied-link contribution is ×2. Reciprocal access; each edge once. | A registered joint freight undertaking receives preferential clearing rates, insurance, and export contracts. |
| III `afc-chancery-3` | **Coalition Command Accord** (Coalition Warfare) | **Working default:** +15% attack when a current ally and the attacker each had a hostile capture against the defender within 24 hours. One bonus, not one per ally. | Liaison officers share current battlefield information and coordinate offensives against a common opponent. |
| IV `afc-chancery-4` | **Court Armistice Mandate** (Force Truce) | Impose a bilateral twelve-hour truce without consent; 48-hour caster cooldown. | The chancery invokes a campaign arbitration mandate; the Court orders both Houses to observe a binding armistice. |
| V `afc-chancery-5` | **Suzerainty Recognition** (Undisputed Hegemony) | **Working default:** own territory contributes ×2 to the bloc's diplomatic victory metric; actual territory determines its largest member and sole winner. | Court assessors give greater recognition to the accredited House's claims as guarantor of the coalition settlement. |

War is an unordered player-pair state refreshed by hostile capture in either
direction. Apply that same bilateral definition when checking common enemies;
the "against" wording above does not require both allies to have been attackers.
Trade Pact uses actual physical dock links, not every allied dock anywhere on the
map or transitive social allies. A non-Pact partner receives ordinary allied-link
contributions when the owner enables the pact; two Pact owners each receive ×2,
never ×4. No Coin is deducted from the ally. Breaking alliance removes eligibility.

The truce is enforced through the authoritative social system. Its Court origin
explains forced consent and non-breakability during the twelve hours; ordinary
voluntary truces keep their existing break rules. Court accreditation is scoped
to this Sector and its participants, not a permanent House-wide truce entitlement.

## Copy and presentation rules

- Show branch + playstyle, tier, effect, affected scope, and explanation separately.
- Label one-time consignments **On installation** and enduring effects **Ongoing**.
- Do not describe ×2.5 as double, −2 FOOD as food independence, or population
  delivery as a growth-rate multiplier. Keep Coin/day and MP/refill units explicit.
- Spell out zero eligible targets before commitment, and distinguish missing
  infrastructure from a locked upgrade tier. Construction-tech-free delivery is
  deliberately distinct from permission to build future copies.
- New names are display proposals. The old ruleset's IDs, effects, and selected
  choices remain untouched until a new-season introduction.
