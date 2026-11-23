# Account cosmetics

Status: canonical reference
Owner: Border Empires maintainers
Last verified: 2026-11-23

The product decisions are in [`gdd.md`](gdd.md) §8. This page describes what
is built and the rules new cosmetics must follow.

## The rule every cosmetic must pass

**Money never buys power.** A cosmetic changes only how something looks. It
must not change visibility, hit areas, or what a rival can read from the thing
it decorates.

| Thing | A rival must still read | So a cosmetic may change | And may not change |
|---|---|---|---|
| Muster flag | Owner (colour), ADVANCE or not (brighter cloth, faster wind), strength (soldier count) | The embroidery on the cloth | The cloth's outline, its wind, the owner colour as the field, how much of the field shows, the plinth, the soldiers |
| Ancillary soldiers | Owner (colour), how many, titanium plate or not (the heavy model) | The paint on parts that are a dark shade of the House colour | The model, its size, its animation, the House-coloured plates, bare metal, glow, the x-ray silhouette |

No design may cover more of the owner's colour than the standard look does.
Picking is by map tile, not by the drawn object, so no cosmetic affects a hit
area.

## What exists

| Id | Slot | Working title | Look |
|---|---|---|---|
| `flag-chevron` | `musterFlag` | Chevron standard | Two pale chevrons over a brass lozenge, in place of the side bands and cog |
| `ancillary-ivory` | `ancillary` | Ivory-trim plate | Helmet, gloves and boots in ivory |

Ids are stored and sent on the wire: never rename one. The working titles are
placeholders; the owner sets shop names and prices. The catalogue is
`packages/shared/src/cosmetics/cosmetics.ts`.

### Where each is drawn

| | True-3D | 2D canvas |
|---|---|---|
| Muster flag | Every visible flag (`muster-banner-cloth-material.ts`, per-flag `aBannerDesign`) | Only the pennant on your own besieged flag (`client-map-render-muster-siege-badge.ts`). The 2D map draws no other muster flag, for any design, so a rival on the 2D map sees no flag design |
| Ancillary soldiers | Battles, dock landings, capture-hold garrisons, marching companies (`popup-marine-material.ts`, per-soldier `uMarineSkin`) | Helmets of capture-hold garrison figures and of battle and landing squad dots (`client-cosmetics/ancillary-skin-2d.ts`) |

Known gaps:

- Your own expand crew and salvage-delivery ancillaries keep the standard
  paint. Only you see them.
- On the heavy titanium armour the Ivory-trim plate is faint: that model has
  little dark paint to repaint, and its titanium edging is left alone on
  purpose.
- The soldier models are baked in Blender from sources outside the repository,
  so a skin with a new shape cannot be built from this repository alone.

Review stories: `Map/Combat/Muster/Flag Designs` and
`Map/Combat/Popup Marines/Ancillary Skins` in Storybook.

## Ownership and selection

- The account key is the gateway player id, which is the same in every Sector
  Contest on a server.
- Tables (gateway SQLite, created by `SqliteAccountCosmeticsStore.applySchema`):
  `account_cosmetics_owned(player_id, cosmetic_id, granted_at, grant_ref)` and
  `account_cosmetics_selected(player_id, slot, cosmetic_id, updated_at)`.
- An account with no row in `account_cosmetics_selected` shows the standard
  look.

**Each server has its own database, and a hosted sector is its own server.**
"Bought once, shown everywhere" therefore needs the hosted-sector work to
either grant on every server an account plays on or replace
`AccountCosmeticsStore` with a central store. Nothing here does that yet.

### Granting

`AccountCosmeticsService.grant(playerId, cosmeticId, grantRef)` in
`apps/realtime-gateway/src/account-cosmetics/account-cosmetics-service.ts` is
the only way an account comes to own a cosmetic. It is idempotent. `revoke`
takes a cosmetic back and returns everyone's view to the standard look. No
client message reaches either.

- **Payment work:** call `grant` from the webhook handler after verifying the
  provider's signature, with the payment id as `grantRef`.
- **Testing and support:** `POST /admin/cosmetics/grant` and
  `POST /admin/cosmetics/revoke`, body `{"playerId", "cosmeticId", "grantRef"?}`.
  They accept only `Authorization: Bearer $ADMIN_API_TOKEN`; no player session,
  query-string token or Firebase sign-in is accepted.

### Client messages

| Direction | Message | Meaning |
|---|---|---|
| Client → gateway | `REQUEST_COSMETICS` | What do I own and show? Sent once per session, on the first HUD render with a live session, not at login |
| Client → gateway | `SET_COSMETIC {slot, cosmeticId \| null}` | Show this owned cosmetic; `null` is the standard look. Refused with `COSMETIC_NOT_OWNED` or `COSMETIC_INVALID` |
| Gateway → that client | `COSMETICS_STATE {owned, selected}` | Reply to both, and pushed when a grant or revoke lands |
| Gateway → everyone | `PLAYER_STYLE {playerId, cosmetics}` | A player's look changed; `{}` is the standard look |
| Gateway → joining client | `INIT.playerCosmetics` | Every account with a non-default look. Absent when there is none |

Settings → Account shows a cosmetics card only to an account that owns
something.

## Wire and memory cost

- A player who owns nothing adds **no bytes** to `INIT` or to any broadcast.
- A non-default look is at most two short ids, about 60 bytes as JSON. A
  change is one broadcast, serialised once and shared by every recipient.
- The gateway keeps one small object per account with a non-default look
  (`shown` in the service), loaded once at boot. It is limited to 5,000
  accounts (`MAX_LOADED_COSMETIC_SELECTIONS`); past that a choice is still
  saved but other players see the standard look, and a counter records it.
- `INIT.playerCosmetics` lists every such account on the server, whether or
  not it is in the current contest. At the limit that is about 300 KB per
  login. If a server ever approaches that, filter the list to the contest's
  players.
- Nothing is stored in the simulation, its checkpoints or its events.
- Metrics: `gateway_account_cosmetics_owned`, `_selected`, `_shown_accounts`,
  `_catalog_size` and `_shown_cap_rejections_total`.

## Account deletion

Both tables are `PERSONAL_TABLES` in
`scripts/account-deletion/erase-account-data.mjs`: the rows are deleted with
the account. Payment records are a separate matter for the payment work. See
[`agents/account-deletion.md`](agents/account-deletion.md).

## Adding a cosmetic

1. Add it to `COSMETIC_CATALOG`. A new slot also goes in `COSMETIC_SLOTS` and
   `PlayerCosmeticSelection`.
2. Give it a look in **both** renderers, or disclose the gap in the table
   above. Add its index to `BANNER_DESIGN_INDEX` or `MARINE_SKIN_INDEX`; both
   are typed so a catalogue id without a look does not compile.
3. Check it against the rule table at the top, and add it to the side-by-side
   story.
4. Read [`lore/README.md`](lore/README.md): a look or name that says something
   new about the world needs a canon update.
