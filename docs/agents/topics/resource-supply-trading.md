# Resource supply trading

Status: implementation and validation in progress. User chose all nine resources,
independent offers also usable alongside treaties, and supply until either party
cancels. The earlier fixed-term/pact-only draft is superseded.

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
