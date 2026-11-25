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

Confirmed by the owner on 2026-11-24 and filled in: organisation number
559265-3249, VAT number SE559265324901, the address Fållnäsgatan 53, 122 48
Enskede, and `benjamin@borderempires.com` as the contact address for
purchases. The company details were first taken from public company listings
(allabolag.se, hitta.se, ratsit.se).

These markers are left. Publishing is blocked until they are filled in.

| Marker | What is needed |
|---|---|
| `[[EFFECTIVE_DATE]]` | The date the pages go live |
| `[[PHONE_NUMBER]]` | A telephone number for TIDN AB (it need not be answered live); EU law asks for one next to the email address |
| `[[BACKUP_REGION]]` | Where the Backblaze B2 bucket stores data (EU or US) |
| `[[LOG_RETENTION_DAYS]]` | How long diagnostic logs are kept |
| `[[BUG_REPORT_MONTHS]]` | How long bug reports are kept after they are closed |

The Terms of Sale also say TIDN AB takes part in ARN's procedure. That is the
usual choice, but it is the owner's to confirm.

## Review of 2026-11-25

The owner chose an automated legal review instead of a lawyer. It checked
the drafts against EU and Swedish consumer law (the Consumer Rights Directive
as amended, the 2026 withdrawal-button rule, the Digital Content Directive,
unfair terms), GDPR and ePrivacy, and UK law. The wording fixes it proposed are
applied in these files. What remains needs building or deciding, and blocks
publishing:

1. **A "Withdraw from contract here" button** (EU rule in force since 19 June
   2026): on the sector's page for the host, for the 14 days after payment, with
   a confirm step and an email that confirms receipt. Email alone is no longer
   enough.
2. **Only a full refund or a withdrawal closes a sector.** Today any refund
   does (`stripe-webhook.ts`), including a partial refund for a fault, which
   must not end the service.
3. **Emails the terms promise:** an order confirmation right after payment
   carrying these Terms of Sale and the buyer's request to start at once; "your
   sector is ready"; and the warning 2 days before an idle closure.
4. **The checkout tick-box and the Stripe text** must also say the buyer loses
   the right to withdraw once the service has been fully provided.
5. **The order form must show, next to the price:** "Runs until a House wins;
   no time limit. Closed after 7 days with no player visiting (we warn 2 days
   before). Stays open 3 days after the contest ends."
6. **Analytics needs consent.** Google Analytics for Firebase runs on the live
   site today without asking. This is a gap in the live game, not only in
   hosted sectors.
7. **Keeping UK buyers out** until TIDN AB is registered for UK VAT: Stripe
   Checkout cannot limit billing countries directly, so another way is needed.
8. **The consequence of a chargeback** must match between the terms (the
   sector may be closed), the plan (Q2: it keeps running) and the code (an
   alert only).

## Change to the Terms of Service

`packages/client/public/terms.html` needs two small changes when these pages
are published. Proposed wording:

- Section 1, add: "Border Empires is operated by TIDN AB, company registration
  number 559265-3249, Fållnäsgatan 53, 122 48 Enskede, Sweden."
- New section before "Disclaimers": "**Purchases.** Purchases made on the
  Border Empires website are covered by the
  Terms of Sale (linked to `/purchase-terms.html`), which include your right to withdraw
  and our refund policy. A purchase never buys an advantage inside a Sector
  Contest."

## Points a lawyer should look at

1. **Refunds after a sector has opened, for EU, EEA and UK consumers.** The
   owner first decided (Q1) "no refund once the sector has opened", and on
   2026-11-25 approved the withdrawal right described here. A hosted
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
   conformity cannot be excluded. Proposed addition to both sections: "This
   does not limit liability that the law does not allow us to limit, including
   for intent or gross negligence, death or personal injury, or your statutory
   rights as a consumer, including for paid services. Changes to these terms do
   not change a purchase already made." Section 12 should say "a consumer in the
   European Union, the EEA or the United Kingdom".
5. **Age.** The pages say the game is not directed at children under 13.
   Buying needs a payment card, but the terms do not state a minimum age for
   purchases.
6. **Transfers outside the EEA.** The privacy draft names the EU–US Data
   Privacy Framework and standard contractual clauses in general terms. Each
   provider's actual basis should be checked against its data processing
   agreement, and those agreements should be signed or accepted.
7. **The list of service providers** was taken from the code: Firebase
   (sign-in and analytics), Hetzner (servers), Stripe (payments), Resend
   (email), Slack (operational alerts), Backblaze (backups) and GitHub (bug
   reports). If anything else receives player data, it must be added.
8. **Split funding** (several people paying for one sector) is not covered. It
   needs its own clauses before it is sold.

## How to publish

1. Fill in the markers above in both files.
2. Build or decide the eight points under "Review of 2026-11-25".
3. Move `purchase-terms.html` and `privacy.html` into
   `packages/client/public/`, apply the Terms of Service change, link the
   Terms of Sale from the hosting page and from `support.html`, add a client
   changelog entry, and delete this folder.
