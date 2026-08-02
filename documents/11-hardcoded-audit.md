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
  header + vSTF candidate name/initials are now hydrated from `stfs`.
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
