# Modal Design

**Status: implementation truth (v2). Supersedes `docs/modal-design.md`.**

## 1. Two modal systems coexist

| System | CSS | Used by |
|--------|-----|---------|
| Shared overlay | `css/platform.css:714-729` (`.modal-overlay`, `.modal-content`, `.modal-sm/md/lg/full`) | Members modal, Project Cell modals, Evidence modal, Circle Settings, Organisation Settings, vSTF invite, xSTF invite |
| Legacy reg-modal | `css/platform.css:765-774` (`.reg-modal*`) | Registration modal, report modal, some legacy flows |

The shared modal is JS-injected (`shared/modal.js:19-42`); the legacy
modal is DOM-toggled. Escape closes the shared modal (`shared/modal.js:10-12`).

## 2. Base structure (shared modal)

```html
<div class="modal-overlay active">
  <div class="modal-content modal-md">
    <div class="modal-titlebar">
      <span class="modal-titlebar-title">Title</span>
      <button class="modal-titlebar-btn" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">…</div>
  </div>
</div>
```

Size classes: `modal-sm` (480px), `modal-md` (640px), `modal-lg` (720px),
`modal-full` (95vw × 90vh). Base: `max-width:680px; height:80vh`
(`css/platform.css:768`).

## 3. Settings-as-proposals (core principle)

Settings changes are **never applied directly**. All settings flow
through proposal → deliberation → resolution → aSTF → auto-apply.

1. Steward opens Settings Modal and fills in proposed values.
2. "Submit as Proposal" creates a Deliberation Cell with a
   `settingsSnapshot` (`index.html:7858`, `6453`, `6572`).
3. Deliberation Cell displays snapshot as a read-only diff.
4. Resolution renders snapshot as editable form — stewards can adjust
   during deliberation.
5. Vote passes → resolution + snapshot go to aSTF for blind adjudication.
6. aSTF approves → `applySettingsSnapshotServer` (server-side, this
   session) applies settings + logs to governance ledger. Client
   `applySettingsSnapshot` is a fallback only.

## 4. Settings snapshot schema

```json
{ "type": "system" | "circle" | "org", "target": "stf" | "quorum" | "circles" | "deliberation" | "new" | "<circle-id>" | "<org-id>", "status": "pending" | "approved" | "rejected", "settings": { ... } }
```

System settings persist only `stf.*` keys to the DB; circle settings
persist name/status/description/term_override/expiry_override; org
settings apply client-side only.

## 5. Resolution modal (deliberation)

- Vote buttons: **Approve (Resolution)** / **Revision Request** /
  **Reject** (`index.html:3666-3668`).
- Rubric: Jurisdiction 9 / Depth 5 / Alignment 10 / Competence 6
  (motion); Due diligence 9 / Justice 9 / Proportionality 6 /
  Integrity 6 (judicial).
- Quorum bar: `N/M voted · QRM X · not met · Yea NN% · >50%`.
- Mandate legend: `+ primary (1.5×) · ! no mandate (0.25×) ·
  unmarked = secondary (1.0×)`.
- Malpractice flagging: optional per-participant checkboxes.
- Save Draft button persists; Auto Redraft button in titlebar.

## 6. Members modal (`openMembersModal`)

Three sections: Active / Succession Queue / Former. Status values:
`active`, `former`, `candidate`. Detail panes: domain overlap,
competence bars, mandate, departure reason, timeline.

- Derives from the **open circle** (not hardcoded).
- Succession queue shows application date, motivation, queue position.
- Motivations visible to that circle's stewards and the applicant only.
- Candidates can withdraw their own application at any time.

## 7. Circle Cell view

Restricted to circle members. Shows proposals, resolutions, activity,
domains, competence map, members, STFs. Non-members see a locked
notice.

## 8. Tab system

Tabs use `switchSettingsTab` / `switchCircleSettingsTab` /
`switchOrgSettingsTab` / `switchGovTab` / `obsSwitchTab`. States:
default grey / hover grey bg / active gold (`css/platform.css:443-445`).

## 9. Tab size + CSS

- Tab bar: `height:32px` (`css/platform.css:440`).
- Button scales: `.btn-xs` 7px, `.btn-sm` 9px, `.btn` 10px,
  `.vote-btn .vb-label` 14px.
- Modal CSS spans `css/platform.css:713-784`.

## 10. Notes

- Escape closes the shared modal (`shared/modal.js:10-12`); the legacy
  `.reg-modal` has no Escape handler.
- `+ New Cell` button is wired to `newCircleCell()` (steward-gated).
- `btn-direct-proposal` is steward-gated and hidden otherwise.
