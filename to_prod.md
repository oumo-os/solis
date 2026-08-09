# Solis Platform — From Current State to Production Ready

**Last updated:** 24 July 2026

---

## Current State

The platform is a plain HTML/CSS/JS single-page application with no build step, no backend, and no data persistence. It is a comprehensive UI shell with all major views, routing, modals, and static mock data. The architecture is intentionally lightweight — Solis runs on simple hosting, with no framework dependencies.

**What exists:**
- Full SPA routing with hash-based navigation
- 30+ views covering all platform sections
- Registration flow (3-step), profile editing
- Circle home, deliberation cells, STF views (vSTF, aSTF, p-aSTF, jSTF, xSTF)
- Resolution modal with version history, voting, and vote breakdown
- Members modal with active/former stewards, departure reasons, competence bars
- Domain map (SVG constellation)
- Observatory (news, calendar, library, publications)
- Settings modal with 4 tabs (Circle, STF, Quorum, Deliberation)
- System settings with mandate domains (primary/secondary) and desired competence values
- Circle health (p-aSTF results), competence map, domain activity bars
- Design system: tokens, typography (Inter, Playfair, IBM Plex), component library

**What does not exist:**
- Backend / API / database
- Authentication
- Data persistence
- Real-time updates
- Production build process
- Testing of any kind
- Accessibility compliance
- Error handling or loading states
- Browser history integration
- Mobile-optimised touch interactions beyond basic

---

## Phase 0: Critical Fixes (Week 1)

Before anything else, the existing codebase needs to be stable and correct.

### 0.1 — CSS Parse Error Fix
**File:** `platform/css/platform.css:539-555`

A missing `}` before line 542 causes `.blind-grid`, `.flow`, `.fstep`, `.farr`, `.page-title`, `.hrow`, `.accused-row`, `.vote-row`, `.check-row`, `.room-header`, `.room-body` to be parsed as children of the 450px media query, but they are applied at ALL widths. Fix the nesting.

### 0.2 — Undefined `--display` Font Token
**File:** `platform/css/platform.css`

`.modal-header` (line 721) and `.reg-modal-title` (line 731) reference `var(--display)` which is not defined in `:root`. Define it (e.g., `--display: 'Playfair Display', Georgia, serif;`) or replace with `--serif`.

### 0.3 — Sidebar Nav Contrast Fix
**File:** `platform/css/platform.css:43,40`

`.nav-item` text at `rgba(255,255,255,.45)` on navy `#0E1E34` fails WCAG AA (~2.8:1). Increase to `rgba(255,255,255,.65)` minimum. Same for `.member-meta` at `.35`.

### 0.4 — Remove Remaining "Standing" References
**Files:** `platform/index.html`

- Personal view metric cards: "Standing Ws" → "Competence (Ws)" or remove entirely
- Sidebar member card: "Standing 847" → "Ws 847"
- Personal view metric: remove or change to match data model (Ws is per-domain, not a single standing number)

### 0.5 — Data Source Consolidation
**Files:** `platform/index.html`, `platform/mock.json`

`membersData` (JS variable) and `mock.json` participants are separate and will drift. Either:
- (a) Load `mock.json` at runtime and derive all data from it, OR
- (b) Move all hardcoded member data to `mock.json` and reference it from JS

Recommend (a): keep `mock.json` as single source, derive `membersData` from `participants` array at runtime.

---

## Phase 1: Foundation (Weeks 2–4)

Establish the production infrastructure and core platform mechanics.

### 1.1 — Backend Architecture

**Decision: Serverless or monolith?**

Recommendation: **Supabase** (PostgreSQL + Auth + Realtime + Edge Functions) or **PocketBase** (single binary, SQLite, built-in auth). Both are lightweight and fit the project's ethos of simplicity.

**Core backend needs:**

| Service | Purpose | Notes |
|---------|---------|-------|
| Auth | Email + password, or magic link | No OAuth complexity. Solis values self-declared identity. |
| Database | PostgreSQL (or SQLite) | All entities from data model |
| Real-time | WebSocket subscriptions | For cell messages, inbox notifications |
| Storage | File uploads | Evidence documents, publications, deliverables |
| Edge Functions | Business logic | Vote calculation, competence drift, quorum checks |

**Database tables (from data model):**

```
participants
domains
domain_entries
domain_interests
circles
circle_members
circle_domains          (with primary/secondary + desired_ws)
cells
cell_members
messages
proposals
motions
resolutions
resolution_versions
resolution_votes
resolution_vote_domains (per-domain vote weights)
stfs
stf_members
stf_assessments
stf_competence_evals
activities              (audit trail)
undertakings
undertaking_members
organisations
publications
events
```

### 1.2 — Authentication  ✅ IMPLEMENTED (2026-08-08, hardened)

**Design decisions (implemented):**
- Email + password retained (magic-link infra intentionally deferred;
  self-declared identity without external email providers)
- Registration = identity creation (self-declared, no approval)
- Sessions: opaque 24h Bearer tokens in `auth_tokens` (no JWT)

**Hardening applied (2026-08-08):**
- scrypt password hashing (`scrypt$N$r$p$salt$hash`, node:crypto), legacy
  sha256 hashes auto-upgraded on next successful login
- Rate limiting on login/register (10 / 15 min per IP → 429 + retryAfter)
- `users.failed_attempts` brute-force ledger (reset on success)
- Token expiry pruning on login; logout revokes the presented token
- CORS preflight for /api/* (`SOLIS_ORIGIN`, default *)

**Open (follow-ups, not blocking):**
- Magic-link flow (revisit when a mail provider exists)
- Password reset flow (out of scope for self-declared identity v1)

### 1.3 — Data Layer

**Replace all mock data with real database queries.**

For each view, define the data requirements:

| View | Data Source | Query |
|------|------------|-------|
| Personal | `participants` + `circle_members` + `activities` | Current user's profile, circles, recent activity |
| Inbox | `activities` + `cell_members` | Notifications for current user |
| Discussions | `messages` (tier 1) + `domains` | Public discussions, filtered by feed type |
| Circles | `circles` + `circle_members` | List with member counts, status |
| Circle Home | `circles` + `circle_members` + `cells` + `resolutions` + `activities` | Full circle context |
| Cells | `cells` + `cell_members` | User's active cells |
| STF Dash | `stfs` + `stf_members` | User's assignments + org-wide active STFs |
| Participants | `participants` | Public directory |
| Observatory | `publications` + `events` | Public knowledge space |

### 1.4 — API Design

REST API with these resource groups:

```
POST   /auth/magic-link
POST   /auth/verify

GET    /participants/me
PUT    /participants/me
GET    /participants/:id

GET    /domains

POST   /circles
GET    /circles
GET    /circles/:id
PUT    /circles/:id
GET    /circles/:id/members
POST   /circles/:id/members
DELETE /circles/:id/members/:pid

POST   /cells
GET    /cells/:id
GET    /cells/:id/messages
POST   /cells/:id/messages

POST   /proposals
GET    /proposals/:id
POST   /proposals/:id/crystallise

POST   /resolutions
PUT    /resolutions/:id
POST   /resolutions/:id/vote
GET    /resolutions/:id/votes

POST   /stfs
GET    /stfs/:id
POST   /stfs/:id/confirm-members
POST   /stfs/:id/assessment

GET    /activities?circle=:id&participant=:id

POST   /publications
GET    /publications
GET    /publications/:id

GET    /events
GET    /events/:id
```

### 1.5 — Real-time Subscriptions

| Channel | Trigger | Purpose |
|---------|---------|---------|
| `cell:{id}:messages` | New message in cell | Live chat in circle/project/deliberation cells |
| `resolution:{id}:votes` | New vote cast | Live vote updates |
| `inbox:{user_id}` | New notification | Live inbox updates |
| `stf:{id}:status` | Status change | STF progress updates |

---

## Phase 2: Core Platform Mechanics (Weeks 4–8)

Implement the actual governance mechanics.

### 2.1 — Registration & Profile

**Registration flow (3 steps):**
1. **Basic info:** Name, location, bio, avatar (initials-based, generated from name)
2. **Competence declarations:** For each domain: Wh (hard competence 0–3000), evidence URL, type (knowledge/affiliation/experiential)
3. **Interest ranking:** Rank up to 10 domains by priority (drag to reorder)

**Profile page:**
- Domain metrics chart (Ws/Wh/Interest per domain)
- Circle membership list
- Recent activity feed
- Competence declarations with verification status
- Interest ranking with edit link

**Data model for competence:**
```
participant_domain {
  participant_id
  domain_id
  wh: number          // declared competence (0–3000)
  ws: number          // perceived competence (= wh initially, drifts later)
  evidence: string    // URL or text
  verified: boolean   // true after vSTF
  declared_at: timestamp
}
```

### 2.2 — Domain System

**Domain types:**
- Knowledge (academic/professional)
- Affiliation (organisations)
- Experiential (practical experience)

**Domain operations:**
- Domains are created by the Knowledge & Observatory steward circle
- Each domain has: name, type, level, parent (if nested), active flag
- Participant declares domains with competence weights
- Interest is ranked independently

**Domain Map:**
- SVG constellation showing all domains as stars
- Star size = member count
- Twinkling animation
- Click to view domain details
- Filter by type (knowledge/affiliation/experiential)

### 2.3 — Circles

**Circle lifecycle:**
1. A circle forms around a shared interest (community circle)
2. If it takes on a mandate, it becomes a steward circle
3. Circle has: name, mandate, domains (primary/secondary with desired Ws), members (co-stewards)
4. Circle settings: quorum thresholds, STF durations, deliberation defaults, max members

**Circle Home (public-facing):**
- Circle profile, status, founding date
- Domain activity bars
- Circle cells (motions)
- STF cells
- Resolutions (enacted, failed)
- Activity feed
- Sidebar: health, competence map, co-stewards, domains, related discussions

**Circle Cell (private workspace):**
- Proposals list
- xSTFs list
- Deliverables
- Cell messages (all recorded, restricted to members)

### 2.4 — Discussions (Commons)

**Discussion flow:**
1. Any participant posts a Tier 1 discussion  ✅ compose box wired (`composePost`, 2026-08-08)
2. Participants reply, like, endorse  ✅ replies persist (`POST /api/threads/:id/replies`)

**Discussion features:**
- Compose box with domain tags, file attachment, link — domain tag/link/attachment UI only (no backend fields yet); type selector preserved
- Feed filters: My Feed, Circle Mentions, Endorsed, All
  ✅ all four wired (2026-08-09) — My Feed = own posts + posts in
  my domains, Circle Mentions = circles in body/title/author, Endorsed =
  count > 0, empty states per filter
- Post cards with: author, domain tags, title, body, engagement — like
  ✅ persisted (toggle + `PATCH /api/threads/:id`), reply → opens thread
  detail (persisted), share → copy-link toast; endorse ✅ persisted
  (per-user `thread_endorsements`, `POST/DELETE /api/threads/:id/endorsement`,
  count recomputed server-side), bookmark ✅ persisted (per-user
  `thread_bookmarks`, `POST/DELETE /api/threads/:id/bookmark`), per-user
  state hydrated via bootstrap `myEngagements`
- Pinned posts  ✅ pin/unpin wired (2026-08-09) — steward-gated
  (`POST/DELETE /api/threads/:id/pin`, 403 for non-roster users), pinned
  threads float to the top of the feed (stable order within groups),
  ★ pin icon + gold ⚑ toggle on each card

### 2.5 — Proposals

**Proposal origins:**
1. Discussion thread → steward proposal (links back to source thread)
   ✅ `POST /api/threads/:id/raise-proposal` (2026-08-09) — steward-gated
   (403), creates a Deliberation Cell (`commons-thread` origin, thread
   title/excerpt/author recorded), 409 on re-raise; thread detail shows
   raise action / raised-chip with "Open deliberation"; origin card
   carries "View source discussion" back-link to the thread
2. Direct steward proposal (no preceding thread)
3. System-bound proposal (settings or circle profile changes)

**Proposal lifecycle:**
1. Steward creates proposal in circle cell
2. Proposal enters deliberation cell
3. Deliberation cell has: participating circles, deliberation guide, draft resolutions
4. Participants discuss, draft resolutions
5. Resolution is drafted and voted on
6. If passes → submit to aSTF for blind adjudication
7. If fails → close debate, record as failed resolution

### 2.6 — Deliberation Cell

**Layout:** Split (1fr main + 300px sidebar)

**Main content:**
- Proposal origin card (source thread or direct proposal)
  ✅ commons-thread origin card renders title/excerpt/author + "View
  source discussion" back-link (2026-08-09); other origin card families
  already shipped
- Deliberation feed (chat-style messages)
- Decision status bar (quorum, vote result, submit/close buttons)

**Sidebar:**
- Participating circles (with self-disqualification ghost scars)
- Deliberation guide
- Draft resolutions (list, each clickable to open modal)

**Resolution modal (full overlay):**
- Title field
- 20-row textarea (dominant)
- Action field (free text with autofill presets) + implementing circles
- Version history (collapsible)
- Accept checkbox: "I confirm this resolution as drafted accurately reflects the deliberation"
- Vote buttons: Yea / Nay / Abstain (inline row)
- Per-domain vote breakdown (expandable, horizontal voter chips)
- Save button (nullifies existing votes)

**Voting mechanics:**
- Each member's vote weight = their Ws intersection with deliberation domains
- Per-domain breakdown shows: domain name, Yea Ws, Nay Ws, Total, individual voters
- Aggregate: total Yea Ws vs total Nay Ws across all domains
- Quorum: minimum participants + minimum % of members + pass threshold

### 2.7 — Motions & aSTF

**Motion lifecycle:**
1. Resolution passes deliberation cell vote
2. Submit to aSTF → spawns blind cell
3. aSTF audits the motion in isolation (30-point rubric)
4. aSTF verdict: Resolution (approved) or Rejection (denied)
5. If approved → opens xSTF for execution

**aSTF rubric (30 points):**
- Jurisdiction (0–9): Does the circle have mandate authority?
- Depth & Effort (0–5): Was deliberation substantive?
- Alignment & Conflict (0–10): Does decision advance org tenets? Undisclosed conflicts?
- Competence (0–6): Were the right people in deliberation?
- Malpractice flags (separate): Participant IDs flagged for jSTF pre-referral

### 2.8 — xSTF (Execution)

**xSTF lifecycle:**
1. Commissioned by the circle that produced the resolution
2. Blind execution cell with team members
3. Produces deliverable per commissioning circle specs
4. Deliverable reviewed by commissioning circle
5. Published to Observatory if approved

### 2.9 — vSTF (Verification)

**vSTF types:**
1. **Steward Candidacy:** Evaluate candidate for circle stewardship
   - Auto-match: candidate Ws vs circle requirements
   - Assessor judgment: approval score (0–100) + rationale
   - Multiple assessors, independent

2. **Competence Claims:** Verify participant's domain competence
   - Per-domain evaluation: claimed Wh vs adjusted Wh
   - Evidence review
   - Assessor comments

### 2.10 — p-aSTF (Periodic Review)

**Two-layer rubric:**

**Layer 1: Circle rubric (30 pts)**
- Circle activity (0–6)
- Circle competence fit (0–7)
- Circle discipline (0–6)
- Circle cohesion (0–5)
- Circle delivery (0–6)

**Layer 2: Member rubric (35 pts + 2 risk flags)**
- Member effectiveness (0–5)
- Member stewardship (0–7)
- Member participation (0–5)
- Member investment (0–8)
- Member productivity (0–6)
- Member role fit (0–4)

**Risk flags:**
- Replaceability (0–5, >3 triggers knowledge-transfer mandate)
- Indispensable (0–5, >3 triggers jSTF pre-referral)

**Health tier:** healthy / watch / concern

### 2.11 — jSTF (Judicial Investigation)

**Trigger:**
Any member can report any member. Report surfaced as anonymous post to Commons, visible to stewards. Any steward can sponsor, activating jSTF.

**jSTF powers during investigation:**
1. Restrict reported user activity (suspend steward privileges, limit participation)
2. Select punitive action (must cite policy precedent)
3. Push disciplinary motion → goes to aSTF for audit

**Resolution types:**
- System-bound: remove from circle, trigger fresh vSTF, freeze Ws
- Non-system disciplinary: applied per policy resolutions cited as precedent

**Key principle:** aSTF never sees jSTF members — audits the decision, not the people.

### 2.12 — Membership & Stewardship

**One role, no hierarchy.** Everyone in a circle is a steward.

**Ways a steward loses title:**
1. Term expiry
2. Resignation
3. jSTF forced removal
4. jSTF full circle flush
5. Circle disbandment
6. Involuntary by competence drift (Ws changed or circle mandate changed)

**Membership modal:**
- Active stewards list with Ws, domains, last active
- Former stewards with departure reason and service period
- Per-member detail: mandate overlap, competence bars (primary domains), history timeline

---

## Phase 3: Competence & Weight System (Weeks 6–10)

The competence weight system is the mathematical backbone of Solis.

### 3.1 — Ws (Perceived Competence)

**Initial state:** Ws = Wh (declared competence)

**Drift mechanisms:**
- Activity increases Ws
- Inactivity decreases Ws
- Endorsement by domain steward increases Ws
- vSTF verification locks Wh, Ws may drift
- p-aSTF may adjust Ws based on actual performance

**Per-domain Ws:**
- Each participant has Ws per domain
- Ws is used for vote weighting in deliberation cells
- Ws determines circle competence fit in p-aSTF

### 3.2 — Wh (Hard Competence)

**Declared by participant:**
- Domain + Wh value (0–3000)
- Evidence URL or text
- Verified by vSTF

**Levels (by type):**
- Affiliation: Affiliate → Member → Representative → Leadership
- Knowledge: None → Elementary → Highschool → Self-taught → Bachelors → Masters → PhD → Professional → Expert
- Experiential: Explored → Familiar → Experienced → Fluent → Native → Professional

### 3.3 — Interest Score

**Ranked priority total:**
- Each participant ranks up to 10 domains by interest
- Rank #1 = 10 points, #10 = 1 point
- Interest score = weighted sum of interest ranks

### 3.4 — Standing

**Total standing = sum of all Ws values across all domains.**

Used for:
- Circle competence fit calculation
- Vote weighting (intersection of Ws with deliberation domains)
- p-aSTF member rubric inputs

---

## Phase 4: Observatory & Public Space (Weeks 10–12)

### 4.1 — News
- Curated space sector coverage
- Filtered by domain
- Updated by Knowledge & Observatory steward circle
- Public access (no login required)

### 4.2 — Calendar
- Global launches, conferences, deadlines
- Domain-tagged
- Import from external sources (API or manual)

### 4.3 — Library
- Books, courses, podcasts, career guides, tools
- Domain-categorised
- Curated by stewards

### 4.4 — Publications
- Essays, reports, analysis from participants
- Tier 2 (requires steward approval for public display)
- Linked to domain, author, date
- Public access

### 4.5 — Organisations
- Affiliated organisations
- Their events, publications, members
- Independent governance within the Commons

---

## Phase 5: Design System & Polish (Weeks 8–14)

### 5.1 — Component Library

Formalise the existing ad-hoc components into a documented system:

| Component | Status | Notes |
|-----------|--------|-------|
| Button | ✅ Exists | `.btn`, `.btn-primary`, `.btn-sm`, `.btn-ghost`, `.btn-danger` |
| Card | ✅ Exists | `.card`, `.card.click` |
| Badge | ✅ Exists | 8 variants (active, pending, review, enacted, rejected, judicial, drift, vol) |
| Tag | ✅ Exists | 6 colour variants + default |
| Status Pill | ✅ Exists | deliberating, drafting, finalising, active, concluded |
| Modal | ✅ Exists | sm, md, lg, full |
| Tab Bar | ✅ Exists | `.settings-tab-bar`, `.feed-filters` |
| Progress Bar | ✅ Exists | `.progress`, `.htk` |
| Avatar | ✅ Exists | sm, md, lg, xl + gold, system, square |
| Vote Button | ✅ Exists | yea, nay, abstain states |
| Cell Card | ✅ Exists | With status pills |
| Activity Item | ✅ Exists | Dot + text + timestamp |
| Inbox Item | ✅ Exists | Unread state |
| Metric Card | ✅ Exists | Label, value, sub, drift |
| Bar Chart | ✅ Exists | Single, dual, multi-bar |
| Competence Bar | ✅ Exists | Desired vs actual |
| Domain Activity Bar | ✅ Exists | Mandate vs adjacent |
| Health Card | ✅ Exists | Tier + rubric scores |
| Insight Box | ✅ Exists | Gold accent |
| Vote Table | ✅ Exists | Per-domain breakdown |
| Blind Grid | ✅ Exists | Assessor slots |
| Evidence Shelf | ✅ Exists | Document items |
| Court Record | ✅ Exists | Red accent |
| Reviewer Checklist | ✅ Exists | Rubric dimensions |

### 5.2 — Responsive Design

Current breakpoints: 1320px, 900px, 768px, 480px

**Improvements needed:**
- Modal-full: increase padding on mobile
- Sidebar: ensure proper stacking on tablet
- Tables: horizontal scroll on mobile (currently `overflow-x` not set)
- Vote table: needs horizontal scroll on narrow screens
- Registration form: ensure inputs are properly sized on mobile

### 5.3 — Dark Mode

Not required for production, but the design tokens are structured to support it:
- Replace `--bg`, `--surface`, `--text`, etc. with dark values
- The navy sidebar already demonstrates dark-on-light inverted layout
- Domain map is already dark-themed

### 5.4 — Animation

Current animations:
- `fadeIn` on view switch ✅
- `modalIn` on modal open ✅
- `dmHintPulse` on domain map hint ✅

**Add:**
- Vote button selection feedback
- Status pill transition on state change
- Progress bar animation
- Card hover transitions (currently just border, could add subtle scale)

---

## Phase 6: Testing (Weeks 12–16)

### 6.1 — Unit Tests

Test the core business logic (once backend exists):
- Vote weight calculation (Ws × domain intersection)
- Quorum check
- Competence drift algorithm
- aSTF rubric scoring
- p-aSTF health tier calculation
- Motion lifecycle state machine

### 6.2 — Integration Tests

- Registration flow: complete 3 steps, verify data persisted
- Discussion → Proposal → Deliberation → Motion → aSTF → xSTF flow
- Vote casting and resolution passing
- Circle membership: join, leave, removal
- STF assignment: invitation → confirm → assessment → completion

### 6.3 — Accessibility Tests

- WCAG AA contrast on all text (fix sidebar nav, member-meta)
- Keyboard navigation: tab through all interactive elements
- Focus management in modals (trap focus, restore on close)
- ARIA labels on all icon-only buttons
- Screen reader testing

### 6.4 — Performance

- Lazy load views (currently all views are in the DOM at once)
- Optimise SVG domain map for large datasets
- Image compression for publications/avatars
- Database query optimisation (indexes on foreign keys, participant lookups)

---

## Phase 7: Deployment & Infrastructure (Weeks 14–18)

### 7.1 — Hosting

**Frontend:** Static hosting (Netlify, Vercel, Cloudflare Pages, or GitHub Pages)
- Simple, no build step needed
- Hash-based routing works without server-side configuration

**Backend:** Serverless or small VPS
- Supabase (managed) or PocketBase (self-hosted)
- If PocketBase: single binary on a $5/mo VPS

### 7.2 — Domain & SSL

- `solis.oumo.dev` or `soliscommons.org`
- SSL via Let's Encrypt or Cloudflare
- DNS managed via Cloudflare

### 7.3 — CI/CD

```
.git push → GitHub Actions →
  1. Lint (if any linting is added)
  2. Test (if any tests are added)
  3. Deploy frontend to static host
  4. Run database migrations (if applicable)
```

### 7.4 — Monitoring

- Uptime monitoring (BetterUptime or UptimeRobot)
- Error tracking (Sentry or similar)
- Basic analytics (Plausible or Umami — privacy-focused)

### 7.5 — Backup

- Database: daily automated backups
- File storage: versioned backups
- Git: GitHub is already the backup for code

---

## Phase 8: Launch Preparation (Weeks 16–20)

### 8.1 — Content Seeding

- 10–20 founding participants with realistic profiles
- 3–5 active circles with domain mandates
- 5–10 discussion threads
- 2–3 active deliberation cells
- 1–2 enacted resolutions
- 1–2 completed STFs
- Observatory: 10+ publications, 20+ library items, 15+ calendar events

### 8.2 — Documentation

- **README.md:** Project overview, how to run locally
- **CONTRIBUTING.md:** How to contribute (code, content, governance)
- **GOVERNANCE.md:** How circles work, how decisions are made
- **PRIVACY.md:** Data handling, cookies, analytics
- **TERMS.md:** Terms of participation

### 8.3 — Founding Stewards

Recruit 5–10 founding stewards across different domains:
- Space Law
- Astrophysics
- Remote Sensing
- Policy & Advocacy
- Education & Outreach
- Finance & Economics

Each founding steward:
- Declares competence
- Ranks interests
- Joins or forms a circle
- Begins the first deliberations

### 8.4 — Soft Launch

- Invite-only for first 2 weeks
- 50–100 participants
- Gather feedback on UX, bugs, confusing flows
- Iterate on critical issues

### 8.5 — Public Launch

- Remove invite restriction
- Announce on social media, space communities, university mailing lists
- Submit to Hacker News, Product Hunt, or similar
- First public Observatory publication: "Why the Solarian Commons Exists"

---

## Timeline Summary

| Phase | Weeks | Focus |
|-------|-------|-------|
| 0 | 1 | Critical CSS/design fixes |
| 1 | 2–4 | Backend, auth, data layer |
| 2 | 4–8 | Core platform mechanics |
| 3 | 6–10 | Competence & weight system |
| 4 | 10–12 | Observatory & public space |
| 5 | 8–14 | Design system & polish |
| 6 | 12–16 | Testing |
| 7 | 14–18 | Deployment & infrastructure |
| 8 | 16–20 | Launch preparation |

**Estimated time to production:** 20 weeks (5 months)

---

## Open Questions

1. **Backend choice:** Supabase vs PocketBase vs custom? (Affects auth, realtime, file storage)
2. **Domain map data:** How many domains at launch? (Affects SVG performance)
3. **File storage:** Where do evidence documents and publications live? (Supabase Storage vs S3 vs IPFS)
4. **Email:** Magic link delivery — which provider? (Resend, Postmark, or Supabase built-in)
5. **Legal:** Terms of service, privacy policy — are these needed before launch?
6. **Moderation:** Who handles the initial jSTF investigations before aStewards are elected?
7. **Domain creation:** Who creates new domains? Knowledge & Observatory steward circle, but how does that work before the first circle is elected?

---

## Non-Goals for v1

These are explicitly out of scope for the initial production launch:

- Mobile app (iOS/Android)
- Dark mode
- Internationalisation / multi-language
- AI-powered recommendations
- External API integrations
- Blockchain or crypto
- Gamification or leaderboards
- Advanced analytics dashboard
- Video/audio in cells
- External authentication (Google, GitHub, etc.)

---

## Principles to Maintain

These should guide every decision from here to production:

1. **No framework dependencies.** Plain HTML/CSS/JS. Solis should run on any static host.
2. **No corporate structure.** The Commons is a community, not a company.
3. **Self-declared identity.** No approval process for participation. No credentials.
4. **Transparency.** Everything is archived. What is not archived did not happen.
5. **Blind isolation.** STF cells operate blind. Members don't know each other during deliberation.
6. **One steward role.** No hierarchy. Mandate defines scope, not rank.
7. **Domain-mandated authority.** Steward authority is bounded by domain mandate.
8. **Privacy-respecting analytics.** Plausible or Umamo, not Google Analytics.
9. **No dark patterns.** No addictive design. No manipulation. Ultra hic et nunc.
10. **Simplicity over features.** If it can be simpler, it should be.
