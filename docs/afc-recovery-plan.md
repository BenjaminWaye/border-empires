# AFC recovery

Status: implementation contract (2026-11-06).

## Rules

- Human and AI empires holding territory receive no automatic replacement AFC.
  AI recovery selects an owned site and issues the same `BUILD_AFC` handler.
  Site selection inspects at most 256 owned tiles per attempt, resuming through
  a derived cursor if needed; pending deliveries and search cursors have gauges.
- New construction requires an operational owned AFC. Its Coin, manpower capacity
  and manpower regeneration disappear on loss. Surviving reserves, armies, towns
  and independent production remain; the ordinary regeneration floor is separate.
- Every AFC captured or destroyed adds one to a planet-wide campaign loss counter.
  Recaptures count too. First recorded loss quotes 20 Coin, then 30, 40, etc.:
  `20 + 10 × max(0, losses − 1)`. There is no price cap. Existing campaigns begin
  counting at rollout; historical losses are not inferred from current tiles.
- The campaign counter persists through snapshot and event recovery. A new
  campaign starts with zero losses. Additional AFC expansion pricing is unchanged.
- A replacement requires an empty owned LAND centre, outside combat locks and
  capture holds. FRONTIER is allowed and settles on landing. Its 3×3 footprint
  avoids structures, resources and water, and must not overlap another AFC's
  footprint. Mountains may be flattened by the existing landing preparation.
- One delivery per player. Ordering reserves the quoted Coin and locks that
  price. It takes 60 seconds. No building, resources or replacement reserve is
  granted before touchdown; restoring the lost manpower cap does not refill it.
- If the centre is lost or the site becomes obstructed, delivery cancels and
  refunds fully. Securing another AFC also cancels and refunds. Cancellation
  raises no global loss count. A new order starts a fresh 60 seconds.
- Delivery coordinates, arrival time, reserved fee and cancellation state survive
  restart. Due deliveries resolve through the regular ticker after recovery.

## Recovery controls and map

The player receives a popup on losing their last AFC, and again when a landing
is cancelled: “Call down a new AFC to continue construction.” It shows the quote,
affordability and choices to select a landing site, continue fighting, or
**Withdraw and redeploy**. Dismissal leaves a persistent recovery control.
Pending sites show a 3×3 footprint in both 2D and 3D, with a HUD countdown
that updates every second. Captured AFCs must be garrisoned before they support
construction; securing one cancels a pending replacement.

Withdrawal requires explicit confirmation because it releases all territory and
leaves built structures behind, resets treasury and fielded manpower to the
opening package, and lands elsewhere. House knowledge survives. Active combat
and pending garrisons must finish or be cancelled before withdrawal. Fresh joins
and complete elimination retain the existing opening-landing safety paths.

## State and validation

There is one global scalar and at most one delivery per player; no loss log or
timer queue is snapshotted. Validate price sequencing, human/AI parity, duplicate
orders, affordability, site capture, refunds, cancellation after another AFC is
secured, exact arrival time, no extra reserves, construction gating, snapshot
and event recovery, withdrawal, popup dismissal/reopening and renderer parity.

The lore rationale is shared offworld machinery and freight scarcity; canonical
fiction is in [the world bible](lore/galactic-lore.md#replacement-supply-and-withdrawal).
Model redesign and removal of already captured AFCs are outside this change.
