# Solis — Visual/UX Audit (a) visual only
*Date: 2026-09-02 · Scope: `solis/solis` landing + `platform/` SPA + `public/` + `emblem/` · Mode: visual/UX only (no a11y/perf) · Served `http://localhost/solis/platform/` (`M:/Dev/xampp/htdocs/solis` junction → `solis/solis`, Node `solis/platform/server.mjs:17` `:3000`, `httpd.conf:559` `ProxyPass /api`)*

## Executive Summary
Solis has a coherent navy/gold serious-academic identity (`platform/css/platform.css:12-23` `--navy:#0E1E34 --gold:#C8960E --bg:#F2F5F9`) but leaks through three competing surfaces: canonical `platform.css:12-32` tokens, `shared/colors.js:1-28` JS palettes, and ~1.4k inline `style=` (dominantly `platform/index.html` mock rendering). Typography is expressive (Playfair/Inter/Crimson/IBM Plex) but 6 families on platform vs 2 on landing feel heavy. Layout is desktop-first (`--sidebar-w:220px:31` + `layout-split 1fr 300px:795`) with solid tablet/mobile collapse (`768px:546`, `450px:561`) but grid density (`g4:95` 4-col observatory) and component scale (badge 9px mono vs post body 13px) vary between views. Overall pass: unify tokens, collapse button/badge scales, trim inline styles.

## Inventory
* **HTML 17:** `solis/index.html:1` landing (57L, 3 link-cards `:32-46`), `public/index.html:1` (155L, hero+stats `:35-53`, news `:58-68`, opportunities `:71-74`, navy CTA `:76-85`), `emblem/index.html:1` (150L, controls `:20-25`, 300px emblem `:29`), `platform/index.html:1` SPA ~30 views (`view-personal:78` … `view-domain-map:1545`), solo shells `platform/cells.html` etc 0-inline.
* **CSS 4:** `platform/css/platform.css:1-892` (tokens `:12-32`, breakpoints `:543-646`, 20+ components), `public/css/public.css:1-141` (`--bg:#F8F9FB:8` lighter + `--max-w:1040px`), `shared/fonts.css:1` 5-family `@import`, `emblem/css/emblem.css:1-15`.
* **JS 6:** `shared/colors.js:1-28` (`C` public, `PC` platform), `shared/solmark.js:1-80` `SolMark(size,light)` VB340 LOD `:32`, `shared/modal.js:1-81` stack, `platform/mock-loader.js:1-209` `render*`, `platform/api-client.js:1-515` `BASE='/api/':5` `__status:20`, `db/seed.js:46` `solis123`.
* **Inline `style=`:** `platform/index.html` **~1.4k** (generated cards `mock-loader.js`, hero/tables), `public/index.html` 34, `emblem/index.html` 23.

## Typography
* **Import** `shared/fonts.css:1` Crimson Pro 300/400/600 + IBM Plex Mono 300-500 + IBM Plex Sans 300-600 + Playfair 400/600/700 + Inter 300-600.
* **Platform vars** `platform.css:27-30` `--mono IBM Plex Mono`, `--sans IBM Plex Sans/Inter`, `--serif Crimson Pro/Playfair`, `--display Playfair`; body `var(--sans):34`, titles `var(--serif) 28px 300:69` `22px:214` `700:174`, mono labels `10px .15em:71` `9px .12em:137` `10px .05em:82`.
* **Landing** `solis/index.html:12` Inter + Playfair `36px 700:14` serif `italic` footer `12px 25%:22`; **Public** `public.css:21-22` Inter body, Playfair `.serif`; **Emblem** `emblem.css:3` Playfair `.serif`.
* ** finding:** 6 families on platform is brand-rich but heavy (Fonts API 533ms + FA 43ms observed). Public/emblem use 2 families — consider subsetting platform to `--sans`+`--mono`+`--serif` only (drop Plex Sans vs Inter dup).

## Tokens & Variables
* **Source of truth** `platform.css:12-32` 31 vars; **drift** `shared/colors.js:8` public gold `#9A6F0A` vs platform `#C8960E:14`; `public.css:8-14` bg `#F8F9FB` vs platform `#F2F5F9:15` (+ `--space-8:16`). **Fix:** single `colors.js` `PC` as token mirror, align `public.css` bg to platform.

## Components

| Component | File:Line | Visual Notes |
|---|---|---|
| **Sidebar** `.sidebar:39` 220px navy, `.member-card:45` 36px gold `OS`, `.nav-label:50` 9px `rgba(.25)`, `.nav-item:51` 13px `gap10`, `.active:53` gold left border | `platform.css:39-56` | Tight rhythm, gold active legible on navy. |
| **Topbar** `.topbar:60` sticky 48px, `.topbar-path:61` 11px mono, `.motto:65` 12px serif italic | `60-65` | Good secondary nav, motto hidden tablet `:554`. |
| **Card** `.card:102` `18px` pad, `.click:hover:103` gold | `102-108` | Landing `link-card:17` uses `rgba(.06)` glass vs platform white — intentional divergence but card radius `6px:26` vs emblem `8px:29` mismatch. |
| **Stat** `.stat:105` raised, `.n:106` mono 18px | `105-107` | Observatory `g4:95` stats side-by-side feel dense vs personal stats. |
| **Badge** `.badge:111` 9px mono, `b-active:112` green soft, `b-pending:113` amber, `b-review:114` purple etc `111-118` | `111-122` | Overlap: `b-drift/b-probation` duplicate amber, `b-judicial` same red as `b-rejected`. |
| **Tag** `.tag:124` 9px mono, `tag-purple/green/amber/blue/gold/red:125-130` | `124-131,692` | 6px tag in `mock-loader.js:15` `font-size:6px` near illegible on participant cards vs 9px spec. |
| **Button** `.btn:82` 10px mono, `.btn-primary:84` navy, `.btn-sm:86` 9px, `.btn-danger:89` red, `.vote-btn:401` 12px, `.dm-toggle:616` 9px | `82-90,401,616` | 3 scales (9/10/12px) + ad-hoc `padding:1px 6px:3773` endorse — unify to 10px/9px only. |
| **Table** `.tbl:133` `th mono 9px:137` `td 13px:138` `tr.click:hover:140` | `133-143` | Good, but `tbl` block scroll `768px:134` horizontal — projects table `undertakings:191` will scroll. |
| **Layout** `g2:93 g3:94 g4:95 row/col:97-99 layout-split 1fr 300px:795 view:none:526` | `93-99,526,795` | `g4` observatory `public/index.html:73` 4-col opportunities — tablet `1320px:543` g3→1fr+1fr, phone `450px:561` →1fr good. |
| **Hero** `.hero:212` 24px pad, `.hero-icon:213` 56px | `212-216` | Circle home `circle-home-icon:447` 64px larger than cell hero — hierarchy ok but 2 hero sizes. |
| **Modal** `.modal-overlay:704` `.modal-sm/md/lg/full:710-714` `reg-modal 680px:757` | `704-774` | Consistent radius, full `100vw:716` mobile correct. |

## Per-View Visual Notes

* **Landing `solis/index.html:32-46`** — elegant glass `link-card:17` hover `rgba(.1)` gold border, serif `36px`. Gap `12px` good, but 3-cards stack only (no grid) — fine at 640px max but feels sparse vs platform density.
* **Public `public/index.html:35-85`** — hero split `540px + 220px stats:47-52` balanced; `stats` `serif 20px:108` heavy vs platform `18px:106`. `sector-news` `g2 1fr1fr:58` vs `opportunities g4:73` — g4 tight at 1320 (will be 2+2 due to `platform.css:543` but public.css lacks that breakpoint — check public collapse).
* **Emblem `emblem/index.html:29-37`** — `main-emblem 300px` crisp (SolMark LOD `shared/solmark.js:32`), `scale-strip 120/80/48/32/20:130` nice proof, `stamps 72px:132` dark/light — minimal and refined, unlike platform busy-ness.
* **Platform Personal `view-personal:78`** — empty shell populated by `index.html:5849 dmReinit` domain map — ensure watermark `opacity 0.03:35` not competing.
* **Inbox `82`** filters `feed-filters:377` gold active `380` legible; split `layout-main/aside 91-103` will stack `900px:814` good.
* **Commons `107`** compose `post-compose:335` 6 type buttons `121-127` tight; `post-card:343` hover gold border subtle; trending `aside-tags` not rendered when `MOCK.domains` empty.
* **Undertakings `186`** table `tbl:191` clean, aside `3 active:200` stats ok.
* **Observatory `221`** `g4` `230-250` News gold / Calendar teal / Opportunities green / Publications purple — 4 softs distinct but `platform.css:18-23` softs are low contrast on white — ensure `tag` not washed on `card`.
* **Circles `325`** `g3:94` plus `aside Your Circles:341` duplicate — section asymmetry.
* **Cells `359`** plus `btn-direct-proposal:368` hidden (`display:none`) appears only `isStewardOfAnyCircle:5799` — UX discovery low.
* **Project Cell `406`** hero + `messages:420` + `task-list:433` — `task locked:12` icon missing visual lock.
* **Circle Cell `454`** 3 secs proposals/xSTFs/deliverables — xSTF button `create-xstf:475` same as `create-xstf-2:503` duplicate.
* **Delib `516`** decision bar `decision-bar:424` flex space-between gold submit vs red close — strong CTA.
* **STF Dash `566`** table 5-col room/purpose/circle/deadline/status — purpose `+candidate/title:71` concatenated lengthy may wrap.
* **vSTF/jSTF/aSTF/xSTF `605,673,754,917,991`** blind wall `blind-wall:287` blue dashed `10px` distinct; room themes `stf-vstf-wrap:256` purple etc good differentiation.
* **Participants `1183`** `participant-card:325` fixed `120px` height + `pc-domains 6px tags:331` too small (see tag 6px note) — wrap may clip.
* **Domain Map `1545`** `dm-canvas #0E1E34:619` `100vh-180`, `dm-chip/panel:625-628` gold on navy `rgba(14,30,52)` — best visual of app, but `dm-canvas pointer crosshair:619` vs map drag `pan:6943` mismatch.

## Cross-Cutting Findings (VIS-HIGH → LOW)

**HIGH**
1.  Inline style drift `platform/index.html ~1.4k` (`style="padding:1px 6px;font-size:9px:3773"`) sidesteps `platform.css` — buttons/badges rendered via JS `mock-loader.js:15,19,42` hardcode `6px/8px`. **Fix:** add `.tag-xs{font-size:7px}` / `.badge-xs` to `platform.css:111` and replace inline.
2.  Button scale proliferation 9px (`btn-sm:86`) /10px (`btn:82`) /12px (`vote-btn:401`) + ad-hoc — unify feed/threads to `btn-sm` only.
3.  `g4` observatory will overflow on `public` (public lacks `1320px:543` collapse) — add `public/css/public.css:??` mirror breakpoint.

**MED**
4.  Gold duplicate: `C` public `#9A6F0A` `shared/colors.js:8` vs platform `#C8960E:14` — emblem `emblem/index.html:63` `GOLD #C8880A` third gold — pick one (`#C8960E` platform).
5.  Tag/badge 6px `mock-loader.js:15` participant domains illegible — bump to `8px` min.
6.  Two hero sizes `56px:213` vs `64px:447` — keep 56px platform, 64px only circle-home.
7.  Two stat scales `18px:106` vs `20px public/index.html:108` — align.
8.  `member-card:45` gold `OS` vs later `avatar-gold:322` — duplicate.

**LOW**
9.  `-moz-osx-font-smoothing` warning `all.min.css:6` benign — ignore for (a).
10. Landing glass vs platform white card — intentional but note in guide.

## Backlog (visual/UX only, prioritised)
1.  Create `platform.css:124` `.tag-xs/.tag-sm` and replace 6px inlines.
2.  Align `colors.js` gold + `public.css` bg to platform tokens.
3.  Standardise button pad to `btn:82` / `btn-sm:86` only, remove ad-hoc.
4.  Add public breakpoint `@media 1320px .g4→1fr 1fr`.
5.  Unify hero to `56px`, stats to `18px`.

*Verified `http://localhost/solis/platform/` still `200` anon (`MOCK.stfs:{pending,active,completed}:5922`) + auth `os@solis.local/solis123` (`seed.js:46`, `verify mock-loader.js:59` normalised) — post-reset `200` earlier; no console `DM` errors after `DM:6931` reorder + `startApp defer:5926`.*
