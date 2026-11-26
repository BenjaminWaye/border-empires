# Launch Attack — flag placement step (plan)

Status: phase 1 implemented (2026-11-26); phases 2–3 are plan only.

Builds on the muster commit rule and shield flags
(`docs/muster-fronts-proposal.md`) and the effort sheet
(`docs/replenishment-update-plan.md` D6).

## 1. Problem

Every manual attack is muster-funded. When no flag of the player's is near
the target, Launch Attack quietly raises a new HOLD flag on the **firing tile
itself** — the border tile next to the target
(`parkOrReuseMusterFlagForAttack`). That is the most exposed tile the player
owns: an enemy can take it with one attack and destroy the manpower staged
on it. The player is never told a flag is being raised, where, or that it
can be lost, and the effort choice (Normal / Extra / Double) is a separate
sheet that only appears for garrisoned targets.

Owner feedback (2026-11-26): Launch Attack should have a step that places
the muster flag, says it can be captured so it should sit at a safe
distance, and picks the effort level in the same step. **When a flag is
already nearby, no flag is created and the step is not shown.**

## 2. Rule: when the step appears

The placement step opens only when the attack would otherwise raise a brand
new flag. It is skipped (today's behaviour stands) when any of these hold for
the target's firing tile:

- the player already has a flag that the attack would reuse — on the firing
  tile, touching the target, or within the server's remote-funding radius
  (10 tiles, `resolveMusterSource`) of the firing tile
  (`findClosestOwnedMusterTile`);
- a flag the player just asked for (still being placed) is within that
  radius;
- the player is at the flag cap with no nearby flag — the existing
  "Muster flags full … Attack cancelled" feedback still explains that.

## 3. The step (phase 1, implemented)

One sheet, reusing the effort sheet (`client-effort-confirm-sheet.ts`) in
the HUD v2 look (flat ink panel, brass edge, Cinzel labels, gold primary).
Owner direction (2026-11-26): match the rest of the UI, cut almost all text,
make it intuitive.

- **Title:** "Attack (x, y)" ("Attack N tiles" / "Attack region · N tiles").
- **Flag distance** switch, header warning "Can be captured" (tooltip explains):
  - **Safe** (default when available): the owned land tile nearest the
    firing tile that is at least 3 tiles from any hostile tile
    (`FLAG_SAFE_DISTANCE_TILES`), the one straight behind it on a tie;
    "Safest" when no tile is that far.
  - **Close**: nearest tile 2 tiles from hostile ground, when it differs.
  - **Border**: the firing tile (the old automatic spot).
  Each segment shows a risk dot (green / amber / red) and its distance from
  hostile ground ("3+ tiles", "2 tiles", "1 tile"); coordinates and the march
  time to the front (`clientMusterTransitRoute`) are in its tooltip and
  accessible label (owner choice, 2026-11-26: distance over time).
- **Effort** switch: Normal / Extra / Double with each one's manpower. No
  slider on Launch Attack. Targets that gain nothing from extra manpower
  (barbarians, plain frontier) show the Flag distance switch only.
- **One line:** "Win 52% · 60 MP" (bulk: total MP).
- **Cancel / Attack**: Attack records the effort and the chosen spot, then
  queues.

Candidate spots: owned LAND tiles within the remote-funding radius of the
firing tile (so the server can fund the attack from the new flag), not
besieged, not already holding a flag. Hostile = owned by anyone who is not
the player, an ally or a live truce partner (barbarians count) —
`isFriendlyOwner`.

### Plumbing

- `musterFlagPlanByTargetKey` (client state, keyed by target tile, size- and
  TTL-bounded exactly like `attackCommitByTargetKey`, eviction logged) holds
  the chosen spot.
- `parkOrReuseMusterFlagForAttack` consumes the plan when it would raise a
  new flag: the flag is raised on the planned spot instead of the firing
  tile, the parked attack waits on that spot, and further attacks planned on
  the same spot reuse its pending placement instead of raising more flags.
  A nearby flag that appeared in the meantime still wins (rule §2).
- Promotion, cap-fitting, stall timeout and the MUSTER_LIMIT fallback are
  unchanged: they already work for a flag within funding range of the firing
  tile (`isPendingAttackFundedFromOrigin` → `findFundedMusterWithinRange` →
  `armMusterTransit`).
- Bulk and region launches choose one spot, ranked against the tapped (or
  first) target's firing tile. Targets whose firing tile is out of funding
  range of that spot fall back to today's behaviour.

### Renderer parity

Phase 1 adds no map overlay: the spot is chosen in the sheet by coordinates
and distances, so neither the 2D canvas nor the true-3D renderer changes.
Highlighting the candidate spots on the map is phase 2.

## 4. Phase 2 (plan only): pick on the map

- "Pick on map" in the sheet enters a picking mode like March To's origin
  picking (`client-march-origin-picking.ts`): valid spots tinted, tap to
  choose, invalid taps explained in the feed.
- Spot highlight and safe-distance ring in **both** renderers, guarded by
  `isTrue3DRendererActive()`.

## 5. Phase 3 (plan only): fold in March Attack and the arrow gesture

- March Attack from New Flag raises its flag on the shortest-route tile; give
  it the same spot choice.
- The arrow gesture of `docs/muster-fronts-proposal.md` §6 opens this same
  sheet on release, so tapping and dragging share one confirm step.

## 6. Not changed

- Server rules, combat odds, flag cap, funding radius and AI planners.
- Attacks that reuse a nearby flag, and Expand To & Attack / waypoint
  attacks (they keep today's automatic flag).
