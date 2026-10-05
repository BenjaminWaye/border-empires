# Construction animation — implementation plan

Status: implemented for economic structures (see "Implementation status");
archive this file once the follow-ups below are either done or dropped. The
canonical rules now live in `docs/game-mechanics.md` §5.

## Goal

Structures take roughly 1 hour to many hours to build (`structureBuildDurationMs`:
manpower cost × 36 s). A smooth "rising" animation would look frozen at that
scale, so construction is shown as **discrete build phases** plus **ambient life**
at the site, tied to the existing lore: every structure is fabricated by the AFC
and assembled on site by ancillaries (bodies run by one AI).

## Design

- **Phases.** A build is split into 4 phases (foundation → frame → cladding →
  fit-out). Progress `p = (now - startedAt) / (completesAt - startedAt)`.
  Phase `k = floor(p * 4)`; the structure's pieces appear bottom-up, one height
  band per phase. A phase changes every 15–90+ minutes, so the world only needs
  to be re-laid-out when a boundary passes, not per frame.
- **Parts stack.** Fabricated materials sit beside the site as crates. Crates
  disappear in `PHASES × CRATES` equal steps (the ancillaries consume them).
- **Scaffolding.** Corner posts + a bar at the current cut height mark the
  finished footprint while the structure is incomplete.
- **Ancillary crew.** Reuses the settle overlay's small dark figures (extracted
  to a shared module). Crew size comes from manpower committed (≈ 1 figure per
  25 manpower, 2–6). All figures at one site share one timing (walk crate →
  structure → pause) so they move in perfect, unsettling sync. If a build is
  past `completesAt` but still `under_construction` (stalled) they freeze with
  heads down.
- **Removal** (`removing`) plays the same phases backwards.
- **AFC supply pods** (phase boundary): when an on-screen site enters a new
  phase, a pod arcs from the owner's nearest AFC to the site and lands next to
  the crates. Cosmetic only — the server does not track which AFC "made" the
  parts.

## Data change

`startedAt` (ms) is stamped next to `completesAt` on `fort`, `observatory`,
`siegeOutpost` and `economicStructure` records at build/removal start, and is
dropped wherever `completesAt` is dropped (completion, capture, cancel). The
client previously guessed total duration from flat per-type constants, which is
wrong for forts/siege camps/tier upgrades/relay-beacon discounts. Records
without `startedAt` (builds in flight when this ships) fall back to the old
estimate. Structures cross the wire as opaque JSON, so no protocol change.

## Renderer parity

| Renderer | Coverage |
|---|---|
| True 3D | Phase gating for shared-builder structures (economic, late-game, civic, infrastructure, industrial, manpower, part-structures); scaffolding, crates, crew, pods. Structures with dedicated 3D branches (Observatory/Aether Tower, forts, siege camps, Umbrite rig/factory, Caravanary, Relay Beacon) keep rendering fully built — listed as follow-up. |
| 2D canvas | Stepped bottom-up fill + dashed outline of the unbuilt part, crew dots at the site edge, same phase maths. Covers every structure drawn through the 2D structure overlay. |

## Work breakdown

1. **Server `startedAt`** — stamp/strip; regression tests.
2. **Client model** (`client-construction-phase`) — pure phase/crate/crew maths +
   next-boundary time; unit tests including the missing-`startedAt` fallback.
3. **Builder phase gating (3D)** — builder learns a per-instance height gate;
   per-kind structure height measured from geometry bounds; scaffolding + crate
   slots; rebuild trigger when a boundary passes.
4. **Ancillary figures** — extract hash/wander/figure assets out of the settle
   overlay (also brings that file back under the 500-line limit); crew layer.
5. **2D** — stepped fill, dashed outline, crew dots.
6. **Supply pods** — phase-transition detection on rebuild, pod FX layer.
7. **Storybook story** — scrub a multi-hour build at speed.
8. **Changelog + docs** — `CLIENT_CHANGELOG_ENTRIES` entry, `game-mechanics.md`.

## Risks

- Phase gating at `addPiece` skips pieces; verified no family uses the returned
  instance index of a gated piece for animation (mintworks wraps `addPiece` but
  ignores the return value).
- `client-map-3d.ts` is far over the 500-line limit: all additions there must be
  paid for by extraction in the same branch.
- Crew update runs every frame: capped to a fixed number of visible sites and
  figures, hidden when zoomed far out.

## Implementation status

Built: `startedAt` on the wire; the phase model
(`client-construction-phase/`); 3D builder gate + measured heights, scaffolding,
crates, crew and pods (`client-map-3d-construction/`, wired in
`client-map-3d-structure-overlay.ts`); the 2D renderer
(`client-construction-2d/`, called through the shared
`client-resource-overlay-2d/` helper); Storybook stories
(`3D Library/ConstructionSite`: Phases, Scrub, Canvas2D, Removal).

Deviations from the plan above:

- **Crates and crew animate per frame** from the construction window instead of
  forcing a terrain rebuild per crate step; only the four phase boundaries
  trigger a rebuild (`constructionBoundaryPassed`).
- **Pods drop from orbit onto the parts stack** (consistent with the existing
  orbital module-delivery effect) rather than arcing from the owner's nearest
  AFC; they fire on build phase changes seen between rebuilds, never on first
  sight or reconnect, and not for removal.
- **No dedicated "finish" beat** and no stall pose beyond the crew freezing and
  stooping; the structure simply switches to its normal active rendering.

Not covered (still render fully built while under construction in 3D; the 2D
renderer draws them as before): Observatory/Aether Tower, forts, siege camps,
Umbrite rig/factory, Caravanary and Relay Beacons, i.e. every structure with a
dedicated 3D branch. Each needs its own gate and a stack/crew placement that
fits its footprint.

Known approximations: gating treats pieces as whole boxes (a tall piece appears
at once when its base reaches the cut); 2D clips the sprite's full bounds
bottom-up rather than the structure's own silhouette; in-flight pods keep their
scene position if a rebuild re-anchors the scene mid-flight (under 1 s).
