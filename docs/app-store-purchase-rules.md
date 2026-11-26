# App store purchase rules for Border Empires (as of 2026-11-25)

Status: exploratory research

Research note. Not legal advice. All sources accessed 2026-11-25.
Method: Apple pages on developer.apple.com were fetched and quoted directly. Google pages
(support.google.com, play.google.com, android-developers.googleblog.com) and news sites could not
be fetched from this session (network allowlist). Google facts below come from search-result
snippets of those pages and from press coverage. Treat every Google number as "verify in Play Console".

## Summary

- **Apple, worldwide:** Guideline 3.1.3(b) lets a multiplatform game unlock items bought on the web
  only if "those items are also available as in-app purchases within the app". Read literally,
  an iOS app that shows web-bought cosmetics or opens paid hosted sectors **must also offer IAP**.
  This is the main conflict with GDD §8 ("the apps show what the account owns").
- **Apple, US storefront:** Buttons, links and calls to action to the web are allowed with no
  entitlement. Apple currently charges **no commission** on linked-out US purchases. That is
  temporary: a district court is setting a rate (Apple proposed up to 15%, 5% for small
  businesses), and the Supreme Court is hearing a narrow contempt question. The IAP requirement
  in 3.1.1 / 3.1.3(b) is not lifted by the US exemption.
- **Apple, EU (new terms from 2026-10-01):** Link-outs allowed; 15% store services commission
  (10% for Small Business Program) on web sales within 7 days of the link tap. The EU page does not
  require IAP alongside a link. Parental-gate rules apply to minors.
- **Apple, Japan / Brazil:** Link-outs allowed; 15% on linked web sales (10% for small business in
  Japan). Japan requires IAP to be shown next to any link. **Korea:** alternative in-app payment
  only (26%), no general link-out.
- **Google, worldwide:** "Consumption-only" apps are allowed: an app may unlock content bought
  elsewhere if nothing can be bought in the app. Steering is restricted except in programs
  (US, EEA, UK, Japan, Korea, others). Since 2026-06-30 (US/EEA/UK) Google charges a service fee
  on purchases made through external links (reported 10% on first USD 1M, 20% standard for
  one-time items). Whether the US fee is actually being collected yet is unclear.
- **Recommendation:** Android can launch as consumption-only (show owned items, no prices, no
  links, no "buy on web" text). iOS cannot cleanly do the same under the current text of 3.1.3(b).
  The owner must choose: add IAP on iOS, or accept App Review risk, or withhold web-bought items
  from the iOS app.

## Apple

### Worldwide baseline (App Review Guidelines, last updated 2026-10-16)

Source [A1]. The 2026-10-16 change to 3.1.1(a) only merged the music-streaming bullet into the
StoreKit External Purchase Link bullet and "clarified that links may be provided to a permitted
destination" [A2]. No change to 3.1.3 in that revision.

- **3.1.1:** "If you want to unlock features or functionality within your app, (by way of example:
  subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full
  version), you must use in-app purchase." Cosmetics and paid server access fall in here.
- **3.1.1(a):** Link entitlements exist only "in specific regions" and storefronts. "In all other
  storefronts, except for the United States storefront ... apps and their metadata may not include
  buttons, external links, or other calls to action that direct customers to purchasing mechanisms
  other than in-app purchase."
- **3.1.3 intro:** Apps using other purchase methods "cannot, within the app, encourage users to
  use a purchasing method other than in-app purchase, except for apps on the United States
  storefront and as set forth in 3.1.1(a) and 3.1.3(a). Developers can send communications outside
  of the app to their user base". So email to players about the web shop is fine everywhere.
- **3.1.3(a) Reader apps:** limited to "magazines, newspapers, books, audio, music, and video".
  A game is not a reader app.
- **3.1.3(b) Multiplatform services:** "Apps that operate across multiple platforms may allow users
  to access content, subscriptions, or features they have acquired in your app on other platforms
  or your web site, including consumable items in multi-platform games, **provided those items are
  also available as in-app purchases within the app**."
- **3.1.3(d) Person-to-person services:** real-time services "between two individuals" (tutoring,
  consultations). "One-to-few and one-to-many real-time services must use in-app purchase." Does
  not fit hosted sectors.
- **3.1.3(f) Free stand-alone apps:** only companions to paid web tools "for VoIP, Cloud Storage,
  Email Services, or Web Hosting", with no purchasing or calls to action. A game server for a
  contest is not "web hosting" in the sense of this rule. I would not rely on it.

Can a game unlock web-bought items? Only under 3.1.3(b), which by its text needs IAP parity.
Can it mention or link to the web store? Not outside the US and the entitlement regions.
Uncertainty: I found no official Apple statement on how strictly parity is enforced for small
games. Many cross-platform games ship IAP for this reason. Reviewer outcomes vary.

### United States

- 2025-04-30: Judge Yvonne Gonzalez Rogers held Apple in civil contempt of the 2021 injunction and
  barred any commission on linked-out purchases. Apple changed the guidelines for the US storefront
  (the US carve-outs quoted above) [A1].
- 2025-12-11: Ninth Circuit (No. 25-2935) affirmed contempt but reversed the total ban on
  commissions. Apple may charge a commission limited to costs "genuinely and reasonably necessary"
  for coordinating external links; remanded to set it [U1][U2].
- 2026-05-06: Supreme Court (Justice Kagan) denied Apple's stay of the mandate [U3].
- 2026-06-30: Supreme Court granted certiorari (No. 25-1311), limited to Question 1, the civil
  contempt standard. Briefing ran Sept to Nov 2026; no decision yet [U4][U5].
- 2026-08-13: Apple's remand proffer proposed 15% standard, 10% for some partner programs and
  renewals, 5% for Small Business Program, on US linked-out purchases [U6]. Epic opposes. A
  stay of the remand was denied by the Supreme Court in August 2026 [U7]. No rate has been approved.
- **Today:** No Apple commission on US link-outs, per press reports [U6]. I could not find an
  Apple developer page stating this directly. Risk: a commission could start once the court
  approves one. I found no indication it would be retroactive, but I could not confirm that.
- The US carve-out covers links and calls to action. It does not delete 3.1.1 or the parity clause
  in 3.1.3(b). So a US iOS app that unlocks web purchases is still expected to offer IAP.

### European Union (DMA)

- 2025-04-23: Commission fined Apple EUR 500M for anti-steering breaches; Apple appealed [E1][E2].
- 2025-06-26: Apple's interim EU terms (2% initial acquisition fee, 5% or 13% store services fee,
  5% Core Technology Commission replacing the per-install Core Technology Fee). These are now
  historical [E3].
- 2026-10-01: Unified EU terms in Attachment 14 of the Developer Program License Agreement
  (DPLA updated 2026-08-18). They "eliminate the Initial Acquisition Fee and Store Services Fee"
  and supersede the StoreKit External Purchase Link Entitlement (EU) Addendum [A3].
  - Out-of-app offers via actionable link: **15%** store services commission; **10%** for Small
    Business Program and similar. "Only sales made within 7 days of the link tap are subject to
    this commission." [A3]
  - IAP 26% (15% small business); in-app alternative processor 20% (10%) [A3].
  - Core Technology Commission 5% applies to apps distributed outside the App Store, not ours [A3].
  - Payment options chosen "must maintain those options for 12 months". The page does not say IAP
    must appear next to a link [A3].
  - Minors: Kids-category apps and users under 13 may not get out-of-app offers; users 13-17 need
    a parental gate [A3].
- August 2026: Commission said it "welcomes" the changes and is not considering periodic
  penalties at this stage [E4]. I could not confirm a final Commission view after launch.
- Netherlands dating-app rules: dating apps only; not relevant.

### South Korea

StoreKit External Purchase Entitlement: a separate KR-only binary may use an approved Korean
payment provider at a **26%** commission. It cannot be combined with IAP in the same app. Leaving
the app to buy on a website is allowed only "when legally required" [A4]. Not useful for us.

### Japan (Mobile Software Competition Act, iOS 26.2, December 2025)

StoreKit External Purchases or Offers Entitlement (region `jp`). Link-out web sales: **15%**
(10% small business), 7-day window. In-app alternative processor: 21%; IAP 21% + 5% processing.
IAP "must be provided as an option on every screen" that merchandises a good and must be "at least
as prominent" as any other option. Under-13: no website offers; 13-17: parental gate [A5][J1].

### Others

- **UK:** CMA designated Apple and Google with strategic market status (Oct 2025). Commitments on
  app review took effect from 2026-04-01. Draft steering conduct requirements were consulted on
  from 2026-06-30. No final steering rule found. Apple still bans steering in the UK [K1][K2].
- **Brazil:** Apple announced (June 2026, CADE agreement) link-outs with a 15% commission on linked
  web sales; Kids apps may not link. From newsroom snippets only; not fetched [B1].
- **India and elsewhere:** nothing found that changes Apple's baseline for this case.

## Google Play

### Worldwide baseline

- Payments policy: digital items sold in a game must use Play Billing, unless a regional program
  applies. Apps may not lead users to other payment methods unless the policy allows it [G1].
- **Consumption-only apps are allowed.** Google's help FAQ: Google allows any app to be
  consumption-only, e.g. a login that unlocks content paid for elsewhere, where nothing can be
  bought in the app [G2]. The FAQ's example of allowed outside-app info ("You can purchase this
  book directly on our website") is from a 2020 FAQ; I could not confirm it is still current, so
  do not rely on in-app mentions without a program [G2][G3].
- No requirement to also offer Play Billing for content bought elsewhere (unlike Apple 3.1.3(b)),
  as far as I could confirm from snippets. Verify on the live policy page.

### Fees (new structure, from 2026-06-30 in US, EEA, UK)

Per Google's blog "Expanded billing choice and lower fees on Google Play" (June 2026) [G4]:
the service fee is the same whether Play Billing, alternative billing or external web links are
used, starting at 10% on the first USD 1M of annual earnings; a 5% billing fee is added only for
Play Billing. Secondary sources report 20% for standard one-time purchases via external link,
15% in quality programs (Level Up) [G5]. Other markets follow on a staggered schedule. Japan's
older external payments program (10%/20%, 24-hour window) must move to billing choice by
2027-03-31 [G6].

### United States

- Epic v. Google: Ninth Circuit affirmed (July 2025); Supreme Court denied a stay 2025-10-06
  (25A354); Google's cert petition (25-521) was dismissed by stipulation on 2026-03-09 [U8].
- The Nov 2025 settlement / proposed modified injunction (fee caps 9% or 20%) was withdrawn
  around 2026-07-14/15; the original 2024 injunction governs [U9].
- External content links and alternative billing programs exist in the US. Google gave notice on
  2026-07-22 that US developers in these programs must report transactions and pay service fees
  from a later start date [G7]. One report says from 2026-10-01; others said no fee was being
  assessed. **Unconfirmed.**

### EEA, UK, Korea, Japan

- EEA: external offers program since 2024 (DMA), now on the June 2026 fee structure [G4][G8].
- UK: from 2026-06-30 developers may "guide users to their websites" [G9].
- Korea: alternative billing programs exist; I did not verify current Korean fees.
- Japan: see above [G6].

## Table by region (iOS / Android)

| Region | Show web-bought items in app | Mention web store in app | Link out | Fee on linked web sale |
|---|---|---|---|---|
| Apple, rest of world | Only with IAP parity (3.1.3(b)) | No | No | n/a |
| Apple, US | Only with IAP parity (text) | Yes | Yes, no entitlement | 0% now; court-set rate pending |
| Apple, EU | Only with IAP parity (text) | Yes, under EU terms | Yes | 15% (10% small biz), 7 days |
| Apple, Japan | Only with IAP parity | Yes, IAP shown alongside | Yes, entitlement | 15% (10% small biz), 7 days |
| Apple, Korea | Only with IAP parity | No | Only if legally required | n/a (26% for alt. in-app PSP) |
| Apple, Brazil | Only with IAP parity | Yes (reported) | Yes (reported) | 15% (reported) |
| Apple, UK | Only with IAP parity | No | No | n/a (CMA rules pending) |
| Google, rest of world | Yes (consumption-only) | No | No | n/a |
| Google, US | Yes | Yes, in program | Yes, in program | Service fee announced; start unconfirmed |
| Google, EEA / UK | Yes | Yes, in program | Yes, in program | From 10% (first USD 1M); ~20% standard |
| Google, Japan | Yes | Yes, in program | Yes, in program | 10%/20% (older terms) |

"Only with IAP parity" is the literal guideline text. Enforcement for small games is not documented.

## How this applies to Border Empires

- **Cosmetics (flag, skin, title):** digital content used in the app. Apple 3.1.1 names "access to
  premium content". Showing them on iOS falls under 3.1.3(b), which requires the same items to be
  "also available as in-app purchases". On Android, consumption-only covers it.
- **Hosted sectors (USD 20):** a digital service consumed in the app (playing in a private
  contest). Not person-to-person (3.1.3(d): real-time, between two individuals; one-to-many must use
  IAP). Not 3.1.3(f) (VoIP, storage, email, web hosting only). So it is 3.1.3(b) again.
  Invitees pay nothing, but the host's purchase is what unlocks the sector; a reviewer can still
  treat a "join hosted sector" flow as content bought elsewhere.
- **Seeing other players' cosmetics** is probably not "unlocking" for the viewer. I found no rule on
  it. Low risk.
- **Free-to-play, no power for money:** helps with Apple's reviewers in tone but changes no rule.
- **Seller in Sweden (EU):** EU users get the EU terms on the EU storefront. Store-level rules follow
  the storefront of the user's account, not the seller's country.
- **Age:** if players under 18 exist, EU/Japan/Brazil link-outs need parental gates; under 13 no
  web offers at all. The app would need age data it may not have.
- **Small Business Program:** TIDN AB likely qualifies (under USD 1M). This cuts Apple fees
  (IAP 15%, EU link 10%, proposed US link 5%). Check enrolment.

## Recommendation for launch

1. **Android:** ship as consumption-only. Show owned cosmetics and hosted sectors. No prices,
   no "buy" buttons, no web-shop text, no links. Low risk, no Google fee.
2. **iOS, outside the US:** same, plus no link anywhere (including settings, help, FAQ pages
   opened in-app). The open question is 3.1.3(b). Lowest-risk compliant path: add IAP for the
   cosmetic bundle and hosted sectors (Apple keeps 15% with Small Business Program). If the owner
   prefers no IAP, submit as account-viewing and expect a possible rejection under 3.1.1/3.1.3(b);
   have IAP ready as plan B.
3. **iOS, US link-out:** legal and currently fee-free, but (a) the fee is likely to change once the
   district court rules, (b) it does not remove the IAP parity text, and (c) it adds a US-only
   code path. Not worth it at launch for a USD 4.99 bundle. Revisit if web sales from iOS users matter.
4. **EU link-out:** 15% (10%) for a 7-day window, plus age gates. Not worth it at launch.
5. Email and other out-of-app messages about the web shop are allowed by both stores everywhere.

Risk summary: Android plan is low risk. iOS without IAP is medium risk at review and ongoing risk
at each update. iOS with IAP is low risk but contradicts "the web is the main shop" in practice.

## Decisions the owner must make

1. Add IAP on iOS for cosmetics and hosted sectors (3.1.3(b) parity), or ship iOS without IAP and
   accept review risk? This triggers the GDD §8 clause "if a store requires them".
2. If IAP: same price as web, or higher to cover Apple's cut? (Apple allows different prices.)
3. Should iOS hide web-bought items until IAP exists? (Bad for players; avoids the parity issue.)
4. US iOS link-out now (0% today, rate pending) or wait for the court?
5. Enrol TIDN AB in Apple's Small Business Program and Google's equivalent fee tier?
6. Minimum age for players, given parental-gate rules for any link-out.
7. Who rechecks these rules, and when (suggest: before each store submission and after the Supreme
   Court ruling in Apple v. Epic, expected 2027)?
8. Record the decision in `docs/gdd.md` §8 with the date.

## Sources (all accessed 2026-11-25)

- [A1] Apple App Review Guidelines, last updated 2026-10-16. https://developer.apple.com/app-store/review/guidelines/ (fetched)
- [A2] Apple news, "Updated App Review Guidelines", 2026-10-16. https://developer.apple.com/news/?id=92th7e5i (fetched)
- [A3] Apple, "Update on apps distributed in the EU" (DMA), DPLA 2026-08-18, terms effective 2026-10-01. https://developer.apple.com/support/dma-and-apps-in-the-eu/ (fetched)
- [A4] Apple, StoreKit External Purchase Entitlement (South Korea). https://developer.apple.com/support/storekit-external-entitlement-kr/ (fetched; no date shown)
- [A5] Apple, Payment options on the App Store in Japan. https://developer.apple.com/support/payment-options-on-the-app-store-in-japan/ (fetched; no date shown)
- [J1] Apple Newsroom, "Apple announces changes to iOS in Japan", 2025-12-17. https://www.apple.com/newsroom/2025/12/apple-announces-changes-to-ios-in-japan/ (snippet only)
- [U1] Epic Games v. Apple, 9th Cir. No. 25-2935, 2025-12-11. https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html (snippet)
- [U2] Courthouse News, Ninth Circuit confirms contempt finding. https://www.courthousenews.com/ninth-circuit-confirms-contempt-finding-against-apple-in-epic-games-battle/ (snippet)
- [U3] 9to5Mac, 2026-05-06. https://9to5mac.com/2026/05/06/supreme-court-rejects-apples-stay-request-epic-games-case-to-head-back-to-district-court/ (snippet)
- [U4] Supreme Court docket No. 25-1311, Apple merits brief 2026-09-14. https://www.supremecourt.gov/DocketPDF/25/25-1311/424150/20260914154510009_2026-09-14%20No.%2025-1311%20Apple-Epic%20Merits%20Opening%20Brief.pdf (snippet)
- [U5] MacObserver, cert granted on one narrow question. https://www.macobserver.com/news/supreme-court-apple-epic-appeal-question-1-narrow/ (snippet)
- [U6] 9to5Mac, 2026-08-13, Apple proposes up to 15%. https://9to5mac.com/2026/08/13/apple-proposes-commissions-of-up-to-15-for-off-app-store-purchases-in-the-us/ ; TechCrunch 2026-08-14 https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/ (snippets)
- [U7] AppleInsider, 2026-08-13. https://appleinsider.com/articles/26/08/13/supreme-court-denies-yet-another-stay-in-apple-vs-epic-proceedings-as-deadlines-loom (snippet)
- [U8] Supreme Court docket No. 25-521 (dismissed 2026-03-09); No. 25A354 (stay denied 2025-10-06). https://www.supremecourt.gov/docket/docketfiles/html/public/25-521.html (snippet)
- [U9] MacRumors 2026-07-15. https://www.macrumors.com/2026/07/15/google-third-party-app-stores/ ; notice of withdrawal https://www.courthousenews.com/wp-content/uploads/2026/07/epic-games-v-google-notice-of-withdrawl.pdf (snippets)
- [E1] MacRumors 2025-04-23, EUR 500M fine. https://www.macrumors.com/2025/04/23/apple-breach-digital-markets-act-eu/ (snippet)
- [E2] Commission decision DMA.100109. https://ec.europa.eu/competition/digital_markets_act/cases/202523/DMA_100109_929.pdf (not fetched)
- [E3] Apple, StoreKit External Purchase Link (EU) Entitlement Addendum (superseded). https://developer.apple.com/contact/request/download/external/StoreKit-External-Purchase-Link-(EU)-Entitlement-Addendum.pdf (snippet)
- [E4] The Star (AFP), 2026-08-19, "EU welcomes Apple steps". https://www.thestar.com.my/tech/tech-news/2026/08/19/eu-039welcomes039-apple-steps-to-comply-with-digital-rules (snippet)
- [K1] CMA blog 2026-02-10. https://competitionandmarkets.blog.gov.uk/2026/02/10/improving-the-way-apple-and-google-deliver-app-store-services-and-enhancing-ios-interoperability-in-the-uk (snippet)
- [K2] CMA programme of work. https://www.gov.uk/guidance/the-cmas-programme-of-work-across-mobile-platforms (snippet)
- [B1] Apple Newsroom, changes to iOS in Brazil, June 2026. https://www.apple.com/pt/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/ (snippet)
- [G1] Google Play Payments policy. https://support.google.com/googleplay/android-developer/answer/9858738 (not reachable; snippet)
- [G2] Google Play Payments policy FAQ (consumption-only). https://support.google.com/googleplay/android-developer/answer/10281818 (snippet)
- [G3] Android Developers Blog, commerce FAQ, 2020-09-28. https://android-developers.googleblog.com/2020/09/commerce-update-faqs.html (snippet)
- [G4] Android Developers Blog, "Expanded billing choice and lower fees on Google Play", June 2026. https://android-developers.googleblog.com/2026/06/play-expanded-billing.html (snippet)
- [G5] FoxData / Airbridge commentary on 2026 fees. https://foxdata.com/en/blogs/google-play-store-opens-external-billing-fees-drop-to-10-starting-june-30-2026/ (snippet)
- [G6] Google Play help, Japan external payments program. https://support.google.com/googleplay/android-developer/answer/16787536 (snippet)
- [G7] Google Play help, US programs notice 2026-07-22. https://support.google.com/googleplay/android-developer/answer/15582165 (snippet; start date cut off)
- [G8] Google, "An update on Google Play billing in the EEA". https://blog.google/company-news/inside-google/around-the-globe/google-europe/an-update-on-google-play-billing-in-the-eea/ (snippet)
- [G9] Google, "Google Play updates let U.K. developers do more and pay less". https://blog.google/company-news/inside-google/around-the-globe/google-europe/united-kingdom/google-play-updates-uk-developers/ (snippet)
