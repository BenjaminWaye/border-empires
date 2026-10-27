# Resource supply trading

Status: implemented and locally validated on `agent/resource-networks` (2026-10-27).
All nine resources support independent offers and treaty terms; supply continues
until either party cancels. The earlier fixed-term/pact-only draft is superseded.
Production deployment still requires the fresh-production-clone load gate in
`docs/agents/deploys.md`.


## Entry points

- `packages/shared/src/resource-supply-trades/`: bounded agreement schema,
  two-stage allocation, pending offer schema, wire projection and provisional AI values.
- `packages/shared/src/diplomacy-terms/`: resource-bearing terms, descriptions,
  AI valuation and resource counter-offers. Legacy currency-only shapes stay valid.
- `apps/simulation/src/resource-supply-trades/`: bounded active ledger, physical
  and effective supply, spare-output validation, old-rate settlement and cache
  invalidation. Inventory projections share the existing economy cache cell,
  keyed by dormancy identity; authoritative acceptance bypasses that projection.
  Runtime slot access was extracted here from `runtime.ts`.
- `runtime-diplomacy-settlement-command.ts`: preflight before currency transfer,
  agreement creation and trusted rollback by original settlement identity.
- `event-recovery/` and `runtime-snapshot-sections.ts`: persist active agreements,
  replay `PLAYER_MESSAGE/RESOURCE_SUPPLY_CHANGED`; never snapshot receipt logs.
- `runtime-manpower-structure-bonus.ts`, `runtime-town-network.ts`,
  `player-update-economy/`: actual factory/Coin effects use effective supply.
- Runtime exports carry effective supply so cold/reconnect economy matches live
  updates. Own spare inventory and at most 16 agreements reach the client.
- `apps/realtime-gateway/src/resource-trade/`: bounded SQLite/in-memory pending offers, recipient-only acceptance, stable settlement identity/timestamp for uncertain-payment recovery, AI fair-exchange checks, withdrawal and active cancellation.
- `apps/realtime-gateway/src/diplomacy-settlement/`: offer lock, authoritative
  RPC, rollback/late refund cancels the original agreement instead of reversing
  supply. Socket accept requires resource-term confirmation from the new client;
  internal AI acceptance is trusted after the usual recheck.
- `packages/client/src/client-diplomacy-trade/`: real controls, form persistence,
  resource availability, verdicts, active agreement status. Old server snapshots
  without resourceTradeHoldings do not enable resource controls.
- Storybook: `UI/Diplomacy/Resource Supply`, production modal and dispatch output.

## Rules

Physical domestic output backs exports, not imports. Only spare output can be
newly committed. Existing commitments take precedence over later domestic demand.
Upkeep transfers resolve first: imported FOOD may power a domestic extractor.
Network transfers then resolve using that adjusted FOOD dormancy. Both directions
pause on shortage. Recompute after removing one failing agreement per pass to
retain oldest-first priority. At most agreement-count+1 passes, capped at 256.

Accepted supply has no expiry. Either House can cancel, releasing both
directions after old-rate settlement. Coin and Shards settle once; later
shortage/cancellation does not refund them. Supply survives the accompanying
pact ending. Legacy expiries and trusted failed-settlement rollback still
release the original agreement. Pending independent offers expire after 24h;
a settling payment keeps its stable command identity until definitively resolved. Active state is
bounded at 256 globally, 16 per House, 10,000 slots per resource per offer.

## Checks

- Shared resource/diplomacy tests: schema, conservation, shortage, priority,
  non-reexport, AI valuation and counter terms.
- Simulation resource-supply tests: actual production bonus and payment,
  double-commit rejection, source loss, exact expiry, snapshot/replay/reconnect,
  restart after expiry and trusted settlement rollback.
- Gateway settlement tests: consent, locks, refusal, refunds and late payment.
- Client diplomacy tests: actual input-to-wire dispatch, affordability, counters
  and old-server capability handling.

Gameplay numbers: `docs/product/resource-and-manpower-economy.md`.
Lore: `docs/lore/galactic-lore.md` §11.

## Adversarial review follow-up

Internal cancellation shares command-ID identity with settlements. The shared
`command-sequence.ts` policy drives the live replay gate, checkpoint hydration,
in-memory command store and both SQLite schema owners; migration replaces older
partial indexes as well as the original full unique index. Consecutive cancels
must not consume a player's normal sequence, including after restart.

An asynchronous AI decision must recheck that its pending offer still exists
before accepting or declining. A withdrawal while the AI is reading holdings
is final. A settling transition reports whether the durable row still exists.

Siphon changes invalidate connected trade participants, including a trading
caster whose supplier is not trading. The five frontier slots follow the same
exclusive transfer as other resource slots; the source extractor still needs
its owner's Manifest and FOOD. The existing indexed tower list identifies
stolen sources, with no new persistent state or unbounded cache.

The allocator memoizes domestic upkeep capacity during one calculation, and
network capacity while the complete upkeep-flow signature is unchanged.
Capacity maps are transient and bounded by at most two participants per capped
agreement. A regression covering 256 failed network agreements reduces capacity
reads from 131,584 to at most 512 without changing allocation priority.

`resource-trade.integration.test.ts` boots the real gateway and simulation with
two authenticated socket clients. It proves offer acceptance, one-time payment,
production benefit, source inventory release and a second independent trade.

## Validation record — 2026-10-27

Full `pnpm ci:local` passed, including shared/domain/protocol suites, simulation
regressions, performance and slow map checks, gateway tests, client tests and
production build, plus documentation, file-size and changelog gates. Storybook
TypeScript also passed. The client suite passed 5,875 tests; the real socket/RPC
trade regression is part of the gateway suite. Privacy and standard-map deposit
budget assertions were additionally run directly.

After integrating the subsequent client-only coast polish from `develop`, the
full client suite passed again (5,881 tests), as did its production build,
Storybook TypeScript and documentation/file-size/changelog gates. The backend
source is unchanged from the full local CI run.

Code is ready for staging validation. No deployment or live campaign reset was
performed. A fresh production-map load gate remains a release requirement;
local test results do not certify that deployment gate.

### Landing review follow-up

Treaty-attached resource terms now persist their paying/refunding phase before
submission, reuse one command identity through restart, and retain uncertain
payments through offer expiry or withdrawal attempts. SQLite records the treaty
and removes its offer in one transaction; failed recording resumes compensation
instead of paying twice. The existing offer maps carry these phases, with no new
cache or ledger. Schema application adds `settlement_phase` to both treaty-offer
tables. Industrial supply also renders in the desktop HUD v2 Economy path.
Resource panels and previews use one short sentence and compact stat boxes.
Lore reviewed; no canon change in this recovery and presentation follow-up.

Paying/refunding treaty phases are pushed to both clients before command
submission and survive local request expiry, keeping the recipient's retry
control available while the payment outcome is uncertain.

After the Economy source-label integration, cached supply totals and source rows
share the physical builder; trade imports add rights and committed exports
subtract them as signed rows. Owner reconnect projections carry the same rows,
while checkpoints continue to store only authoritative state. Both Economy
layouts show signed commitments. Full local CI before this integration passed
3,673 simulation tests, both slow map suites, 1,527 gateway tests and 5,916 client
tests plus builds; the affected integrations receive additional targeted checks.
