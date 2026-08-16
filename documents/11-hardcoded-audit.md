# Solis SPA — Hardcoded Content Audit (completed)

Audited 2026-08-01 against the empty-state view (`/api/bootstrap?empty=1`)
rendered in a logged-in session via headless Chromium. All remediation items
below are implemented and verified in **normal**, **empty**, and **fallback
(aj)** user modes. Verification method: `_*-test.html` harnesses (login →
iframe → DOM capture after 9s via `--virtual-time-budget=15000`, fresh
`--user-data-dir` per run; inner DOM is HTML-escaped, unescape before
asserting). Harness files are deleted before commit.

Legend: ✅ data-driven with proper empty state · ⛔ previously hardcoded (fixed)

## Remaining known-static areas (intentional / out of scope)

- `view-stf-*` detail pages — rubric/verdict/commentary UI, match tables,
  evidence packages remain static (no data source); Assignment card + page
  header + vSTF candidate name/initials + Integrity-Engine outcome card are
  now hydrated from `stfs` / `integrity_records`. (xSTF has no record on
  file → shows the "No integrity record" empty state.)
- `view-inbox` filter tabs "Unread / Circles" — fixed UI labels.
- "From Discussion to Action" explainer, library cards, "How STFs Work",
  lifecycle/type explainers — fixed copy, not data.
- `view-domain-map` canvas/SVG topology — static layout; the page-sub count is
  now derived from the domain catalog.
- `view-profile` — now rendered from `currentUser` (see item 6b).

## Completed items

1. **view-personal hydrated from `currentUser`** — `renderPersonalView()` /
   `updatePersonalView()`; title, sub, computed insight ("N active
   deliberations across the commons · N open motions in your circles", gated
   on data), 4 metric cards (null-safe), Domain Metrics sorted by interest
   (label from catalog, `barWs`/`barWh`/drift-marker/member counts), Circle
   Membership, Recent Activity (type→color). Verified: os (full), aj
   (fallback: `—`/Not yet declared/No active roles), logged-out (welcome
   empty-state). Static block removed — view is fully runtime-rendered.

2. **Observatory wired to data** — `renderObservatoryNews/Calendar/
   Opportunities/Counts` + rewritten `renderObservatoryPublications(filter)`;
   counts (`obs-count-events|opportunities|publications`, `obs-published-total`,
   aside stats, recent pubs, upcoming events) all derived. Hardcoded 5-entry
   `resolutionsData` replaced by `buildResolutionsData()` from
   `circles[].resolutions` (enacted, `forPublication` when type ≠ system) and
   `cells[].draftResolutions` (pending, date from last `versions[].ts`).

3. **view-stf rendered** — `renderStfAssignments()` (from `stfCandidates`),
   `stfNavKey()` mapping, `renderStfSummary()` (3/0/0), `renderSTFRows()`
   (mock-loader) now targets the real `#stf-body` with purpose/candidate and
   empty colspan row. Verified 6 rows / 3 assignment cards both modes.

4a. **view-cell-circle rendered** — `openCircleCell(cellId)` +
    `renderCircleCell()`: title/tags, proposals, xSTFs (progress from stf or
    xSTF cell), deliverables, messages ("No messages yet."), circle profile,
    roster (first 5 + "N more"), domains, "View Circle Home" →
    `openCircleDetail`. `renderCellCards` routes Circle Cells here. Verified
    both modes.

4b. **view-circle-detail rendered** — `openCircleDetail(circleId)` +
    `renderCircleDetail()`: hero (name/desc/founded/members/motions, Apply),
    domain-activity bars (roster domainWs vs maxContrib; mandate classes),
    deliberation cells (participatingCircles match), STFs commissioned by the
    circle (4 for Space Law), enacted resolutions, activity feed, info,
    health, competence map (desiredWs vs maxPerDomain, "1,800/2,500"),
    Co-Stewards (stats + first 5 roster rows), domain tags, related
    discussions (threads filtered by circle domain set), Enter Circle Cell.
    `renderCircleCards` routes here. Verified both modes (no JS errors).

5. **Count badges/stats derived; participants empty-state** —
   `updateNavBadges()` (inbox unread, STF invitations; badge hidden at 0),
   `renderCommonsAside()` (Your Circles, Trending Domains from thread domain
   counts, threads/replies/likes stats, Suggested Projects), `renderYourCells()`
   (Active/Lead/Member from cells + currentUser), `renderParticipantsAside()`
   (visible count, participants/domains/circles stats, Top Domains, Locations
   from participants), `renderParticipantCards()` guard + "No participants
   registered yet." empty card. Verified both modes.

6. **Static duplicate rows removed** — undertakings static table rows removed
   (table + `renderProjectRows` only); commons aside, cells aside, participants
   aside now containers; `view-organisations` counts/locations derived in
   `renderOrganisations()` (+ empty card); dead `view-personal` static block
   deleted. **6b. view-profile rendered from `currentUser`** via
   `renderProfileView()` (avatar/initials, meta, domain tags, standing + bar,
   bio, Competence Declarations table, Interest Ranking, Domain Metrics,
   Tracked Activity; logged-out empty state). Also fixed a seed data bug:
   catalog was missing the circle-backed domain ids (`space-law`, `policy`,
   `mars`, `freq`) → user domain slugs rendered as raw keys; added the four
   entries to `mock.json` (re-seed required).

7. **view-thread-detail rendered** — `openThreadDetail(threadId)` +
   `renderThreadDetail()`: hero avatar (domain gradient or blue-soft), title,
   body, badge + "author · time · N replies" meta, domain tag, replies from
   the new `thread_replies` table (first 10), info rows (Author/Created/
   Replies/Likes/Shares), participants (author + unique reply authors), related
   threads (same-domain first, top 3, clickable); empty state "No discussions
   yet" + Go to Discussions. Discussion feed cards now open via
   `openThreadDetail('id')`; observatory/related aside links route here.

8. **view-publication-detail rendered** — `openPublicationDetail(pubId)` +
   `renderPublicationDetail()`: title, authors · journal · date meta, tags,
   abstract, info rows (Type/Published/Views/Downloads), author avatars,
   citation string, related discussions (first 3 threads, clickable); empty
   state "No publications yet" + Back to Observatory. `publications` gained
   `id/type/abstract/tags` columns; observatory cards/aside links open the
   detail page (resolutions in the pubs list keep `id: null` and stay
   non-clickable).

9. **view-stf-* Assignment cards + headers hydrated** — `renderStfDetail(key)`
   renders the Assignment card (Type/Candidate|Motion/Circle/Deadline/Status)
   and page header ("◆ type — purpose") from `stfs` (pending/active/completed
   arrays, matched via `stfNavKey`), plus the vSTF Steward candidate
   name/initials; "No assignment data." fallback. Rubric/verdict/evidence UI
   intentionally static. `view-domain-map` page-sub count now derived from the
   catalog ("49 knowledge + 3 affiliate domains").

10. **Legacy redirect stubs audited** — the 8 `platform/*.html` shells are
    meta-refresh redirects to SPA hash routes (kept for bookmark compat);
    `undertaking-detail.html` pointed at a nonexistent `#undertaking-detail`
    route → now `#undertakings`; `public/participate.html` CTA now links
    `../platform/index.html#profile` directly.

11. **"Standing" label sweep (to_prod 0.4)** — all remaining "Standing"
    references removed: profile stat row → "Ws", metric card label →
    "Total Ws", dormant member block → "Ws" label (lbl text; the numeric
    value is still hydrated). `grep Standing` = 0 across `index.html`.

12. **STF Integrity outcome cards** — `renderStfIntegrity(key, stf)` renders
    an "Outcome on record — Integrity Engine" card into the `stf-integrity-*`
    container planted after each blind-wall banner in all five STF detail
    views plus the xSTF execution cell. Record matched from
    `integrity_records` by STF type + subject (title, or `candidate` for the
    vSTFs which carry no title); verdict badge colored by outcome (green for
    Approved/Passed/Healthy/Exonerated, red for Failed/Rejected), meta line
    type · circle · date · IR id, full verdict text. xSTF (no record) and
    any unmatched STF show the empty state. Verified headlessly: vSTF
    Approved/Ssempa, vSTF Approved/Akello, aSTF Passed/Debris Liability,
    jSTF Exonerated, p-aSTF Healthy 26/30, xSTF empty-state.

## Persistence audit (2026-08-08)

Mutating flows vs the API:

- **Persisted**: auth/register/profile, cells CRUD + tasks, draft resolutions
  + versions + implementing circles, circles + domains, thread creation,
  inbox read flags, circle/project applications, governance ledger, STF
  candidate status, settings-as-proposals (via `saveCell`).
- **Newly persisted**: thread replies — `POST /api/threads/:id/replies`
  (generic child route on the existing `thread_replies` table) + reply
  textarea/button in `view-thread-detail` (`submitThreadReply()`, Enter
  submits); reply is merged into local `repliesList` and the count
  increments on success. Verified: POST 201 → row in GET/list + bootstrap.
- **Newly persisted**: deliberation votes — `POST /api/cells/:id/vote-records`
  (specialised `voteRoutes` handler registered **before** the generic
  `childRoutes` in the dispatch chain; `cell_votes` +
  `cell_vote_summary` are recomputed server-side on each cast). The vote
  sheet (`updateVoteSummary`) is now fully data-driven: `totalMembers`
  from `participatingCircles[].votes` (fallback `cell.participants`, then
  8), `domainVotes` from `cell.votes.domains[]` (voter Ws per domain,
  abstains skipped from the yea/nay split), dynamic voter header th's
  (rebuilt every render into `#vote-breakdown-head`), "Not voted" count =
  `totalMembers − votedCount`, quorum/weight from
  `cell.votes.summary.abstain`, and an empty-state row for vote-less
  cells. Cast flow: `selectVote()` → `castMyVote(type)` (POSTs per domain
  the current user has declared Ws for) → `applyCastResult()` merges the
  server response. Verified end-to-end via harness: OS yea on cell-21 →
  Space Law 2,840→4,040, RS 920→1,767, voted 4→5, header gains OS.
  **Bug found & fixed during verification**: `castVote` and
  `addThreadReply` were defined in api-client.js but never added to the
  exported `SolisApi` object — both UI flows were silently broken
  (`SolisApi.castVote is not a function`); both now exported.
- **Newly persisted**: resolution lifecycle — `POST /api/cells/:id/draft-resolutions/:draftId/submit`
  (draft `status` column: `draft|submitted|crystallised`; also flips
  `cells.resolution.status` → `Submitted`; 409 on re-submit) and
  `POST /api/cells/:id/debate/close` (crystallises the cell — sets
  `cells.status`, resolution status → `Crystallised`, marks the draft
  crystallised, computes the outcome from `cell_vote_summary` and writes a
  `governance_events` row with a deterministic id stem so re-closes are
  idempotent). Client: `SolisApi.submitDraftResolution` /
  `SolisApi.closeDebate`; `submitResolution()`/`closeDebate()` now persist
  and update the decision-bar buttons (`updateDelibDecisionButtons`:
  submit disabled + "Submitted to aSTF ✓" / "Crystallised"),
  `#res-modal-status` and the resolution slot badge show Submitted/
  Crystallised; `renderDelibCell` restores button state from persisted
  data. Verified: full submit → re-submit(409) → close → re-close
  (idempotent, single event) sequence round-trips through bootstrap.
- **Still UI-only**: none — every mutating flow now has a backend; the
  audit list below is the full current persistence map.
- Re-seeding twice duplicates non-keyed rows (publications/news/events have
  no unique constraint) — always `rm -f solis.db*` before `node db/seed.js`.

## Data notes (verified against bootstrap)

- `circles[].motions` is a **number** (not array); `circles[].resolutions` has
  `type: "non_system"|"system"`; `cells[].draftResolutions` carry
  `versions[].ts` ("Jul 21, 2026 14:30").
- `stfCandidates`: `{stfId, name, initials, matchScore, status}` — 3 for
  `xstf-itu`.
- `stfs` boots as `{pending[], active[], completed[]}` with `id/type/purpose/
  circle/deadline/status` (`candidate` on vSTFs, `title` on aSTF/jSTF/p-aSTF);
  `stfNavKey(id)` maps to view keys.
- Threads carry `repliesList[]` (from the `thread_replies` table; 2–3 rows)
  while the `replies` count (8–14) stays the display number; publications have
  numeric `id` + `type/abstract/tags`.
- `MOCK.domains` is an object keyed by slug (not an array) — iterate with
  `Object.keys()`.
- Participants have `joined: undefined` / empty `avatar` — renderers are
  null-safe.
- Server caches nothing, but holds the DB file open: after re-seeding, the
  server must be restarted to see new data.

## Auth & transport hardening (2026-08-08, to_prod 1.2)

- **Password hashing**: `server.mjs` `hashPassword` now scrypt
  (`scrypt$16384$8$1$<salt>$<hash>`, node:crypto `scryptSync`, 64-byte key,
  per-user 16-byte salt). Legacy sha256 hashes (seeded users) still verify
  via `verifyPassword` and are transparently re-hashed to scrypt on their
  next successful login (`isLegacyHash` → upgrade). Registration hashes
  with scrypt directly.
- **Brute-force protection**: in-memory sliding-window rate limiter on
  `/api/auth/login` + `/api/auth/register` (per client IP, default 10
  attempts / 15 min, `SOLIS_AUTH_RATE` env override); over-limit → 429 with
  `retryAfter` seconds, regardless of credential validity. Failed logins
  also increment `users.failed_attempts` (reset on success); column added
  to `schema.sql` + guarded `ALTER TABLE` on boot for existing DBs.
- **Sessions**: 24h opaque tokens (unchanged) — login now prunes that
  user's expired tokens; logout already revokes the presented token.
- **CORS**: `/api/*` responses carry `Access-Control-Allow-Origin`
  (`SOLIS_ORIGIN` env, default `*`), methods, headers + 86400 max-age;
  `OPTIONS` preflight short-circuits with 204.
- **Deviations from to_prod 1.2**: kept email+password (no magic-link
  infra) and opaque DB tokens (no JWT); documented in to_prod.md.
- Verified via `/tmp/opencode/auth-battery.mjs` against a fresh seed:
  preflight 204 + CORS headers, legacy-login→scrypt upgrade, scrypt login,
  401 wrong password, `/me`, logout revocation, expired-token 401, register
  201 + login + 409 duplicate, 429 lockout with `retryAfter`. Full SPA
  smoke (login → personal / stf-astf / cell-21) still green.

## Commons composer persisted (2026-08-08, to_prod 2.4)

- The compose "Post" button (previously static, no handler) now calls
  `composePost()`: reads the composer textarea + active content-type
  (discussion/proposal/event/article/opportunity/publication → badge +
  badgeClass), builds a thread (`thread-<ts36>` id, author/initials from
  `MOCK.currentUser`, amber General domain tag, "Just now"), unshifts it
  into `MOCK.threads`, re-renders `renderDiscussionThreads()`, clears the
  box, and persists via `SolisApi.addThread` (`POST /api/threads`,
  upsert). Feed regeneration after publish (`publishDeliverablesToCommons`)
  unchanged.
- Verified headlessly: fresh seed feed 8 → 9 after Post, post visible in
  feed, row present via `GET /api/threads`, and feed still shows the post
  after a full iframe reload (bootstrap round-trip).

## Post-card engagement persisted (2026-08-08, to_prod 2.4)

- The three inert post-card action buttons are now wired:
  - **Like** (`toggleThreadLike`): per-session toggle (`window._likedThreads`),
    increments/decrements `thread.likes` locally (+ re-renders feed through
    `renderDiscussionThreads`, heart fills ♥ + `.post-action.liked` red
    class) and persists via new `SolisApi.updateThread` →
    `PATCH /api/threads/:id`.
  - **Reply** button → opens the thread detail (`openThreadDetail`), where
    the reply box persists via the existing `POST .../replies`.
  - **Share** (`shareThread`): copies `origin+path#threadId` (clipboard
    guarded) + toast.
- Verified headlessly: like count +1 and rerendered card carries
  `liked` class + filled heart; `GET /api/threads/:id` shows the bumped
  count; count survives a fresh page load while the liked state resets
  (per-session by design).

## Inbox read-state persisted (2026-08-08)

- `selectInboxItem` previously cleared `item.unread` in memory only — the
  nav badge (`#inbox-badge`, via `updateNavBadges`) revived after reload.
  Opening an unread item now persists via `SolisApi.saveInboxItem`
  (`PATCH /api/inbox/:id { unread: 0 }`, existing child-sync untouched) and
  immediately refreshes the nav badge.
- Verified headlessly: badge 3 → 2 on open, `GET /api/inbox/ib-1` shows
  `unread: 0`, badge stays 2 after a fresh page load; item detail still
  renders.

## Engagement tier 2 — endorse / bookmark / feed filters (2026-08-09, to_prod 2.4)

- Four inactive Commons feed-filter tabs (My Feed / Circle Mentions /
  Endorsed / All) are now wired via `filterCommonsFeed(filter, btn)` +
  `filterCommonsThreads()`; state held in `_commonsFilter`, re-applied on
  every `nav('commons')` and after like/endorse/bookmark re-renders.
  - My Feed = my own posts or threads whose domain matches one of my
    domains (alnum-normalized, so `space-law` ≈ `Space Law`).
  - Circle Mentions = circle names (my `currentUser.circles`) matched in
    title/body/author text.
  - Endorsed = `endorsements > 0`; All = everything.
  - Each non-All filter renders an empty state ("No discussions match
    your filter.") when nothing survives.
- **Endorse**: `toggleThreadEndorse` toggles `window._endorsedThreads`,
  bumps the local count, and persists via `SolisApi.setThreadEndorse(id, on)`
  → `POST/DELETE /api/threads/:id/endorsement` (new `engagementRoutes` in
  server.mjs). Server inserts/deletes the per-user row in
  `thread_endorsements`, recomputes `threads.endorsements`, and returns the
  authoritative count. `.post-action.endorsed` (green ✓, count badge) marks
  the active state.
- **Bookmark**: `toggleThreadBookmark` + `setThreadBookmark` →
  `POST/DELETE /api/threads/:id/bookmark` against `thread_bookmarks`;
  `.post-action.bookmarked` (gold ◆) marks the active state; bookmarks carry
  no aggregate count display.
- **Per-user hydration**: bootstrap now returns `myEngagements`
  (`[{threadId, endorsed, bookmarked}]`) computed for the Bearer user;
  `hydrateEngagements()` rebuilds `_endorsedThreads`/`_bookmarkedThreads`
  after every `loadApiData` success. Second-user session sees counts but no
  per-user state — endorsement/bookmark state never leaks across accounts.
- **Schema**: `threads.endorsements INTEGER DEFAULT 0` (guarded
  `ALTER TABLE` in server boot for existing DBs) + `thread_endorsements`
  and `thread_bookmarks` (PK `(user_id, thread_id)`, CASCADE on thread
  delete) in schema.sql.
- Verified headlessly (23-check suite): 0→1 endorse + server persistence +
  bootstrap state + reload survival (count and filled class), bookmark
  same, all four filters narrow the feed (6 / 1 / 1 / 8 with seed data),
  un-endorse un-endorses to 0 server-side, unbookmark removes the class and
  clears bootstrap state, Endorsed filter empty state renders, and a second
  user sees counts but neither per-user state. Harness deleted after green;
  DB re-seeded.

## Pinned posts (2026-08-09, to_prod 2.4)

- Pinning is the last unshipped 2.4 discussion feature; `threads.pinned`
  always existed (seed: thread-029 pinned) but nothing re-ordered the feed
  or toggled it.
- **Server**: `pinRoutes` — `POST/DELETE /api/threads/:id/pin`, auth
  required (401), and gated to users with an active `circle_roster` row
  (`status = 'active'`) → 403 "Steward access required" otherwise. Toggle
  writes `threads.pinned` through the dedicated route only — the generic
  resource PATCH remains, but pinning semantics live here.
- **Client**: `SolisApi.setThreadPinned(threadId, on)` →
  `POST/DELETE threads/:id/pin`; `toggleThreadPinned` flips locally,
  re-renders (reorder), syncs, and rolls back with an error toast on a
  403. The pin toggle button (⚑, `.post-action.pin-on`) renders only when
  `isStewardOfAnyCircle()` is true for the session user. Feed rendering
  sorts pinned threads to the top (stable, preserves relative order) with
  the ★ `post-pin-icon` retained on pinned cards; sorting composes with
  the four feed filters (each filtered list is pinned-first too).
- Verified headlessly (13-check suite): pinned seed thread renders first,
  pin icon present; OS (non-roster) sees no button and gets
  `403 Steward access required`; roster user sees 8 toggles, pinning a
  thread moves it to the top immediately, `GET /api/threads` shows
  `pinned: 1`, the order + `.pin-on` class survive a full reload, unpin
  restores the original order with `pinned: 0` server-side, and the seed
  pinned thread remains pinned. Harness deleted after green; DB re-seeded.

## Thread → proposal origin (2026-08-09, to_prod 2.5 / 2.6)

- Origin #1 of 2.5 ("Discussion thread → steward proposal, links back to
  source thread") was the missing path: deliberation cells existed for
  org/circle/project/settings/publication origins, but a Commons discussion
  could never become a proposal, and `renderDelibOrigin` fell through to a
  generic "Proposal Origin — Awaiting deliberation" card for
  `source.type === 'commons-thread'`.
- **Server**: `raiseProposalRoutes` — `POST /api/threads/:id/raise-proposal`:
  auth (401), steward-only via active `circle_roster` membership (403,
  same gate as pinning), 404 for unknown threads, 409 for a thread already
  raised. Creates a `Deliberation Cell` (`delib_type 'commons-thread'`,
  status `Active`, participants = active-user count, title = thread title,
  source JSON carries `threadId/threadTitle/threadAuthor/threadBody`,
  resolution `{ status: 'Draft' }`) and sets `threads.proposal_cell_id`
  (new column, guarded ALTER for live DBs). Bootstrap now maps
  `proposalCellId` onto each thread.
- **Client**: `SolisApi.raiseThreadProposal`; `raiseThreadProposal()` in
  index.html toggles the detail view's proposal zone — stewards get a
  dashed "Raise as proposal" action, raised threads get a gold chip with
  "Open deliberation". The new cell is mirrored into `MOCK.cells` +
  `cellsById` so the user lands in a live deliberation view.
- **Origin card** (2.6): `renderDelibOrigin` gains a `commons-thread`
  branch — thread title, excerpt, proposer/author, and a "View source
  discussion" button that `openThreadDetail`s the origin thread (a
  back-link from proposal to thread).
- Verified headlessly (20-check suite): non-steward → 403, steward → 201
  with cellId, bootstrap reflects thread link + cell (type/status/source/
  resolution), duplicate raise → 409, raised thread shows chip (and no
  raise button) while unraised shows the raise action, UI raise adds the
  local link and the cell to bootstrap, origin card renders with thread
  title and click-through to the thread detail, and the link + cell
  survive a full page reload. Harness deleted after green; DB re-seeded.

## Direct steward proposal (2026-08-09, to_prod 2.5 origin #2)

- **Why**: proposals previously needed an existing artefact (thread, org,
  circle, project, settings, publication). A steward should be able to open
  a deliberation on anything — the "direct proposal (no preceding thread)"
  path was dead code: 2.5 origin #2.
- **Server**: `directProposalRoutes` — `POST /api/proposals/direct`:
  auth (401), steward-only via active `circle_roster` (403), empty title
  rejected (400). Creates a `Deliberation Cell`
  (`delib_type 'direct-proposal'`, status `Active`, participants = active
  user count, source JSON carries `type/proposer/description/domain`,
  resolution `{ status: 'Draft' }`). No `circle_proposals` row is written —
  direct proposals are not bound to a circle until they are debated.
- **Client**: `SolisApi.createDirectProposal`; the Cells view header gains
  a steward-only "＋ Direct Proposal" button (visibility synced on every
  data load via `syncDirectProposalButton`), opening a modal (title,
  description, optional domain). `submitDirectProposal()` mirrors the
  created cell into `MOCK.cells` + `cellsById` (same rich shape as the
  thread-raise mirror) and lands the user in the new deliberation cell.
- **Origin card** (2.6): `renderDelibOrigin` gains a `direct-proposal`
  branch — description, optional domain chip, "No preceding discussion"
  marker and proposer; the Deliberation description label maps
  `direct-proposal` → "Direct Steward Proposal".
- Verified headlessly (32-check suite): non-steward → 403 + no button;
  steward → button visible, 201 + `delib-` cellId; bootstrap carries the
  cell with type/status/source (type, description, domain, proposer) and
  Draft resolution; empty title → 400; modal flow opens a live deliberation
  with the direct origin card (no source back-link); cells grid lists the
  new card; everything survives a full reload. Harness deleted after green;
  DB re-seeded.

## System-bound proposal (2026-08-09, to_prod 2.5 origin #3)

- **Why**: settings/circle-profile proposals existed but only as mock-local
  cells — `submitSystemProposal()`/`submitCircleProposal()` pushed a cell
  into `MOCK.cells` and called `saveCell`, which silently dropped the
  snapshot (`settingsSnapshot` was not a `cells` column), so the proposal
  never survived a reload and nothing gated it server-side.
- **Server**: `settingsProposalRoutes` — `POST /api/proposals/system`:
  auth (401), steward-only via active `circle_roster` (403), `delibType`
  allowlist `['system-settings','circle-settings','circle-creation']`
  (400) and title required (400). Creates a `Deliberation Cell`
  (`delib_type` from allowlist, status Active, participants = active-user
  count, source `{type: settings-proposal | circle-proposal, proposer,
  submitter}`, resolution Draft). The full settings snapshot is stored in
  the `meta` JSON catch-all column, which bootstrap already spreads onto
  the cell — no schema change needed, and `settingsSnapshot` now
  round-trips through server + reload.
- **Client**: `SolisApi.createSettingsProposal` / `createCircleProposal`
  (same endpoint, different semantics). Both settings submit flows became
  server-first: 403 → toast, 400 → toast, 201 → cell mirrored locally,
  `currentDelibCellId` set (fixing a latent gap where the deliberation
  page's voting/drafting controls referenced no cell after a settings
  submit), modal closed, deliberation opened.
- Verified headlessly (28-check suite): non-steward → 403; bad `delibType`
  and empty title → 400; system + circle proposals → 201 with `delib-`
  ids; bootstrap round-trips delibType/source (proposer "Akello Jane")/
  settingsSnapshot (quorum minParticipants = 9, circle name)/resolution
  Draft; System Settings modal flow (Quorum tab, changed value 9) opens
  the deliberation with the "System Settings Change" origin card showing
  the changed value; everything survives a full reload (snapshot
  re-rendered from server data). Harness deleted after green; DB re-seeded.

## Resolution lifecycle integrity (2026-08-09, to_prod 2.5 #5–7 + 2.6)

- **Why**: the decision routes (`draft-resolutions/:id/submit`,
  `debate/close`) accepted unauthenticated calls and niether checked the
  steward gate; `vote-records` and every child write (messages, drafts,
  tasks…) had no session check, and the close flow always recorded the
  draft as `crystallised` even when the resolution failed. On the client,
  the Deliberation page bound its resolution slot + draft list to a seeded
  cell (`cell-21`) at boot, so every opened deliberation (thread-raise,
  direct, settings origins) showed another cell's resolution and voting
  controls.
- **Server**:
  - `governanceRoutes` — submit + close now require auth (401) and an
    active `circle_roster` membership (403, `Steward access required`).
  - `debate/close` finalises the submitted draft as `passed`/`failed`
    per the vote outcome (previously always `crystallised`), writes
    `resolution.outcome` onto the cell, and keeps the idempotence check
    (already-crystallised cells return `already: true` with the stored
    outcome).
  - `voteRoutes` — requires a session (401); the voter identity
    (`initials`, name) now comes from the session token, not the request
    body, so a member can't cast votes as someone else.
  - `childRoutes` — all non-GET writes to child resources (messages,
    drafts, tasks, votes, roster, proposals…) require a session (401).
- **Client**:
  - `renderDelibCell` now rebuilds `delibResolutions` from the **opened**
    cell's `draftResolutions` and calls `updateResolutionSlot()` — the
    2.6 "Resolution" slot (title, status badge, version count, actions)
    finally reflects the cell you're actually in, and `submitResolution`
    operates on that cell's draft (it reads `delibResolutions[...rowId]`).
  - `updateDelibDecisionButtons`: Submit/Close decision buttons only
    render for stewards (non-stewards see nothing; crystallised cells show
    a disabled summary instead).
  - Status vocabulary extended for the recorded outcomes:
    `passed` → "Passed" (b-success), `failed` → "Failed" (b-danger) in the
    slot badge and modal status line.
- Verified headlessly (28-check suite): anonymous submit/close/vote/
  message → 401; member OS can vote (200, identity from token) but
  submit/close → 403; steward AJ runs the full lifecycle — draft 201,
  nay 550 + yea 120 + abstain 0 → summary 120/550/0, submit 200,
  re-submit 409, close → `outcome failed` (120/550), cell crystallised,
  draft row recorded `failed`, governance event written, close idempotent.
  UI: overlays a freshly-created direct-proposal cell — crystallised bars
  disabled with "Crystallised"/"Closed", Failed badge in the resolution
  slot, and a member sees the same cell with no decision buttons.
- Harness deleted after green; DB re-seeded.

## Motion lifecycle & aSTF verdict (2026-08-09, to_prod 2.7)

- **Why**: a motion lifecycle existed only on paper — a passed resolution
  had no path to blind adjudication and the aSTF machinery was limited to
  a seeded demo page with no persistence.
- **Server**:
  - `submitResolution` now also spawns a blind `aSTF Cell` (type
    `motion-audit`, `blind=1`, `commissioned_by` set to the origin cell
    id) and inserts a matching `stfs` row (bucket `active`, status
    `Blind Review`) so the motion appears on the STF dash.
  - The origin cell gets `resolutionRef` set to the aSTF cell id;
    the resolution status is recorded as `Submitted`.
  - New endpoint: `POST /api/cells/:id/astf-verdict` — body
    `{ verdict: approved|rejected|revision, rationale, rubric:
    {jurisdiction, depth, alignment, competence}, flags[] }`.
    Auth required (401), cell must be `aSTF Cell` in `Blind Review`
    (400 if not), idempotent (409 if already filed).
    Verdict + rubric total are stored on the cell's resolution JSON;
    cell is unblinded (`blind=0`, status `Verdict Filed`);
    origin cell resolution updated (`Approved`/`Rejected`);
    `draft_resolutions` status updated (`passed`/`failed`);
    governance event written (`evt-astf-<cellId>-<ts>`).
    Rubric values are capped at their per-dimension max and totalled.
  - `stfs` row is moved to `completed` / `Verdict Filed` on verdict.
- **Client**:
  - `fileAstfVerdict` added to `api-client.js`; `doAstfVerdict` helper
    reads rubric inputs, validates total ≤ 30 + rationale non-empty,
    shows confirm modal before calling the API.
  - `renderDelibCell` detects `type === 'aSTF Cell'` and renders a
    blind-adjudication verdict form (rubric grid, rationale, three
    verdict buttons) instead of the normal deliberation UI.
  - `updateDelibDecisionButtons`: after submission, shows an "Open
    aSTF Cell →" button linking to the spawned cell; hides Close.
- Verified headlessly (21 checks): anon submit 401, OS submit 403,
  steward submit 200 + spawns aSTF + stfs row + resolutionRef +
  resolution Submitted; invalid verdict 400; anon verdict 401;
  verdict approved → aSTF unblinds, verdict+rubric stored, origin
  Approved, draft passed, stfs completed, governance event written;
  re-file 409; wrong-type 400.
- Harness deleted; DB re-seeded.

## xSTF execution lifecycle (2026-08-09, to_prod 2.8)

- **Why**: the xSTF create modal existed client-side only (pushed to
  `MOCK.cells` with no server persistence) and there was no path from an
  approved aSTF verdict to a live execution cell.
- **Server**:
  - `POST /api/cells/:id/spawn-xstf` — spawns an `xSTF Cell` from an
    approved aSTF cell.  Auth + steward gate (401/403), cell must be
    aSTF with verdict `approved` (400), idempotent (409 if xSTF already
    spawned).  Creates the xSTF cell (blind, deadline, deliverableSpecs
    stored in the `meta` JSON column, default 7-step task list), inserts
    `cell_team` rows, and adds an `stfs` row (bucket `active`).
  - `POST /api/cells/:id/submit-deliverable` — team member submits a
    deliverable draft (auth required, title required, stored in
    `meta.deliverables[]`).
  - `POST /api/cells/:id/review-deliverable` — steward reviews a
    submitted deliverable (auth + steward gate).  Decision `approved`
    marks the xSTF cell `Completed`, updates stfs to `completed`;
    decision `revision` leaves the cell active.  Idempotent (409 if
    already reviewed).
- **Client**:
  - `xstfCreateSubmit` now calls `SolisApi.spawnXstf` when an aSTF cell
    is available (falls back to client-only when not linked).
  - `renderXstf` deliverables section reads `meta.deliverables[]`
    (server-persisted) and renders per-deliverable status badges +
    steward review buttons when status is `submitted`.
  - `spawnXstfFromAstf` button appears on the aSTF verdict bar when
    verdict is `approved`; calls spawn-xstf and refreshes bootstrap.
  - `openSubmitDeliverableModal` + `reviewDeliverable` client functions
    wired to the new endpoints.
- Verified headlessly (21 checks): full lifecycle — login, create
  deliberation cell + draft, submit to aSTF, verdict approved, spawn
  xSTF (201 + stfs active), respawn 409; submit deliverable (201),
  missing title 400; non-steward review 403, steward approve → xSTF
  Completed + stfs completed, re-review 409; invalid review 400, wrong
  type 400, anon spawn 401, anon deliverable 401.
- Harness deleted; DB re-seeded.

## vSTF verification lifecycle (2026-08-09, to_prod 2.9)

- **Why**: the vSTF steward candidacy and competence claims views were
  static demo pages with no persistence or lifecycle.
- **Server**:
  - `POST /api/cells/:id/spawn-vstf` — spawns a `vSTF Cell` (type
    `steward-candidacy` or `competence-claim`).  Auth + steward gate
    (401/403), idempotent per type (409).  Stores candidate info,
    assessments array, and minAssessors in `meta` JSON.  Creates
    matching `stfs` row (bucket `active`).
  - `POST /api/cells/:id/vstf-assessment` — files an assessment on a
    vSTF cell.  Auth required (401), no duplicate per assessor (409).
    Steward candidacy: requires `score` (0–100) + `rationale` (400 if
    empty).  Competence claim: accepts `domainEvals[]` + `comment`.
    When `minAssessors` filed, auto-closes: steward cells average the
    scores; competence cells count assessors.  Cell status →
    `Assessment Filed`, stfs row → `Completed`.
- **Client**:
  - `fileVstfStewardAssessment` + `fileVstfCompetenceAssessment` read
    values from the existing static forms (score input, rationale
    textarea, domain eval table) and call `SolisApi.fileVstfAssessment`.
  - `getActiveVstfCell` helper finds the most recent vSTF cell in
    bootstrap.
- Verified headlessly (21 checks): login, create source cell; anon
  spawn 401, non-steward 403, invalid type 400; spawn steward vSTF 201,
  respawn 409; spawn competence vSTF 201; both vSTF cells in bootstrap;
  stfs rows active; anon assessment 401, wrong type 400, missing
  rationale 400; steward candidacy assessment filed (1/3, 2/3),
  duplicate 409; competence assessment filed (1/2, complete),
  competence vSTF → Assessment Filed.
- Harness deleted; DB re-seeded.

## p-aSTF periodic review (2026-08-09, to_prod 2.10)

- **Why**: circle health reviews were defined in the spec with a full
  two-layer rubric but had no persistence or lifecycle.
- **What**:
  - `POST /api/cells/:id/spawn-pastf` — spawns a `p-aSTF Cell` from a
    source cell.  Auth + steward gate (401/403), idempotent per source
    cell (409).  Creates cell (Pending Review, circle name, minReviewers)
    + stfs row (active).
  - `POST /api/cells/:id/pastf-review` — file a two-layer rubric review.
    Auth required (401), no duplicate per reviewer (409), healthTier
    validated (400).  Layer 1: circle rubric (30 pts: activity 0–6,
    competenceFit 0–7, discipline 0–6, cohesion 0–5, delivery 0–6).
    Layer 2: member rubric (35 pts + 2 risk flags: effectiveness 0–5,
    stewardship 0–7, participation 0–5, investment 0–8, productivity 0–6,
    roleFit 0–4, replaceability 0–5 >3 → knowledge-transfer,
    indispensable 0–5 >3 → jSTF referral).  Auto-closes at minReviewers
    by averaging circle totals and majority-tier health.
  - `spawnPastf` / `filePastfReview` added to `SolisApi`.
  - `filePastfReview` reads circle/member rubric inputs from the existing
    `#view-stf-pastf` view and calls the API.
- Verified headlessly (17 checks): full lifecycle — login, create source
  cell, spawn p-aSTF 201, respawn 409, p-aSTF cell in bootstrap, stfs
  row active; anon review 401, wrong type 400, invalid tier 400;
   reviewer 1 filed (circle=23), duplicate 409; reviewer 2 filed →
   complete; p-aSTF cell Review Complete; stfs completed.
- Harness deleted; DB re-seeded.

## jSTF judicial investigation lifecycle (2026-08-17, to_prod 2.11)

- **Why**: the jSTF judicial investigation view was entirely static demo
  content with no persistence, report/escalate flow, restriction vote
  mechanism, verdict filing, aSTF audit, or appeal path.
- **What**:
  - `POST /api/jstf/report` — any member reports any member.  Creates
    (or appends to) an anonymous report thread on the target, stewards-only.
    Reports on the same target accumulate as replies (thread post count).
    Auth (401), targetId required (400), description required (400),
    cannot self-report (400), target must exist (404).
  - `POST /api/jstf/appeal` — anyone appeals a resolution.  Same thread
    machinery against the case, stewards-only.  Auth (401), caseId
    required (400), case must be a jSTF cell (404).  Accumulates on
    same case.
  - `POST /api/jstf/escalate` — a steward sponsors/escalates an
    anonymous thread, spawning the jSTF cell + team composition.  Auth
    + steward gate (401/403), thread must exist (404), not already
    escalated (409).  Team = 3 active stewards (JOINed against users
    to ensure authenticatable members).  Creates jSTF cell (Under
    Investigation), cell_team rows, stfs row, links thread via
    jstf_cell_id, governance event.
  - `POST /api/cells/:id/jstf-vote` — live majority restriction toggle.
    Each jSTF team member can set restrict/lift at any time (upsert via
    vote_records).  State flips instantly when count crosses majority
    threshold; fully reversible in both directions.  Severity: target
    is steward -> `frozen`; member target or unanimous -> `readonly`.
    Auth + team membership (403), stance validated (400), status must
    be Under Investigation (400).
  - `POST /api/cells/:id/jstf-verdict` — single filing by the jSTF
    (same as a deliberation motion).  Auth + steward (401/403), must
    be Under Investigation (400), no existing verdict (409), type must
    be system-bound or policy-cited (400), description required (400).
    Finalises jSTF cell, spawns blind aSTF audit cell (judicial-audit
    source type -- decision only, never jSTF member names), stfs rows
    updated, governance event.
  - Extended `astfVerdictRoutes` for `source.type === 'judicial-audit'`:
    approved -> jSTF cell `Resolution Applied` with implementation
    actions; revision or rejected -> same jSTF cell continues with
    shuffled composition via `jstfShuffleComposition()` (team rotated,
    old verdict superseded into revisions history, meta.verdict reset,
    restriction votes pruned for removed members, stfs row restored
    to Under Investigation).
  - `threads` schema extended: `visibility TEXT DEFAULT 'public'` and
    `jstf_cell_id TEXT` added via ALTER TABLE migrations.
  - `reportJstf` / `appealJstf` / `escalateJstf` / `voteJstf` /
    `fileJstfVerdict` added to `SolisApi`.
  - `renderJstfPanel()` hydrates `#stf-integrity-stf-jstf` with pending
    steward threads + escalate buttons, active case panel (restriction
    toggle, team roster, verdict form, appeal), status badges.
  - `renderJstfIntake()` renders Report + Appeal buttons into the
    Integrity page aside card.
  - Report chip added to each participant card in `mock-loader.js`.
  - `stfNavKey` updated so all `stf-jstf-*` ids route to `stf-jstf`
    view.
  - Finalise button wired to `fileJstfVerdictFlow()`.
- Verified headlessly (42 checks): login (3 users), report gates
  (401/400x3), report 201 new thread, report accumulated (replies=2),
  thread stewards-only + not linked, escalate gates (401/403/400/404),
  escalate 201 cell created, re-escalate 409, jSTF cell in bootstrap
  with team=3, thread linked to jSTF, stfs active; login 3 team
  members, non-team vote 403, invalid stance 400, aj restrict 1/3
  relaxed, 2nd restrict 2/3 restricted, unanimous 3/3 readonly, 1 lift
  still restricted, aj lifts relaxed, aj re-restricts restricted;
  verdict gates (401/403/400x2), verdict filed + aSTF audit spawned,
  re-file 409, jSTF Finalised + aSTF Blind Review, stfs Finalised +
  active; aSTF approve -> jSTF Resolution Applied; appeal gates
  (401/400), appeal 201 new thread, appeal accumulated, appeal thread
   stewards-only.
- Harness deleted; DB re-seeded.

## Membership & stewardship lifecycle (2026-08-17, to_prod 2.12)

- **Why**: the circle detail view showed roster data from the seed but had
  no mechanisms for membership changes — resignation, jSTF forced
  removal, circle flush, disbandment, competence drift, or term expiry
  were not implemented.
- **What**:
  - `POST /api/circles/:id/resign` — any active member may resign.
    Auth (401), must be active roster member (400).  Records resignation
    with date and reason in `circle_roster`.
  - `POST /api/circles/:id/remove-member` — steward removes a member
    (jSTF forced removal).  Auth + steward gate (401/403), target must
    be active (404), cannot remove self (400), memberId required (400).
  - `POST /api/circles/:id/flush` — jSTF full circle flush.  All active
    members except the executing steward removed.  Auth + steward gate.
  - `POST /api/circles/:id/disband` — steward disbands the circle.
    All roster moved to former, circle marked Archived.
  - `POST /api/circles/:id/drift-check` — checks all active members
    against circle primary mandate.  Members with Ws < threshold and
    top domain outside mandate moved to former for 'competence-drift'.
    Auth + steward gate, circle must have primary mandate domains.
  - `POST /api/circles/:id/check-expiry` — checks active members against
    `system_settings.steward_term_months`.  Expired members moved to
    former for 'term-expiry'.  Auth + steward gate.
  - `resignCircle` / `removeMember` / `flushCircle` / `disbandCircle` /
    `driftCheck` / `checkExpiry` added to `SolisApi`.
  - `renderCircleMembership()` renders active/former stewards with Ws,
    domains, departure reasons, service periods.
  - Membership modals for resign, remove, flush, disband with confirm
    dialogs.  Steward action buttons (remove, flush, disband, drift
    check, expiry check) on circle detail.
- Verified headlessly (18 checks): login (3 users), resign gates
  (401/400), mt resign 200; remove gates (401/403/400/400), sd remove
  200; non-steward drift 403, drift check 200; expiry gates (401),
  expiry check 200 (5 expired, 12mo term); mt former with resignation,
  sd former with jstf-removal, roster state verified.
- Harness deleted; DB re-seeded.
