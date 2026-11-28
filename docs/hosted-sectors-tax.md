# Tax on hosted sectors — proposal for TIDN AB

Status: active proposal
Owner: Benjamin Waye, for TIDN AB; to be confirmed by TIDN AB's accountant
Last verified: 2026-11-25 (agent review using web search results, not the source pages; see the review notes at the end)
Replaces: none. When confirmed, the settings below are applied in Stripe and the decision is recorded in `docs/gdd.md` §8.

This answers question Q13 of [`hosted-sectors-plan.md`](hosted-sectors-plan.md). It was written by an agent and then
checked by a second agent using web search results about the sources listed
at the end; it could not open the pages themselves. **It is
not tax advice.** Thresholds and rates change; every
figure below must be checked by the accountant before the first sale. Stripe
collects tax but does not file it: registration and filing stay with TIDN AB
(`docs/gdd.md` §8).

**Cosmetics (added 2026-11-28, for the accountant to confirm).** The first
cosmetic, "Claim the title of Count" (USD 4.99, plan §15 step 8e), is assumed
to be an electronically supplied service like a hosted sector: the same
including-tax price, Stripe Tax setting and tax code
(`txcd_10000000` unless the accountant names another), and it counts towards
the same thresholds.

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
   before one is crossed. Countries that need a registration from the first
   sale (the United Kingdom, below) are sold to from launch; the owner
   registers for UK VAT when the first UK consumer buys (owner decision,
   2026-11-27). No country is refused at payment.

## What the rules are

A hosted sector is an electronically supplied service. For sales to
consumers, VAT is owed in the buyer's country, with a simplification for small
sellers.

| Buyer is in | What applies | What TIDN AB does |
|---|---|---|
| Sweden | Swedish VAT, 25 % | Reported on the normal Swedish VAT return |
| Another EU country, while TIDN AB's cross-border consumer sales of such services in the EU, excluding VAT, are at most EUR 10,000 (SEK 99,680) in both the current and the previous calendar year | Swedish VAT, 25 % | Reported on the normal Swedish VAT return |
| Another EU country, once that EUR 10,000 is passed (or earlier, by choice) | The buyer's country's VAT rate, 17–27 % | Register for the One Stop Shop (OSS) with Skatteverket and file one extra return each quarter covering all EU countries |
| Outside the EU | That country's own rules. Many have a threshold below which a foreign seller owes nothing; some have none | Nothing until a registration is needed; see below |

The threshold is counted without VAT, and also counts any distance sales of
goods to other EU countries (TIDN AB sells none). Skatteverket applies it in
kronor (SEK 99,680), so the dollar figures below are only a guide. Under it,
each USD 20 sale carries
Swedish VAT of USD 4, so USD 16 counts. At EUR 0.85–0.95 to the dollar that is
EUR 13.60–15.20 a sale, so EUR 10,000 is roughly 650–750 sectors sold to
consumers in other EU countries in a calendar year. (An earlier version of this
note said about 500, which counted the price with VAT.) The threshold applies
only to a seller established in one EU country; TIDN AB has to confirm it has no
establishment elsewhere. Once it is passed during a year, the buyer's country's
VAT applies from the sale that passes it, and for all of the following
calendar year.

### Countries outside the EU

Stripe Tax tracks sales per country and warns when a registration may be
needed. Three cases to raise with the accountant now, because they can apply
early:

- **United Kingdom.** A business not established in the UK that sells digital
  services to UK consumers must register for UK VAT from its first sale; there
  is no registration threshold for non-established businesses (HMRC, VAT
  Notice 741A). UK VAT is 20 %, USD 3.33 of a USD 20 price.
- **Norway and Switzerland.** Both have thresholds for foreign sellers
  (Norway on sales into Norway, Switzerland on worldwide turnover).
- **United States.** Sales tax is set by each state. Most states require a
  remote seller to register only above a yearly sales threshold in that state
  (commonly USD 100,000; a few also count the number of sales), and states
  differ on whether access to an online game is taxable at all. At USD 20 a
  sale no state threshold is near at launch. Stripe Tax's monitoring shows
  sales per state. Tax-inclusive prices are unusual in the US; the accountant
  should confirm a state that taxes the service accepts them.

For a country where a registration would be needed before it is worth having,
the choices are to register, or not to sell to buyers there. Selling without
the registration is not a choice this plan makes. The decision is the owner's,
with the accountant.

## What it does to the USD 20

| Buyer | VAT in the price | Left before Stripe's fee |
|---|---|---|
| Sweden, or EU under the threshold (25 %) | USD 4.00 | USD 16.00 |
| United Kingdom, once registered (20 %) | USD 3.33 | USD 16.67 |
| EU above the threshold, 19 % country | USD 3.19 | USD 16.81 |
| EU above the threshold, 27 % country | USD 4.25 | USD 15.75 |
| Country where no tax is owed | none | USD 20.00 |

Stripe's payment fee and the Stripe Tax fee come off after that. Stripe Tax on
the no-code (Checkout) plan costs 0.5 % of each transaction in a jurisdiction
where a registration is added, about USD 0.10 a sale. Whether Stripe returns
its payment fee when a sale is refunded was not checked in this review; the
owner should confirm it on Stripe's pricing page, because withdrawals make
partial refunds a normal event. The server
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
| Checkout | Automatic tax on; full billing address required (`billing_address_collection: required`), which Stripe Tax uses to find the buyer's country; no business tax-ID field |
| Countries not sold to | None. **Owner decision, 2026-11-27** (replaces 2026-11-26): the United Kingdom is not blocked. UK VAT is owed from the first sale to a UK consumer, since the UK has no threshold for a non-UK seller; the owner handles the UK VAT registration and returns when the first UK consumer buys. The accountant should confirm how soon after that first sale TIDN AB must register and account for the VAT |
| EU under the threshold | Stripe's EU documentation describes tracking total EU sales against the EUR 10,000 small-seller limit. Before the first live sale, confirm in test mode that a buyer in another EU country is charged Swedish VAT at 25 % with only the Swedish registration added: Stripe Tax calculates tax only where a registration is added |

In the code (plan PR 5): the Checkout Session is created with automatic tax
enabled and the price marked tax-inclusive, and requires the buyer to accept
the Terms of Sale, including the request to start the service at once
([`legal-drafts/README.md`](legal-drafts/README.md)).

## Bookkeeping notes

- Stripe's tax reports give sales and VAT per country for the Swedish return
  and, later, the OSS return.
- Sales are in USD. Swedish VAT is reported in SEK; the accountant sets the
  conversion method for the Swedish return. For an OSS return the method is set
  by EU law, not chosen: amounts in another currency are converted at the
  European Central Bank rate for the last day of the quarter (VAT Directive
  2006/112/EC, Article 369h). The OSS return is made in euro unless Sweden
  requires kronor; the accountant confirms which.
- A refund reverses the VAT on that sale. Stripe records it.
- Purchase records are kept until the end of the seventh year after the end of
  the calendar year in which the financial year ended (Bokföringslagen
  1999:1078, 7 kap. 2 §). Records of OSS sales must be kept 10 years from the
  end of the year of the sale (VAT Directive Article 369k), whether or not TIDN
  AB still uses OSS. UK VAT records, if registered, have their own period. The
  privacy draft states the first two.
- A withdrawal leads to a partial refund (the days used are kept). The VAT on
  the part refunded is reversed; the accountant confirms Stripe records a
  partial refund this way.
- Stripe keeps the evidence of where each buyer is (billing country and
  network address), which the rules require the seller to hold.

## Questions for the accountant

The full list is in [`legal-drafts/README.md`](legal-drafts/README.md#points-the-accountant-should-look-at),
next to the lawyer's list, so both professionals see what the other is asked.
Already answered by the owner on 2026-11-24: TIDN AB is registered for VAT in
Sweden; its VAT number is SE559265324901.

## Review notes (2026-11-25)

Sources checked by search on 2026-11-25. The agent could not open the pages
themselves (the session's network blocks them), only search results, so each
point is for the accountant to confirm.

- Threshold, SEK 99,680, total across EU countries, Swedish VAT below it, OSS
  by choice below it: Skatteverket,
  <https://www.skatteverket.se/skatter/mervardesskattmoms/troskelvarden.4.18e1b10334ebe8bc80005545.html>.
- OSS records kept 10 years: VAT Directive Article 369k,
  <https://www.legislation.gov.uk/eudr/2006/112/article/369k>, and the
  Commission's OSS page,
  <https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/record-keeping-and-audits-oss_en>.
- OSS exchange rate, Article 369h: from the directive text as known to the
  agent; the search did not return it. Confirm.
- No UK threshold for non-established businesses: HMRC VAT Notice 741A,
  <https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a>.
- Stripe Tax 0.5 % per transaction where registered; filing through partners:
  <https://stripe.com/tax/pricing>,
  <https://support.stripe.com/questions/understanding-stripe-tax-pricing>.
- Stripe EU small-seller tracking:
  <https://docs.stripe.com/tax/supported-countries/european-union>.
- Checkout billing countries cannot be limited; Radar rule on billing country:
  <https://docs.stripe.com/payments/collect-addresses>,
  <https://support.stripe.com/questions/block-payments-from-tax-unsupported-countries-using-radar>.
- Bookkeeping retention, seven years:
  <https://data.riksdagen.se/dokument/sfs-1999-1078.html>, BFN guidance
  <https://www4.skatteverket.se/download/18.22f626eb14fb326a4b6da0a/1698823437809/VL00-5-rakenarkiv.pdf>.
