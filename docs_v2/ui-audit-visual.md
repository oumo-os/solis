# UI Audit — Visual (v2)

**Status: implementation truth (v2). Supersedes `docs/ui-audit-visual.md`.**
**Audit date: 2026-10 (code snapshot after Circles/STF audit passes).**

## 1. Design tokens (current)

- `platform/css/platform.css:12-32`: `--navy:#0E1E34`, `--gold:#C8960E`,
  `--bg:#F2F5F9`, `--surface:#FFFFFF`, `--border:#DCE3EC`.
- Fonts: 5 families imported (`shared/fonts.css:1`): Crimson Pro, IBM Plex
  Mono, IBM Plex Sans, Playfair Display, Inter.
- Public CSS: `css/public.css` (root-level, 193 lines), `--bg:#F2F5F9`,
  `--max-w:1040px` (`:18`), `@media(max-width:1320px)` collapses
  `.opps-grid` / `#opportunities` (`:175-178`).
- Shared colors: `shared/colors.js:6` `C.gold="#C8960E"`,
  `:22` `PC.gold="#C8960E"` (no `#9A6F0A` remains).

## 2. View inventory (31 views)

`view-personal` (80), Inbox (84), Commons (109), Undertakings (181),
Observatory (216), Circles (297), Cells (331), Project Cell (371),
Circle Cell (419), Delib (481), STF Dash (566), Participants (1037),
Domain Map (1407), Profile (12190), Guides (3757), plus STF-specific
views (vSTF steward/competence, aSTF motion/judicial, p-aSTF, xSTF,
jSTF) and admin views.

## 3. Fixed since the original audit (2026-09-02)

| Finding | Status | Evidence |
|---------|--------|----------|
| Gold drift `#9A6F0A` vs `#C8960E` | FIXED | `shared/colors.js:6,22` |
| Public bg `#F8F9FB` vs platform `#F2F5F9` | FIXED (platform) | `css/public.css:8` now `#F2F5F9`. Residual: `emblem/css/emblem.css:2` still `#F8F9FB`. |
| Public lacks 1320px collapse | FIXED | `css/public.css:175-178` |
| 6px tag text | FIXED | No 6px text anywhere; `mock-loader.js` uses 7-8px |
| Two hero sizes 56px vs 64px | FIXED | `.hero-icon` 56px (`css/platform.css:216`), `.circle-home-icon` 56px (`:450`) |
| Landing `.link-card` glass cards | GONE | Landing now uses `hero-monument` / `cta-monument` / `.card.card-interactive` |
| Ad-hoc `padding:1px 6px` endorse button | GONE | Only password hint `<code>` retains it |

## 4. Still true (keep)

- Inline-style drift: **1,575** lines with `style="` in `platform/index.html`;
  `mock-loader.js` has 39 such lines.
- Badge collisions: `b-drift` (`css/platform.css:120`) and
  `b-probation` (`:122`) both amber; `b-judicial` (`:119`) and
  `b-rejected` (`:118`) both red.
- `.member-card` gold initials vs `.avatar-gold` (`css/platform.css:325`).
- Two stat scales: platform `.stat .n` 18px (`:107`) vs public
  `.aside-stat-val` 20px (`css/public.css:19`).
- `public/css/public.css` does not exist — public CSS is at root
  `css/public.css`.
- `btn-direct-proposal` (`index.html:345`) still `display:none` and
  steward-gated (`:12586-12587`).
- `create-xstf` (`index.html:440`) / `create-xstf-2` (`:468`) duplicate
  buttons.
- `+ New Cell` button now wired to `newCircleCell()` (was dead).
- `.tbl` horizontal scroll on small screens (`css/platform.css:136-144`).

## 5. Stale line references (audit dated 2026-09-02)

| Doc ref | Was | Now |
|---------|-----|-----|
| `platform.css` size | 1-892 | 909 lines |
| `public/css/public.css` | 1-141 | `css/public.css` at 193 lines |
| `shared/colors.js` | 1-28 | 28 (unchanged) |
| `api-client.js` | 1-515 | 583 lines; `BASE='/api/'` at `:17`, `__status` at `:32` |
| `shared/solmark.js` | 1-80 | 92 lines |
| `shared/modal.js` | 1-81 | 81 (unchanged) |
| `db/seed.js:46 solis123` | 46 | still correct |
| `view-personal` | 78 | 80 |
| Inbox | 82 | 84 |
| Commons | 107 | 109 |
| Undertakings | 186 | 181 |
| Observatory | 221 | 216 |
| Circles | 325 | 297 |
| Cells | 359 | 331 |
| Project Cell | 406 | 371 |
| Circle Cell | 454 | 419 |
| Delib | 516 | 481 |
| STF Dash | 566 | 566 (unchanged) |
| Participants | 1183 | 1037 |
| Domain Map | 1545 | 1407 |
| View count ~30 | 30 | 31 |
| `dmReinit` / `startApp defer` | 5849 / 5926 | `8092-8101` |
| `server.mjs` PORT | 17 | 53 (file restructured to ESM + MySQL, 2402 lines) |
| `.card` | 102 | 103 |
| `.stat .n` | 106 | 107 |
| `.badge` | 111 | 112 |
| `.tag` | 124 | 125 (7 colour variants, `:128-133`) |
| `.btn` | 82 | 82 (unchanged) |
| `.btn-sm` | 86 | 86 (unchanged) |
| `.btn-danger` | 89 | 90 |
| `.tbl` | 133 | 136 |
| `.g2/.g3/.g4` | 93/94/95 | 94/95/96 |
| `.hero/.hero-icon` | 212/213 | 215/216 |
| `.circle-home-icon` | 447 | 450 |
| `.avatar-gold` | 322 | 325 |
| `.modal-overlay` | 704 | 714 |
| `.modal-sm/md/lg/full` | 710-714 | 721-724 |
| `reg-modal` 680px | 757 | 768 |
| `.layout-split` | 795 | 806 |
| `.view:none` | 526 | 529 |
| `.dm-toggle` | 616 | 621 |
| `.vote-btn .vb-label` | 401 | 404 |
| `btn-direct-proposal` | 345 | 345 (unchanged) |
| `create-xstf` / `create-xstf-2` | 475 / 503 | 440 / 468 |

## 6. Backlog (still open, from original audit)

1. Inline-style drift (1,575 lines in `index.html`, 39 in `mock-loader.js`).
2. Badge colour collisions (amber `b-drift`/`b-probation`, red `b-judicial`/`b-rejected`).
3. `.member-card` gold initials vs `.avatar-gold`.
4. Two stat scales (18px platform vs 20px public).
5. `.tbl` horizontal scroll on small screens.
6. `create-xstf` / `create-xstf-2` duplicate buttons.
7. `btn-direct-proposal` discovery (`display:none`, steward-gated).

## 7. New findings since the original audit

- `emblem/css/emblem.css:2` still uses `#F8F9FB` (bg drift not fully closed).
- Font count: 5 families, not 6 (the original summary said 6).
- `reg-modal` has no Escape handler (shared modal does).
- `badge-xs` class was never added (only `tag-xs`/`tag-sm`).
- `mock-loader.js` still uses inline `font-size` overrides instead of
  `.tag-xs/.tag-sm`.
