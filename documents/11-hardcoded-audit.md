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
