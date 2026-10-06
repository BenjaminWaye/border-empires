# AFC module bays: 8-bay cap and Modules tab

Status: implemented (2026-10-06). Supersedes the "no artificial module-capacity
system" rule in `docs/manifest-full-plan.md` §4.

## Rule

- Every AFC has **8 module bays** (`AFC_MODULE_BAY_COUNT`, `@border-empires/shared`),
  matching the 8 sockets of the 3D model (`AFC_SOCKET_COUNT`).
- A bay is used by every docked module (`afc.modules`, House or captured copy)
  and every module in transit to it (`afc.incomingModules`).
- A player may own more modules than one AFC can hold; extra modules live on
  other AFCs. A module on no AFC is **undocked**: researched, but nothing it
  unlocks works until it is called down into a free bay.

## Simulation

1. `callDownAfcModules` sends at most the target's free bays; `REDEPLOY_AFC_MODULE`
   rejects a full target (`BUILD_INVALID`, "All 8 module bays on this AFC are full").
2. Research commissioning docks on the home AFC if it has a free bay, else the
   next-oldest owned AFC with one; otherwise the module stays undocked.
3. Connect-time backfill first sheds House copies beyond 8 on any over-full AFC
   (saves from before the cap), then calls missing modules down into free bays,
   oldest AFC first. Captured copies are never shed.

## Client: Modules tab

- New `modules` tile-menu tab on any visible AFC (read-only on other players' AFCs).
- Top-down diagram: hub, 4 arms, ring of 8 bay buttons. Bay `k` sits at azimuth
  `k * 45°`, the same as 3D socket `k` (`afcBayAngleRadians`, shared with
  `client-map-3d-fabrication-complex.ts`). Bays fill in `modules` order (as the 3D
  overlay docks them), then incoming modules.
- Bay states: empty, docked (coloured by Economy/Manpower/War/Aether), incoming
  (countdown), captured copy, dormant AFC.
- Tapping a filled bay shows its name, family, status and description (what it
  unlocks). Tapping an empty bay shows the Call down list: researched modules not
  at this AFC, where each one is now, and the 1-minute arrival. Calling down is
  disabled when all 8 bays are used.
- Overview shows a one-line bay summary; Call down rows leave the Actions tab.
- The AFC HUD button opens the Modules tab.
- HTML only, so it is identical for the 2D and true-3D renderers.
