# Legal page drafts for selling hosted sectors

Status: active proposal
Owner: Benjamin Waye, for TIDN AB
Last verified: 2026-11-25
Replaces: on publication, `packages/client/public/privacy.html` is replaced and `purchase-terms.html` is added beside it; this folder is then removed.

These are drafts written by an agent from a template and from what the code
does, then reviewed by a second agent on 2026-11-25 against official and
Stripe sources found by web search. **They are not legal or tax advice, have
not been reviewed by a lawyer or an accountant, and are not ready to
publish.** They are kept here, outside the deployed client, so nothing goes
live before the owner has had them checked. They answer question Q12 of
[`../hosted-sectors-plan.md`](../hosted-sectors-plan.md). Tax (Q13) is in
[`../hosted-sectors-tax.md`](../hosted-sectors-tax.md).

The two lists at the end are written so a Swedish lawyer and the company's
accountant can answer them quickly: each point says what the draft does now,
the rule it rests on, and the question.

## What is here

| File | Becomes | What it is |
|---|---|---|
| [`purchase-terms.html`](purchase-terms.html) | `/purchase-terms.html` (new) | Terms of Sale and refund policy for a hosted sector |
| [`privacy.html`](privacy.html) | `/privacy.html` (replaces the current page) | The current policy plus: TIDN AB as controller, legal bases, the named service providers including Stripe, retention periods, GDPR rights, hosted sectors |

Both use the existing `/legal.css`, so they look like the current pages once
they sit in `packages/client/public/`.

## Still to fill in

Confirmed by the owner on 2026-11-24 and filled in: organisation number
559265-3249, VAT number SE559265324901, the address Fållnäsgatan 53, 122 48
Enskede, and `benjamin@borderempires.com` as the contact address for
purchases.

Publishing is blocked until these markers are filled in.

| Marker | File | What is needed |
|---|---|---|
| `[[EFFECTIVE_DATE]]` | both | The date the pages go live |
| `[[PHONE]]` | `purchase-terms.html` | A telephone number for the seller. EU law lists it among the information a consumer must get before buying (Directive 2011/83/EU Art. 6(1)(c); lag (2005:59) 2 kap. 2 §) |
| `[[BACKBLAZE_REGION]]` | `privacy.html` | Whether the backup bucket is in Backblaze's EU or US region (it decides whether the backups are a transfer outside the EEA) |

## What the code and settings must do before sales open

The Terms of Sale promise these things. None of them exists yet; each belongs
to plan PR 5 (Stripe) unless marked. Sales stay off until all are done.

1. **A withdrawal button.** Since 19 June 2026 a trader selling through a
   website must offer an online withdrawal function: a clearly labelled
   control ("withdraw from contract here" or as unambiguous), then a
   confirmation step, then an acknowledgement of receipt on a durable medium
   (Directive 2011/83/EU Art. 11a, added by Directive (EU) 2023/2673; in
   Sweden prop. 2025/26:84, in force 19 June 2026). The draft places it on the
   sector in **My sectors**. Without it, Konsumentverket says the withdrawal
   period can be extended.
2. **Two separate tick-boxes on the order form**, not one. The form in
   `packages/client/src/client-hosted-sectors/client-hosted-sector-order.ts`
   today has one box that combines accepting the terms with the request to
   start at once, and it does not mention losing the right once the contest
   has ended. Proposed wording:
   - "I accept the Terms of Sale." (link)
   - "I ask for my sector to start now, during the 14-day withdrawal period. I
     understand that if I withdraw I pay for the days it has been open, and
     that I lose the right to withdraw once its Sector Contest has ended."

   Both unticked by default. The right is lost on full performance only with
   this prior express consent and acknowledgement (Art. 16(a) as amended by
   Directive (EU) 2019/2161), and the proportionate payment is owed only after
   an express request (Art. 14(3); lag (2005:59) 2 kap. 15 §).
3. **Proof of what was agreed.** The order record (`hosted_sectors` in
   `apps/sector-control`) has no field for the consent. Store the time, the
   Terms of Sale version and the wording shown, because the seller must prove
   the consumer was informed and asked to start; ARN has ordered full refunds
   where a seller could not.
4. **Information directly before paying.** Next to the pay button: the total
   price with tax, that it is a single payment, and how long the sector runs
   (no fixed end; open 3 days after the contest; closed after 7 days with no
   human visit) (Art. 8(2)).
5. **A confirmation email** after payment containing the Terms of Sale (or a
   copy as a file), the order, and the request and acknowledgement given at
   checkout (Art. 8(7)). Stripe's receipt does not contain these.
6. **Withdrawal handling:** compute the deduction from `opened_at` to the
   moment the notice arrives, issue a partial refund within 14 days, close
   the sector after saving results, and send an acknowledgement.
7. **Analytics consent** (separate from PR 5, needed before the privacy page
   is published). The web client starts Google Analytics for Firebase at load
   (`packages/client/src/client-app-runtime-env/client-app-runtime-env.ts`)
   with no consent prompt. Swedish law requires consent for non-essential
   storage on the user's device, and PTS treats analytics as non-essential
   (lag (2022:482) om elektronisk kommunikation 9 kap. 28 §). The privacy
   draft now says analytics run only with consent, so either a consent prompt
   is built or analytics are turned off before it is published.
8. **Hetzner locations** (PR 4). The plan lets server creation fall back to a
   second location. The privacy draft says sector servers are in the EU, so
   the fallback must be another EU location.
9. **Countries not sold to.** A Stripe Radar rule on the billing country, as in
   [`../hosted-sectors-tax.md`](../hosted-sectors-tax.md) ("Stripe settings").

## Change to the Terms of Service

`packages/client/public/terms.html` needs these changes when these pages are
published. Proposed wording:

- Section 1, add: "Border Empires is operated by TIDN AB, company registration
  number 559265-3249, Fållnäsgatan 53, 122 48 Enskede, Sweden."
- New section before "Disclaimers": "**Purchases.** Purchases made on the
  Border Empires website are covered by the Terms of Sale (linked to
  `/purchase-terms.html`), which include your right to withdraw and our refund
  policy. A purchase never buys an advantage inside a Sector Contest."
- Section 8 ("In-game progress and virtual content"), add: "This does not
  apply to what you have bought. The Terms of Sale say what you get and for
  how long." Without it, section 8 contradicts a paid hosted sector and, later,
  cosmetics "kept permanently".
- Sections 9 and 10, add: "Nothing in these terms limits your rights as a
  consumer under the law of the country where you live."
- Section 11: "continued use means you accept" cannot bind a consumer to new
  terms for something already paid. Add: "Changes do not affect a purchase
  already made."

## Cosmetics

`docs/gdd.md` §8 lists cosmetics (one-time purchases kept permanently) as a
launch product. The Terms of Sale cover hosted sectors only and say so
(section 2). Before cosmetics go on sale, a section is needed. Points for it:

- A cosmetic is most likely *digital content*, not a service. The right to
  withdraw ends when delivery starts only if the buyer gave prior express
  consent, acknowledged losing the right, and got the confirmation on a
  durable medium (Art. 16(m) and Art. 8(7)). Without all three, the buyer can
  withdraw within 14 days and owes nothing (Art. 14(4)(b)).
- "Kept permanently" should be defined, for example "for as long as Border
  Empires is operated". A promise of "permanent" that ends when the game shuts
  down may be misleading.
- Say what happens to bought cosmetics if an account is suspended or deleted.
- They give no advantage in play (`docs/gdd.md` §8 hard rule).

## Points a lawyer should look at

1. **Digital service, and the deduction.** The draft treats a hosted sector as
   a digital service (it lets players create and share data online;
   the definition in lag (2005:59); Directive (EU) 2019/770 recital 19 names games
   offered in the cloud). EU/EEA/UK consumers may therefore withdraw within
   14 days and pay for the part used (Art. 14(3); lag (2005:59) 2 kap. 15 §;
   UK Consumer Contracts Regulations 2013 reg. 36). The draft deducts one
   thirtieth of the price per day or part of a day from when the sector
   opened. The Court of Justice held that the proportionate amount is in
   principle the contract price pro rata to the service actually supplied
   over the contract's whole term (C-641/19, *PE Digital*). A hosted sector
   has no fixed term. **Question:** is a 30-day base defensible, or should the
   base be the expected length of a contest once measured, or something else?
2. **Checkout wording** (item 2 of the list above). **Question:** is the
   proposed two-box wording enough for Sweden, the other EU countries and the
   UK, and does it need to be repeated on Stripe's page?
3. **Withdrawal function** (item 1 above). **Question:** does a button on the
   sector in My sectors, reached after sign-in, meet the Swedish rule, and
   what must the acknowledgement contain? Note: a Commission proposal of
   November 2026 would move this function into a Digital Fairness Act; that is
   not law and changes nothing now.
4. **One text for the UK.** The UK rules (reg. 36 and the Schedule 3 form) are
   close to the EU's. **Question:** is one section 7 acceptable for UK
   consumers, or does the UK need its own wording?
5. **Telephone number.** **Question:** is a telephone number required, or
   does an email address plus the withdrawal button suffice?
6. **ARN.** Section 10 names ARN. ARN hears claims only above a value limit
   (500 kronor for most categories in 2023, with increases proposed in
   2024–2025), above a USD 20 purchase. **Question:** what must the terms say
   about ADR when ARN may not hear the claim, and should ARN be named? The EU
   ODR platform link is no longer required (Regulation (EU) 2024/3228, from
   20 July 2025), so the draft has none.
7. **Closing a sector.** On a withdrawal or refund the sector closes for all
   its members (owner decision Q2), and a sector may be closed for its host's
   serious breach, with no refund stated. **Question:** are both fair to the
   host and to members who did not pay?
8. **Minors.** The game is not directed at children under 13. A Swedish minor
   can generally only bind themself with money they control. **Question:**
   should the terms require a buyer to be 18 or have a guardian's permission,
   and does that change anything for refunds of a child's purchase?
9. **Terms of Service** (list above). **Question:** is the proposed wording
   enough, given that conformity rules for digital services cannot be
   excluded (konsumentköplagen (2022:260) ch. 9)?
10. **Cosmetics** (section above). **Question:** review the points before
    cosmetics are sold.
11. **Analytics, fonts and transfers.** Google Analytics for Firebase runs
    without consent today (item 7 above). IMY ordered several Swedish
    companies to stop using Google Analytics in 2023 over US transfers; the
    EU–US Data Privacy Framework has applied since. The client also loads
    Google Fonts from Google's servers, which sends each visitor's network
    address to Google. **Question:** is consent plus the Data Privacy
    Framework enough for analytics, and should fonts be served from our own
    server instead?
12. **Service providers.** The privacy draft names Firebase, Hetzner, Stripe,
    Resend, Slack, Backblaze, GitHub and Google Fonts, all found in the code.
    **Question:** for each, is it a processor or an independent controller, and
    is its data processing agreement accepted? Stripe is partly an
    independent controller.
13. **Retention after a sector ends.** Final results and member lists are kept
    for the profile until a member deletes their account; purchase records are
    kept 7 years under the Bookkeeping Act, or 10 years for OSS sales.
    **Question:** is legitimate interest the right basis for keeping withdrawal
    and dispute records, and for how long?
14. **Accessibility.** The European Accessibility Act covers e-commerce
    services from 28 June 2025, with an exemption for microenterprises.
    **Question:** confirm TIDN AB is exempt.
15. **Split funding** (several people paying for one sector) is not covered. It
    needs its own clauses before it is sold.

## Points the accountant should look at

Each refers to [`../hosted-sectors-tax.md`](../hosted-sectors-tax.md).

1. **Classification.** Is a hosted sector an electronically supplied service,
   and which Stripe tax category should it use?
2. **The EUR 10,000 threshold.** The note now counts it without VAT, across
   the current and previous calendar year, for a seller established only in
   Sweden: about 650–750 sectors a year. Confirm, and confirm TIDN AB has no
   establishment in another EU country.
3. **OSS from the start or later?** Registering for OSS below the threshold is
   allowed and binds for at least two calendar years (VAT Directive
   Art. 59c(3)). Which is better here?
4. **Stripe under the threshold.** Stripe Tax calculates tax only where a
   registration is added. Confirm the Stripe setting that charges Swedish VAT
   to consumers in other EU countries, and test it before the first sale.
5. **United Kingdom.** No threshold for a non-UK seller. Register for UK VAT
   before launch, or refuse UK buyers? Is a Radar rule on the declared billing
   country enough to refuse them?
6. **Norway, Switzerland, United States.** Confirm the thresholds in the note,
   whether a US state that taxes the service accepts a tax-inclusive price, and
   who watches Stripe's threshold alerts.
7. **All buyers treated as consumers**, with no VAT-number field. Acceptable?
8. **Evidence of the buyer's location.** Stripe keeps the billing address and
   network address. Is that enough evidence, and how is it kept?
9. **Receipts.** Is Stripe's receipt a sufficient invoice or simplified invoice
   under Swedish rules for these sales, including OSS sales?
10. **Currency.** Which exchange rate for USD sales on the Swedish return? For
    OSS, EU law sets the ECB rate on the last day of the quarter
    (Art. 369h); is the OSS return in euro or kronor?
11. **Withdrawals.** A withdrawal is a partial refund. Does Stripe's record
    reverse the right amount of VAT, and is a credit note needed?
12. **Retention and where records are kept.** Bookkeeping records 7 years;
    OSS records 10 years. The Bookkeeping Act generally wants records kept in
    Sweden. Is a regular export from Stripe into the accounting system needed?
13. **Revenue timing.** A sector has no fixed end and can be withdrawn from for
    14 days with a partial refund. When is the revenue recognised?
14. **Stripe fees on refunds.** Does Stripe keep its fee when a sale is
    refunded? It affects what a withdrawal costs.

## Questions for the owner

Each has a recommendation. They are also in the pull request that added this
section.

1. **Telephone number** for the pages (`[[PHONE]]`). Recommended: give one,
   unless the lawyer says it is not needed.
2. **The deduction base** (one thirtieth a day). Recommended: keep it until
   the lawyer answers point 1, then revisit with measured contest lengths.
3. **Closing a sector for everyone when its host withdraws.** Recommended:
   keep, as decided in Q2; the alternative is to let it run to its end at our
   cost.
4. **A minimum age for buying.** Recommended: 18, or a parent's or guardian's
   permission, subject to the lawyer.
5. **Removing a player's account when they withdraw.** Recommended: do not.
   See the pull request for why; the safe alternative is already in the draft.
6. **Analytics.** Recommended: add a consent prompt before the privacy page is
   published; until then turn analytics off for the web client.
7. **Google Fonts.** Recommended: serve the fonts from our own server.
8. **Hetzner fallback location.** Recommended: EU locations only.
9. **Backblaze region** (`[[BACKBLAZE_REGION]]`). Recommended: EU.
10. **United Kingdom at launch.** Recommended: refuse UK buyers until UK VAT
    registration is worth it, as the tax note proposes.
11. **If Border Empires closes while hosted sectors run.** Recommended: promise
    at least 30 days' notice and a refund on the same daily basis for any
    sector less than 30 days old.
12. **Cosmetics: "kept permanently".** Recommended: "for as long as Border
    Empires is operated". The GDD lists cosmetics at launch; confirm whether
    they launch with hosted sectors, so the terms can cover them in time.

## How to publish

1. Fill in the markers in both files.
2. Have the texts reviewed by a lawyer and the tax setup confirmed by the
   accountant.
3. Finish "What the code and settings must do before sales open".
4. Move `purchase-terms.html` and `privacy.html` into
   `packages/client/public/`, apply the Terms of Service change, link the
   Terms of Sale from the hosting page and from `support.html`, add a client
   changelog entry, and delete this folder.
