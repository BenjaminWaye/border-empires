# Account cosmetics

Status: canonical reference
Owner: Border Empires maintainers
Last verified: 2026-11-24

The product decisions are in [`gdd.md`](gdd.md) §8. This page describes what
is built and the rules new cosmetics must follow.

## The rule every cosmetic must pass

**Money never buys power.** A cosmetic changes only how something looks. It
must not change visibility, hit areas, or what a rival can read from the thing
it decorates.

| Thing | A rival must still read | So a cosmetic may change | And may not change |
|---|---|---|---|
| Muster flag | Owner (colour), ADVANCE or not (brighter cloth, faster wind), strength (soldier count) | The embroidery on the cloth; added ornament in gold and in the owner's colour | The cloth's outline, its wind, the owner colour as the field, how much of the field shows, the soldiers, the siege ring, the progress badge |
| Ancillaries (soldiers) | Owner (colour), how many stand and fall, their stance, shots, and a Titanium Weapons Factory (heavy armour) | The soldier model, on the same rig, clips and tint, up to about 12% taller (the Lancet guard's hood) | Their number, poses, timing, shot colour, Umbrite rounds, and the titanium look: **with a Titanium Weapons Factory every ancillaries look must have a titanium version** (bulky plate edged in bare metal, like the heavy armour), which `marineModelFor` picks, so a rival still sees that strength |

Added ornament must stay inside the tile, close to the standard plinth's
footprint, and within 15% of the standard flag's height
(`muster-banner-regalia-geometry.test.ts`), so a paid flag is grander but not
a taller beacon.

No design may cover more of the owner's colour than the standard look does.
Picking is by map tile, not by the drawn object, so no cosmetic affects a hit
area.

## What exists

| Id | Slot | Working title | Look |
|---|---|---|---|
| `ancillaries-lancet-guard` | `ancillaries` | Lancet guard | A House guard in a long coat and tall hooded helm, in the owner's colour, with a black faceplate split by a white sight slit and a slim rifle with a blue-lit barrel, baked into the model and skinned to the right hand like the standard marine's. With a Titanium Weapons Factory: the same guard in titanium plate, with massive pauldrons, armoured forearms and greaves, every plate edged in bare titanium |
| `flag-high-noble` | `musterFlag` | High-noble standard | A gilded standard: a slowly turning aureole of gold rays inside a studded halo that turns the other way, round a glowing, pulsing gem in the owner's colour, with a soft gold glow behind it; gilded wings spread from the crossbar; two swallow-tailed streamers in the owner's colour from each end of the crossbar, edged and banded in gold, rippling in the wind; four tall gold posts topped with glowing gems and joined by gold chains inside a double gold rim on the plinth; a sheen that sweeps up the gold, glints that twinkle on it, and gold dust drifting up round the flag; and a gold-bordered damask cloth with a scalloped pelmet and a sun in splendour, its gold thread shining as metal with a glint running down it |

The muster flag came first (owner decision, 2026-11-24): the muster flag,
soldiers and AFC are a House's own property. The owner then picked the Lancet
guard as a paid ancillaries look. A colour scheme and beacon skin are not
built.

Ids are stored and sent on the wire: never rename one. The working titles are
placeholders; the owner sets shop names and prices. The catalogue is
`packages/shared/src/cosmetics/cosmetics.ts`.

### Where it is drawn

| | True-3D | 2D canvas |
|---|---|---|
| Muster flag | Every visible flag: the cloth livery (`muster-banner-cloth-material.ts`, per-flag `aBannerDesign`) and the regalia (`muster-banner-regalia.ts`, with its geometry, materials and effects beside it) | Only the pennant on your own besieged flag, which gains a gold edge, sun and finial (`client-map-render-muster-siege-badge.ts`) |

Known gaps:

- **The 2D map draws no muster flag for rivals, standard or not**, so a rival
  on the 2D map does not see the High-noble standard. Drawing one would change
  what 2D players can read and is a gameplay decision, not a cosmetic one.
- It is built in code in the map's low-poly style, like the standard banner.
  A sculpted, textured model would need an artist and a model pipeline.
- The streamers cast no shadow, because they move in their shader.
- The look must not be mistaken for the earned Duke title. It uses no crown.
- Cost: about 3,800 triangles per High-noble flag, eight more draw calls for
  all such flags together, and two matrices per such flag per frame for the
  turning aureole and halo. Streamers, sparkles, glow, dust, the gold sheen and
  the cloth glint animate in their shaders. A standard flag costs nothing
  extra. Not profiled on a phone.
- The glow, sparkles and dust are drawn additively, so they show more at
  night. They sit on the flag's own tile, which a rival sees only with vision
  of it.

Review story: `Map/Combat/Muster/Flag Designs` in Storybook.

### Standard and High-noble, side by side

Captured from that story on 2026-11-24. The standard flag is the back row
(upper row in 2D).

![High-noble standards in front of standard flags, close up](design/cosmetics/muster-flag-high-noble-close.png)
![Five Houses: standard flags behind, High-noble standards in front](design/cosmetics/muster-flag-high-noble.png)

In ADVANCE both designs brighten the same way:

![The same flags in ADVANCE](design/cosmetics/muster-flag-high-noble-advance.png)

At map distance:

![Both rows from far away](design/cosmetics/muster-flag-high-noble-map-distance.png)

2D pennant:

![Standard and High-noble pennants on the 2D siege badge](design/cosmetics/muster-flag-high-noble-2d.png)

## The Lancet guard

| | True-3D | 2D canvas |
|---|---|---|
| Ancillaries | Every soldier a House fields: battles and skirmishes, capture-hold garrisons, marches from a muster flag, and its expand crew. `withSquadSkin` (`client-cosmetics.ts`) adds the owner's choice to the squad gear at each gear lookup in `client-battle-overlay.ts`, `client-map-3d-muster-transit-sync.ts` and `client-map-3d-expand-crew.ts`; `marineModelFor` picks the model | Not drawn: the 2D map draws no soldiers for anyone |

- Models: `packages/client/public/models/popup-marine-lancet-24bone.glb` and,
  for Houses with a Titanium Weapons Factory,
  `popup-marine-lancet-titan-24bone.glb` (each about 5,000 triangles,
  1.3 MB, like the heavy armour; the titanium one is baked with `--titan`). Built from a Meshy
  sculpt and rifle by `packages/client/scripts/bake-popup-marine-lancet-model.py`
  then `retarget-popup-marine-heavy-clips.py`; the asset test checks its rig,
  clips and size like the other two.
- Height 0.058 against the standard marine's 0.052 (owner request, 2026-11-24): about 12% taller, hood included. Soldiers are picked by tile, so this changes no hit area, and their count and spacing are unchanged.
- Loaded only once a House showing it is on screen. No extra cost per soldier
  over the heavy armour.
- Not drawn: salvage-delivery ancillaries (`client-map-3d-salvage-ancillaries.ts`)
  stay standard; they belong to no House's squad.
- Known flaws at close range: the back of the coat stretches a little when
  kneeling, and the Meshy sculpt's gold trim was too faint to keep.
- Lore reviewed; no canon change. Ancillaries are a House's remade bodies run
  by its AI (`lore/galactic-lore.md`); this is a guard livery on them, not a
  different kind of soldier.

Review stories: `Map/Combat/Popup Marines/Skirmish`, `Lancet Guard` and
`Lancet Guard Under Titanium`.

The standard marine and the Lancet guard, idle and running (viewer renders):

![Standard marine beside the Lancet guard](design/cosmetics/ancillaries-lancet-guard-vs-standard.png)

Kneeling and up close:

![The Lancet guard kneeling and standing](design/cosmetics/ancillaries-lancet-guard-close.png)

Heavy armour, the Lancet guard and the titanium Lancet guard:

![Heavy armour, Lancet guard, titanium Lancet guard](design/cosmetics/ancillaries-lancet-guard-titanium.png)

In the game's renderer, Lancet guards (blue) against standard marines (red),
and with a Titanium Weapons Factory blue's guards wear titanium plate:

![Lancet guards in a skirmish](design/cosmetics/ancillaries-lancet-guard-skirmish.png)
![The titanium Lancet guard against the Lancet guard](design/cosmetics/ancillaries-lancet-guard-under-titanium.png)

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
- A non-default look is one short id per slot, about 45 bytes as JSON today. A
  change is one broadcast, serialised once and shared by every recipient.
- The gateway keeps one small object per account with a non-default look
  (`shown` in the service), loaded once at boot. It is limited to 5,000
  accounts (`MAX_LOADED_COSMETIC_SELECTIONS`); past that a choice is still
  saved but other players see the standard look, and a counter records it.
- `INIT.playerCosmetics` lists every such account on the server, whether or
  not it is in the current contest. At the limit that is about 250 KB per
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
   above. A flag design needs an index in `BANNER_DESIGN_INDEX`, which is
   typed so a catalogue id without a look does not compile.
3. Check it against the rule table at the top, and add it to the side-by-side
   story.
4. Read [`lore/README.md`](lore/README.md): a look or name that says something
   new about the world needs a canon update.
