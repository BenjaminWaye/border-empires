# Diplomacy depth

Status: active proposal (nothing here is implemented; no balance values change in this branch)
Owner: game owner decides which options to take forward; the diplomacy agent writes the follow-up plans
Last verified: 2026-11-14
Replaces: none. When an option ships, its rule moves into [`game-mechanics.md` §8](../game-mechanics.md#8-diplomacy) and this file is trimmed.

Everything below is a **proposal**. Numbers are placeholders to show the
shape of a change, not tuned values. The "today" lines describe the code as of
the date above.

## Problem

The 2026-11-12/13 persona playtest (Day 1 findings items 22 and 25; diaries
`pt-diplomat` and `pt-strategist`; the run notes were on the unmerged
`agent/playtest-personas` branch when this was written) found that diplomacy reads as "a price calculator, not
people":

1. **Free truces are always accepted, instantly**, even by Warlike or Annoyed
   AIs with contested borders. The strategist signed 7 of 8; the one decline
   came straight back as a counter-offer.
2. **Envoy Accreditation** (+10% Coin per active truce or alliance, max +50%)
   turns those free signatures into roughly a third of early income (the
   +40-50% bonus on base income; at most 0.5/1.5 of the total): the dominant
   opener.
3. **Re-signing is a daily chore**: every truce lapses within 48h and the
   +50% has to be re-tapped back together.
4. **No reparations or land terms**: after Rowan took 11 tiles and a Dock, the
   diplomat could not ask for anything back ("Rowan won't pay anything to
   extend a truce").
5. **Every AI says the same sentence** ("looking for peace: their armies are
   spent"), whatever its temperament or what it just did.
6. **No way to message a human player**, and **no online / last-seen
   indicator**: three alliance offers went to real players with no way to add
   a word or know whether they would ever be seen.

Fixed separately (bug PRs, not this proposal): Break Truce reachable from the
Diplomacy screen and ally deals no longer offer a truce (#2777), and AI reason
lines name tiles the AI recently took from you (#2778).

## Why it happens (today)

Read before choosing an option; each cause points at the code an option touches.

- **Truce price is hours of the AI's own income**
  (`apps/realtime-gateway/src/ai-diplomacy-stance/ai-diplomacy-pricing.ts`):
  `TRUCE_HOURS.apartAtPeace = 0`, so a truce between empires whose borders
  don't meet is free. Temperament (`trucePrice` 1.25 for Warlike) and attitude
  (`ATTITUDE_PRICE_MULTIPLIER`, 1.5 for Annoyed) are **multipliers**, so they
  scale zero to zero.
- **"Desperate" AIs give truces away**: a `SEEKING_PEACE` stance applies
  `DESPERATE_DISCOUNT = 0` to the base price. The stance is worked out per
  requester: `warExhaustion(ai, requester, bordersTouch)` in
  `ai-war-exhaustion.ts` counts the AI as exhausted at or below 20% of cap
  only when no refill lands within the hour (`REFILL_SOON`), the requester
  isn't also spent or weaker (`RIVAL_ALSO_SPENT`), and the shared border isn't
  the AI's only room to grow (`BOXED_IN`). A starving AI (food deficit) is
  `SEEKING_PEACE` toward everyone, whatever its manpower. Linnea (Warlike,
  contested border) still extended for nothing, so one of these paths fires
  more often than intended; find which before changing the discount.
- **Envoy Accreditation counts any partner**: `afcEnvoyIncomeShare` in
  `apps/simulation/src/afc-specializations/afc-coalition.ts` counts every
  distinct House with an active truce or alliance. (At the playtest it paid 10% each
  capped at 50%; it was then a flat 10%, and since PR #2886 it pays 20% per House, uncapped.)
  Contact, borders and price don't matter.
- **Truces are short by rule**: 12h or 24h, and never more than
  `TRUCE_MAX_LIFETIME_MS` (48h) from when they began, extensions included
  (`packages/shared/src/truce-extension/`). A new truce can be signed straight
  after one ends (no re-truce cooldown).
- **Deal terms are Coin plus resource supply only** (`DiplomacyTerms`,
  `packages/shared/src/diplomacy-terms/diplomacy-terms.ts`). An AI that is
  *losing* pays for peace; an AI that is winning, or that raided you and is
  now spent, never pays (`extensionPricing`: the AI never pays for an
  extension).
- **AI lines** come from a handful of stance strings in
  `ai-diplomacy-stance.ts` plus `warReason` in `ai-diplomacy-evaluation.ts`.
  Temperament (`ai-diplomacy-temperament.ts`) changes prices but not words,
  and is fixed per AI id and diplomacy-only: it does not drive the
  simulation's military planner, so a "Peaceable" AI can raid.
- **Contact with humans**: there is no chat. The gateway sends **email
  alerts** (`apps/realtime-gateway/src/email-alerts/`) for these categories
  (`EmailNotificationCategory` in `player-profile-store.ts`): `allianceRequest`,
  `allianceBreak` (an ally *starts* breaking), `truceOffer`, `attackAlert`,
  `aetherPurgeAlert`, `aetherHijackAlert`, `seasonStart`, `manpowerFull`. Each
  can be switched off in Settings; sends are throttled per recipient (3 a day,
  1 an hour by default; truce offers and hijacks skip the hourly limit). An
  email names the sender and the offer; it carries no message, and the
  in-game offer has nowhere to put one. Pending offers wait up to
  `TRUCE_REQUEST_TTL_MS` (7 days), which is the unexplained "6d 13h" chip the
  diplomat saw.
- **Presence**: nothing on the client wire says whether a player is online or
  when they were last active.

## Options

Each option lists what changes, the code it touches, what players see, and
its downside. They are independent unless noted.

### A. Truces cost something when there is something to give up

- **Change.** (A1) Give `apartAtPeace` a small non-zero base (for example 2h
  of the AI's income) so temperament and attitude multipliers have something
  to scale. (A2) Apply `DESPERATE_DISCOUNT` only toward a rival the AI is
  actually at war with or bordering (`bordersTouch` or `atWarFromMemory`), so a
  spent AI doesn't give free truces to everyone. (A3) Optionally, an Annoyed
  or worse AI with contested borders declines a free truce with a reason
  instead of pricing it.
- **Touches.** `ai-diplomacy-pricing.ts` (`TRUCE_HOURS`, desperate branch),
  `ai-diplomacy-stance.ts`; the shared pricing preview stays in sync because the
  client reads the gateway's numbers. Tests in `ai-diplomacy-pricing.test.ts`.
- **Player effect.** "Warlike · dearer truces" becomes true on screen. Distant
  truces are cheap but not free; neighbours who are angry cost real Coin.
- **Downside.** This is a balance change and must be tuned: the price floor is
  `MIN_INCOME_PER_MINUTE` (10 Coin a day), so A1 at 2h is under 1 Coin early
  and grows with the AI's income, which may make late truces expensive for a
  small empire. A2 makes AIs refuse more peace while spent, which shifts
  fights the AI war-peace work tuned (`docs/ai-war-peace-balance-plan.md`).

### B. Envoy Accreditation rewards agreements that matter

- **Change.** Count only some agreements toward the bonus. Candidates, pick
  one: (B1) only partners whose border meets yours or whom you have met by
  contact; (B2) truces count half, alliances full; (B3) an agreement counts
  only after it has stood for some hours, so a lapse-and-resign loop costs
  income. Keep the +50% cap.
- **Touches.** `afcEnvoyIncomeShare` (`afc-coalition.ts`, which already has
  the partner set) and the perk text in `packages/shared/src/afc-specializations/afc-chancery.ts`;
  the Economy panel row (`AFC_ENVOY_SOURCE_LABEL`) should say how many count.
  B1 needs a border/contact test in the simulation; `bordersTouchInTiles`
  exists only in the gateway today.
- **Player effect.** The Diplomacy perk still pays, but by building a real
  network, not by signing strangers.
- **Downside.** Weakens the only Coin perk in the Diplomacy line; it may need
  a compensating buff to stay a fair pick against the other five Tier I
  choices. B1 adds a rule players must learn ("why doesn't this truce count?").

### C. End the daily re-signing chore

- **Change.** (C1, UI only) A "Renew all" action on the Diplomacy screen that
  sends extension offers to every truce partner whose truce ends within, say,
  6h, showing each AI's verdict first. (C2, rule change) Standing truces:
  a truce runs until either side gives notice, with a notice period like the
  alliance's 24h break notice, replacing the 48h lifetime cap.
- **Touches.** C1: client only (`client-hud-v2-diplomacy.ts`, the trade view's
  verdict code); one request per partner through the existing
  `TRUCE_REQUEST` path and re-offer cooldowns. C2: `SocialActiveTruce` and
  expiry sweep in `apps/realtime-gateway/src/social-state/`, `TRUCE_MAX_LIFETIME_MS`,
  `SYNC_TRUCE` `endsAt` handling, the AI's expiry war-reserve prep
  (`TRUCE_EXPIRY_PREP_MS`), Chronicle diplomacy rows, emails.
- **Player effect.** C1: one tap per day instead of five. C2: no chore at all.
- **Downside.** C1 keeps the habit, just cheaper. C2 removes the moment an AI
  re-prices a truce, so with B unchanged it makes Envoy income permanent and
  free; it should only ship together with A or B. C2 also changes how AIs
  bank manpower before a truce ends.

### D. Reparations and land terms

- **Change.** (D1, smaller) Let a deal **ask** the AI for Coin when the AI took
  your land recently: the AI would pay reparations, scaled by its fading
  `tilesTakenByAi`, before you sign a truce, mirroring the reparations it
  already charges you. (D2, larger) Add tiles to `DiplomacyTerms`: either side
  may cede specific frontier tiles (or a captured structure's tile), moved at
  settlement.
- **Touches.** D1: `ai-diplomacy-pricing.ts` (the "AI never pays" rules for
  extensions and new truces), the trade screen's ask side. D2: the
  `DiplomacyTerms` schema, `SETTLE_DIPLOMACY_TERMS` in the simulation (tile
  ownership goes through `replaceTileState`), the trade screen (a tile
  picker), AI valuation of land.
- **Player effect.** "Give me my Dock back" becomes a real ask; raiding a
  neighbour then suing for peace has a price.
- **Downside.** D2 is a new system: ceded tiles interact with reach,
  encirclement and supply routes, and could be used to pass land between
  friendly accounts; it needs anti-abuse rules. D1 makes a spent raider pay,
  which changes the AI's peace economics and needs tuning with A.
- **Lore hook (proposed fiction, not canon).** The world bible's
  **grievances** (`docs/lore/galactic-lore.md` §8, Grievances and Renown)
  already describe a public claim that a rival has wronged a Duke. A
  reparations demand could be framed as pressing a grievance. Recording it
  as canon needs the owner's decision and a §14 entry.

### E. AI voices that differ and stay truthful

- **Change.** Several phrasings per stance, picked by temperament (a Warlike
  AI asking for peace says so grudgingly; a Merchant talks price), and a line
  that matches what it did to you (the bug PR already adds "took N of your
  tiles recently"). Text only; the decision and numbers stay as they are.
- **Touches.** `ai-diplomacy-stance.ts` reason strings, `warReason`,
  `ai-diplomacy-temperament.ts` (a line set per temperament). Tests pin each
  stance/temperament pair.
- **Player effect.** AIs read as different rulers, and the line never
  contradicts the war tally.
- **Downside.** Content to write and keep truthful whenever pricing rules
  change. Stays cosmetic unless A changes behaviour too.

### F. Saying something to human players

- **Change.** (F1) A short **preset note** on truce and alliance offers
  ("Want to form a bloc?", "Stay off my border and I'll stay off yours",
  "Sorry about the raid"), shown in the offer dock, the Sent list and the
  email. (F2) A short free-text note on offers. (F3) Direct messages.
- **Touches.** F1/F2: an optional `note` field on `TRUCE_REQUEST` /
  `ALLIANCE_REQUEST` in `packages/client-protocol`, the gateway social state
  that stores requests, the offer dock and Sent rows in the client, and the
  email templates (`email-alerts/`). F3 is a new subsystem (storage, delivery,
  unread state).
- **Player effect.** The diplomat's quit trigger ("I can't say a single word")
  is answered without a full chat. Emails would carry the note, so an offline
  player knows why someone wrote.
- **Downside.** F2/F3 put user text in front of other players: they need
  moderation and report tools, and the text is personal data that account
  deletion (`docs/agents/account-deletion.md`) must erase. F1 avoids both but
  limits what can be said.

### G. Online / last-active indicator

- **Change.** Show a coarse activity band for human empires on the Diplomacy
  card and profile: "active today", "this week", "away". No exact times.
- **Touches.** The gateway already knows connected sessions and logins; a
  bounded per-player "last active day" on the profile store, sent with the
  social view the profile and Diplomacy screens read; client cards.
- **Player effect.** Players can tell which humans might answer an offer.
- **Downside.** Presence is attack intelligence: exact "online now" tells a
  rival when you can't defend. Coarse day-level bands and an opt-out reduce
  that. It also needs care so AI empires are not shown as "away" forever.

## Recommendation

Take these first; each is small and testable on its own:

1. **A2 + A1**: no free truce from a spent AI to anyone but its actual enemy, and a small base so temperament and attitude apply.
2. **B3** (agreements count after standing a while), so Envoy rewards keeping pacts, not re-signing them.
3. **C1** "Renew all" now; consider C2 standing truces only after A and B have shipped.
4. **F1 preset notes** on offers and in the emails, plus **G** as day-level bands with an opt-out.
5. **E** varied, truthful AI lines; then **D1** reparations from an AI that raided you, before any D2 land terms.

## Acceptance criteria

- The owner picks which options to take forward; each becomes its own plan or PR.
- A shipped option updates [`game-mechanics.md` §8](../game-mechanics.md#8-diplomacy), adds a client changelog entry, and records any new fiction in the world bible.

## Verification

Each option names its tests above. For balance options (A, B, D1), re-run the
persona playtest's diplomacy probes: does a Warlike, Annoyed neighbour still
sign for free; how much of an Envoy player's income comes from strangers on
day 1 and day 2.
