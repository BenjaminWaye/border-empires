# Resource supply trading

Status: implemented in existing truce/alliance negotiations; validation in progress.
Standalone resource-only offers are outside this iteration. Optional questions
about scope had no answer; the implementation uses all nine resources and fixed
12h/24h terms. Do not report independent trading or early cancellation as shipped.

## Entry points

- `packages/shared/src/resource-supply-trades/`: bounded agreement schema,
  two-stage allocation, wire player-state projection and provisional AI values.
- `packages/shared/src/diplomacy-terms/`: resource-bearing terms, descriptions,
  AI valuation and resource counter-offers. Legacy currency-only shapes stay valid.
- `apps/simulation/src/resource-supply-trades/`: bounded active ledger, physical
  and effective supply, spare-output validation, old-rate settlement and cache
  invalidation. Runtime slot access was extracted here from `runtime.ts`.
- `runtime-diplomacy-settlement-command.ts`: preflight before currency transfer,
  agreement creation and trusted rollback by original settlement identity.
- `event-recovery/` and `runtime-snapshot-sections.ts`: persist active agreements,
  replay `PLAYER_MESSAGE/RESOURCE_SUPPLY_CHANGED`; never snapshot receipt logs.
- `runtime-manpower-structure-bonus.ts`, `runtime-town-network.ts`,
  `player-update-economy/`: actual factory/Coin effects use effective supply.
- Runtime exports carry effective supply so cold/reconnect economy matches live
  updates. Own spare inventory and at most 16 agreements reach the client.
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

Terms keep running during suspension. Coin and Shards settle once. A later
shortage does not refund them. Resource terms survive the accompanying pact
ending and cannot be cancelled early through the client. Expiry and trusted
failed-settlement rollback release the original agreement. Active state is
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
