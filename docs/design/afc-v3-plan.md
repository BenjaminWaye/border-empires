# AFC v3 — rework plan

Status: in progress (branch `claude/epic-thompson-xo1uas`)
Owner: Benjamin Waye (product decisions); implementing agent (delivery)
Source: design workshop, 2026-11-02

This plan records the agreed v3 grid and how it is delivered. The catalogue
([`../afc-specializations-catalog.md`](../afc-specializations-catalog.md)) is the
reference for shipped behaviour; this file tracks the rollout.

## Decisions taken while planning

- **Slot-stable IDs.** IDs keep their tier slot (`afc-bastion-1` is always the
  Bastion tier-1 pick). The Bastion reorder therefore changes what an existing
  `afc-bastion-1..3` owner holds; no tier is left empty or double-filled.
- **No pick requires another pick.** Cross-branch picks are allowed, so links
  between upgrades only ever add a bonus. The picker shows each link.
- **Envoy counts every active truce and alliance** (cap +50%). There is no
  "met players" or cheap border-contact signal in the simulation; the cap
  bounds truce farming instead of a neighbour test.
- **Colonial Charter** builds the Incubation Engine at no Coin, manpower or
  tech cost on an open town-support tile. It still uses its FOOD slot, so a
  starving empire sees it dormant like any other consumer.

## Agreed grid

| Tier | Vanguard | Bastion | Dominion | Exchequer | Oracle | Chancery |
|---|---|---|---|---|---|---|
| 1 | Pacification Routines: ×2 vs Planetary Defense, +25 Coin per PD tile captured | Citadel Reserves: town growth ignores nearby war; +25% defense on garrisoned towns with an active Palisade/Fort | Relay Fabrication Line: Relays ⅓ MP, instant, first 10 need no FOOD slot | Founding Concession | Starter Resonance Cell | Envoy Accreditation: +10% Coin per active truce/alliance (max +50%) |
| 2 | Assault Command Lattice: +1 muster flag, fights 15s → 10s | Fortification Patterns: Forts without Titanium Forge Module; first 3 Forts free (0 MP, no TITANIUM slot); later Forts −50% MP | Colonial Charter: free Incubation Engine in every garrisoned town | Scarcity Consignment | Resonance Governor (6 shots) | Diplomatic Corps: AI opinion +15, truce prices −50% |
| 3 | Battlefield Momentum: +10% per stack, 5 stacks | Armour Production Mandate | Provincial Survey Array (reach 3 → 4) | Clearing Privilege | Long-Range Resonator | Allied Levies: +15% MP cap and regen per ally (max 3) |
| 4 | Sapper Coordination | Defensive Depth | Expansion Doctrine: expand price counts half your frontier; garrison −50% MP | Orbital Recruitment (uncapped) | Counterphase Emitter | Court Armistice Mandate |
| 5 | Breakthrough Protocol: 1 extra tile, 2 at max Momentum; animated | Ablative Ward Network | Universal Fabrication Line: −50% MP and instant builds | Metropolitan Concession: +100% core Coin; Economic Hegemony lead 20% | Resonance Hijack | Suzerainty Recognition |

### Resonance Hijack

Target an enemy Aether Tower that has no shot left or is suppressed by
Counterphase. Casting spends one shot and starts a 10-minute takeover: the
target cannot cast or shield, the caster tower is revealed to the victim
through fog, and the victim gets an in-game and an email alert. When the
timer ends with the caster tower still owned and active, the target tower and
its tile transfer. Capturing, suppressing or unpowering the caster breaks it.
Aegis Domes block the cast. One hijack per player per 24h.

## Delivery phases

1. Catalogue, numbers, copy, lore, changelog.
2. New passive mechanics in simulation, gateway (Diplomatic Corps) and client
   previews.
3. Resonance Hijack: command, takeover state, alerts, email, client markers
   and animation in both renderers.
4. Visuals: Breakthrough capture effect, Counterphase suppression effect
   (both renderers), picker synergy lines.
