# Tax on hosted sectors — proposal for TIDN AB

Status: active proposal
Owner: Benjamin Waye, for TIDN AB; to be confirmed by TIDN AB's accountant
Last verified: 2026-11-24
Replaces: none. When confirmed, the settings below are applied in Stripe and the decision is recorded in `docs/gdd.md` §8.

This answers question Q13 of [`hosted-sectors-plan.md`](hosted-sectors-plan.md). It was written by an agent from general knowledge
of the rules. **It is not tax advice.** Thresholds and rates change; every
figure below must be checked by the accountant before the first sale. Stripe
collects tax but does not file it: registration and filing stay with TIDN AB
(`docs/gdd.md` §8).

## Recommendation in short

1. **The price is USD 20 including tax.** Every buyer pays the same amount;
   the tax is taken out of it. A buyer never sees a higher total at the last
   step.
2. **Turn Stripe Tax on** so the right rate is worked out per buyer, shown on
   the receipt and reported per country.
3. **Treat every sale as a sale to a consumer.** Do not ask for business VAT
   numbers at launch.
4. **Start with Swedish VAT only**, and add other registrations as the
   thresholds below are reached. Stripe Tax watches the thresholds and warns
   before one is crossed.

## What the rules are

A hosted sector is an electronically supplied service. For sales to
consumers, VAT is owed in the buyer's country, with a simplification for small
sellers.

| Buyer is in | What applies | What TIDN AB does |
|---|---|---|
| Sweden | Swedish VAT, 25 % | Reported on the normal Swedish VAT return |
| Another EU country, while TIDN AB's cross-border consumer sales of such services in the EU are at most EUR 10,000 a year (SEK 99,680) | Swedish VAT, 25 % | Reported on the normal Swedish VAT return |
| Another EU country, once that EUR 10,000 is passed (or earlier, by choice) | The buyer's country's VAT rate, 17–27 % | Register for the One Stop Shop (OSS) with Skatteverket and file one extra return each quarter covering all EU countries |
| Outside the EU | That country's own rules. Many have a threshold below which a foreign seller owes nothing; some have none | Nothing until a registration is needed; see below |

At USD 20 a sale, EUR 10,000 is roughly 500 sectors sold to EU buyers outside
Sweden in one calendar year.

### Countries outside the EU

Stripe Tax tracks sales per country and warns when a registration may be
needed. Three cases to raise with the accountant now, because they can apply
early:

- **United Kingdom.** A foreign business selling digital services to UK
  consumers is generally required to register for UK VAT from its first sale;
  there is no threshold for sellers established outside the UK.
- **Norway and Switzerland.** Both have thresholds for foreign sellers
  (Norway on sales into Norway, Switzerland on worldwide turnover).
- **United States.** Sales tax is set by each state. Most states require a
  remote seller to register only above a yearly sales threshold in that state,
  and many do not tax this kind of service at all.

For a country where a registration would be needed before it is worth having,
the choices are to register, or not to sell to buyers there. Selling without
the registration is not a choice this plan makes. The decision is the owner's,
with the accountant.

## What it does to the USD 20

| Buyer | VAT in the price | Left before Stripe's fee |
|---|---|---|
| Sweden, or EU under the threshold (25 %) | USD 4.00 | USD 16.00 |
| EU above the threshold, 19 % country | USD 3.19 | USD 16.81 |
| EU above the threshold, 27 % country | USD 4.25 | USD 15.75 |
| Country where no tax is owed | none | USD 20.00 |

Stripe's payment fee and the Stripe Tax fee come off after that. The server
costs about EUR 6 for a month (`hosted-sectors-plan.md` §14).

## Stripe settings

Applied in the Stripe account by the owner, then used by the code in test
mode first.

| Setting | Value |
|---|---|
| Business address (origin) | TIDN AB's registered address in Sweden |
| Tax registrations | Sweden, with TIDN AB's VAT number. Add "EU OSS (Union scheme)" when the accountant says so |
| Default tax behaviour | Inclusive |
| Product tax category | An electronically supplied service category; the accountant confirms which. Stripe's general one is "General - Electronically Supplied Services" |
| Checkout | Automatic tax on; billing country collected; no business tax-ID field |

In the code (plan PR 5): the Checkout Session is created with automatic tax
enabled and the price marked tax-inclusive, and requires the buyer to accept
the Terms of Sale, including the request to start the service at once
([`legal-drafts/README.md`](legal-drafts/README.md)).

## Bookkeeping notes

- Stripe's tax reports give sales and VAT per country for the Swedish return
  and, later, the OSS return.
- Sales are in USD. Swedish VAT is reported in SEK, and an OSS return in EUR
  or SEK as Skatteverket requires; the accountant sets the conversion method.
- A refund reverses the VAT on that sale. Stripe records it.
- Purchase records are kept 7 years, as the privacy draft states.
- Stripe keeps the evidence of where each buyer is (billing country and
  network address), which the rules require the seller to hold.

## Questions for the accountant

1. Answered by the owner on 2026-11-24: TIDN AB is registered for VAT in
   Sweden; its VAT number is SE559265324901.
2. Does the product fall under electronically supplied services, and which
   Stripe tax category should it use?
3. Start under the EUR 10,000 simplification, or register for OSS from the
   first day? (Opting in early is allowed and is binding for a period.)
4. What should happen for UK buyers, and for any other country where a
   registration is needed from the first sale?
5. Is treating every buyer as a consumer acceptable, with no VAT-number field?
6. Which exchange rate method should be used for USD sales?
7. Are Stripe's reports enough for the Swedish return, or is an export into
   the accounting system needed?
