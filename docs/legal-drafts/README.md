# Legal page drafts for selling hosted sectors

Status: active proposal
Owner: Benjamin Waye, for TIDN AB
Last verified: 2026-11-24
Replaces: on publication, `packages/client/public/privacy.html` is replaced and `purchase-terms.html` is added beside it; this folder is then removed.

These are drafts written by an agent from a template and from what the code
does. **They are not legal advice and have not been reviewed by a lawyer.**
They are kept here, outside the deployed client, so nothing goes live before
the owner has filled in the company details and had the texts checked. They
answer question Q12 of [`../hosted-sectors-plan.md`](../hosted-sectors-plan.md). Tax (Q13) is in
[`../hosted-sectors-tax.md`](../hosted-sectors-tax.md).

## What is here

| File | Becomes | What it is |
|---|---|---|
| [`purchase-terms.html`](purchase-terms.html) | `/purchase-terms.html` (new) | Terms of Sale and refund policy for a hosted sector |
| [`privacy.html`](privacy.html) | `/privacy.html` (replaces the current page) | The current policy plus: TIDN AB as controller, legal bases, the named service providers including Stripe, retention periods, GDPR rights, hosted sectors |

Both use the existing `/legal.css`, so they look like the current pages once
they sit in `packages/client/public/`.

## Still to fill in

Every draft marks these as `[[NAME]]`. Publishing is blocked until none is
left. The organisation number, 559265-3249, is already filled in; it was taken
on 2026-11-24 from public company listings (allabolag.se, hitta.se, ratsit.se),
not from Bolagsverket, and the owner should confirm it.

| Marker | What is needed |
|---|---|
| `[[REGISTERED_ADDRESS]]` | TIDN AB's registered postal address. Public company listings give Fållnäsgatan 53, Enskede, without a postcode; the owner confirms the full address |
| `[[VAT_NUMBER]]` | TIDN AB's VAT number. If the company is registered for VAT it is SE559265324901 by the standard format; the owner or accountant confirms that it is registered |
| `[[EFFECTIVE_DATE]]` | The date the pages go live |

The contact address is the one already on the live pages. Say so if purchases
should use a different one.

## Change to the Terms of Service

`packages/client/public/terms.html` needs two small changes when these pages
are published. Proposed wording:

- Section 1, add: "Border Empires is operated by TIDN AB, company registration
  number 559265-3249, `[[REGISTERED_ADDRESS]]`, Sweden."
- New section before "Disclaimers": "**Purchases.** Purchases made on the
  Border Empires website are covered by the
  Terms of Sale (linked to `/purchase-terms.html`), which include your right to withdraw
  and our refund policy. A purchase never buys an advantage inside a Sector
  Contest."

## Points a lawyer should look at

1. **Refunds after a sector has opened, for EU, EEA and UK consumers.** The
   owner's decision (Q1) is "no refund once the sector has opened". A hosted
   sector is most likely a *digital service*, not *digital content*. For a
   service, EU law lets a consumer withdraw within 14 days even after it has
   started, paying only for the part already used; the right is lost only once
   the service has been performed in full. The draft therefore gives these
   consumers a withdrawal right with a deduction of one thirtieth of the price
   per day begun, and keeps "no refund after opening" for everyone else. If a
   lawyer confirms the product counts as digital content, the simpler rule
   (consent at checkout, no withdrawal after the start) can replace section 7.
2. **The per-day deduction.** A hosted sector has no fixed length, so "a
   proportionate part" has no obvious base. One thirtieth per day is a
   proposal.
3. **The checkout tick-box.** The buyer must expressly ask for the service to
   start during the withdrawal period and acknowledge the consequence. The
   Stripe Checkout page must carry that wording and the link to the Terms of
   Sale.
4. **Liability wording** in the existing Terms of Service (sections 9 and 10)
   is broad for a paid consumer service in the EU, where liability for lack of
   conformity cannot be excluded. The Terms of Sale say statutory rights are
   unaffected; the Terms of Service may need the same sentence.
5. **Age.** The pages say the game is not directed at children under 13.
   Buying needs a payment card, but the terms do not state a minimum age for
   purchases.
6. **Transfers outside the EEA.** The privacy draft names the EU–US Data
   Privacy Framework and standard contractual clauses in general terms. Each
   provider's actual basis should be checked against its data processing
   agreement, and those agreements should be signed or accepted.
7. **The list of service providers** was taken from the code: Firebase
   (sign-in and analytics), Hetzner (servers), Stripe (payments, not yet
   integrated), Resend (email) and Slack (operational alerts). If anything
   else receives player data, it must be added.
8. **Split funding** (several people paying for one sector) is not covered. It
   needs its own clauses before it is sold.

## How to publish

1. Fill in the three remaining markers in both files and in the Terms of Service wording
   above.
2. Have the texts reviewed.
3. Move `purchase-terms.html` and `privacy.html` into
   `packages/client/public/`, apply the Terms of Service change, link the
   Terms of Sale from the hosting page and from `support.html`, add a client
   changelog entry, and delete this folder.
