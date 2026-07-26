# Modal Design Decisions

**Version:** 2.0
**Last updated:** 26 July 2026

---

## Modal System Overview

Solis uses a unified modal system with consistent structure, sizing, and interaction patterns. All modals share base CSS classes and behaviour.

---

## Modal Inventory

| Modal | ID | Size | Purpose |
|-------|-----|------|---------|
| Registration | `reg-modal` | 680px, 80vh | 3-step registration or profile edit |
| Participant Detail | `pd-modal` | 640px, 80vh | View member profile |
| Resolution | `resolution-modal` | 720px, 80vh | View/edit/vote on resolution (one per cell) |
| System Settings | `settings-modal` | 640px, 80vh | STF, Quorum, Deliberation config |
| Circle Settings | `circle-settings-modal` | 640px, 80vh | Circle config, Mandate Domains |
| Members Modal | (inline) | full | Circle steward roster |

---

## Base Structure

All modals follow this HTML pattern:

```html
<div class="reg-modal-overlay" id="[modal-id]">
  <div class="reg-modal" style="max-width:[size]px">
    <button class="reg-modal-close" onclick="close[Modal]()">&times;</button>
    <div class="reg-modal-body">
      <div class="reg-modal-title">Title</div>
      <!-- Content -->
    </div>
  </div>
</div>
```

---

## Sizing Rationale

### Why 680px default?

- Fits comfortably on 1024px screens (smallest common desktop)
- Leaves ~340px on each side for the overlay background
- Large enough for forms with 2-column grids (`.form-grid`)

### Why 720px for Resolution modal?

- Resolution text textarea needs more horizontal space
- Vote breakdown table requires 6 columns
- Implementing circles need room for toggle pills

### Why 80vh height?

- Prevents modal from extending beyond viewport
- Enough space for multi-step forms (registration)
- Body scrollable if content exceeds height

---

## Tab System

Settings modals use a tab bar with consistent styling:

```html
<div class="settings-tab-bar">
  <div class="settings-tab active" onclick="switchTab(0,this)">Tab 1</div>
  <div class="settings-tab" onclick="switchTab(1,this)">Tab 2</div>
</div>
<div class="settings-tab-content" id="settings-tab-0">...</div>
<div class="settings-tab-content" id="settings-tab-1" style="display:none">...</div>
```

### Tab States

- **Default:** grey text, no background
- **Hover:** grey text, light grey background
- **Active:** gold text, gold-soft background, gold bottom border

### Why tabs instead of accordion?

- Cleaner visual hierarchy
- Easier to scan all available sections
- Consistent with mobile patterns

---

## Vote UI Design

### Vote Buttons

Three buttons: Yea (green), Nay (red), Abstain (grey)

- Default: border only, no background
- Selected: colored background matching vote type
- Disabled state: 0.4 opacity, pointer-events none

### Vote Summary Bar

Compact horizontal bar showing:
- Yea percentage
- Nay percentage
- Abstain percentage
- Quorum count

### Why percentages instead of raw Ws?

- Easier to understand at a glance
- Raw Ws values can be confusing (e.g., "4,960 Yea Ws")
- Percentages immediately convey the ratio

### Why quorum in the summary?

- Quorum is the critical pass/fail condition
- Users need to see both the ratio AND whether enough people voted
- Prevents passing a resolution with low participation even if ratio is high

---

## Domain Weighting Display

### The Note

Below the vote buttons, a gold-bordered note explains:
> **Domain weighting:** Each attached domain receives an equal share of influence. Effective vote weight = Ws ÷ N domains.

### Why inline documentation?

- Users need to understand why their vote weight might differ from their Ws
- The equal-share model is non-obvious without explanation
- Future AI weighting will change this, so the note will update

### Why in the modal only?

- Full documentation lives in `docs/vote-weight-system.md`
- The modal note is a brief reminder, not the full explanation
- Keeps the UI clean while providing context

---

## Settings Split

### System Settings (sidebar gear)

Contains system-wide configuration:
- STF composition and durations
- Quorum thresholds
- Deliberation defaults

**Rationale:** These affect all circles and all deliberation cells. They are not circle-specific.

### Circle Settings (per-circle button)

Contains circle-specific configuration:
- Circle name, status, description, max members
- Mandate domains with desired Ws

**Rationale:** Each circle has its own mandate, membership limits, and domain requirements. These should not be mixed with system-wide settings.

### Why separate modals?

- Clear mental model: "system = global", "circle = local"
- Prevents confusion about what affects what
- Allows different permission models in the future (system admin vs circle steward)

---

## Co-Stewards List Modal

### Invocation

Open from Circle Home page (Co-Stewards card) via `openMembersModal()`. Shows all stewards and succession candidates for a circle.

### Structure (split-pane, full size)

**Left panel — Member list** (3 sections):
1. **Active** (`roster.active`) — currently serving stewards
2. **Succession Queue** (`circleApplications` where `status === 'pending'`) — candidates waiting for vacancies
3. **Former** (`roster.former`) — previously serving stewards

**Right panel — Detail view:**
- Active member: Ws, domains, mandate overlap, competence bars, activity history
- Succession candidate: name, initials, applied date, motivation, queue position, withdraw button (self only)
- Former member: tenure, departure reason, timeline

### Status Values

| Status | Meaning |
|--------|---------|
| `active` | Currently serving steward |
| `former` | Previously served, no longer a member |
| `candidate` | In the succession queue (applied to join) |

- No `invited` status exists for circles — candidates apply, they are not invited
- Membership = stewardship = all privileges (no roles within circles)

### Succession Flow

1. User applies to join circle → `status: 'pending'` in `circleApplications`
2. When a seat opens, system runs vSTF evaluation on pending candidates
3. Top evaluated candidate automatically takes the steward post
4. Candidate can withdraw from the queue at any time
5. No approval/rejection by stewards — fully automatic

### CSS Architecture

### Why backdrop blur?

### Why box-shadow instead of border?

---

## CSS Architecture

### Shared Classes

- `.reg-modal-overlay` — fixed fullscreen backdrop with blur
- `.reg-modal` — the modal container with shadow and animation
- `.reg-modal-close` — close button with hover state
- `.reg-modal-body` — scrollable content area
- `.reg-modal-title` — display font title

### Why backdrop blur?

- Creates visual separation from the page content
- Modern UI pattern (iOS, Material Design)
- Reduces visual clutter behind the modal

### Why box-shadow instead of border?

- Creates depth and hierarchy
- Softer visual appearance
- Consistent with card-based design

---

## Animation

### Modal Open

```css
@keyframes modalIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- 0.2s ease
- Subtle upward slide + fade
- Draws attention to the modal

### Why not scale animation?

- Scale can feel jarring on large modals
- TranslateY is more subtle and professional
- Consistent with the rest of Solis's animation style

---

## Future Considerations

### Mobile Responsiveness

- On screens < 768px, modals should go full-width
- Tab bars should scroll horizontally
- Vote buttons should stack vertically

### Keyboard Navigation

- Tab trap within the modal
- Escape key closes the modal
- Arrow keys navigate tabs

### Focus Management

- On open: focus the first input or the close button
- On close: restore focus to the triggering element
- Screen reader announcements for tab changes

---

## References

- `platform/css/platform.css` — Lines 740-760 (modal CSS)
- `platform/index.html` — Modal HTML blocks
- `to_prod.md` — Phase 5: Design System & Polish
