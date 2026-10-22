# Solis Docs v2 — Implementation Truth

These documents describe the platform as it actually runs today. They
supersede `docs/` where the two conflict; `docs/` is retained as the
original design-intent record and is not being modified.

Every claim here was checked against `platform/api.php`,
`platform/index.html`, `platform/api-client.js`, `platform/mock-loader.js`
and `platform/db/*`. Cross-references between v2 docs use the same
filenames as the originals.

## Contents

1. [judicial-loop.md](judicial-loop.md) — report → verdict → closeout, jSTF/xSTF/aSTF, ripples, blindness matrix, identity doctrine.
2. [governance-model.md](governance-model.md) — circle membership, succession, applications, lifecycle, settings snapshots, governance events.
3. [stf-auto-evaluation.md](stf-auto-evaluation.md) — STF types as they actually exist (vSTF verification, aSTF/jSTF invitation pools, p-aSTF review).
4. [vote-weight-system.md](vote-weight-system.md) — vote math, mandate multipliers, quorum, `desiredWs`, data shapes.
5. [organisations.md](organisations.md) — org model, affiliation flow, knowledge domains, vote weight (none).
6. [modal-design.md](modal-design.md) — modal systems, settings-as-proposals, members modal, circle cell view.
7. [ai-drafter.md](ai-drafter.md) — resolution drafting, redraft, confirmation, vote nullification.
8. [ui-audit-visual.md](ui-audit-visual.md) — current visual audit state (fixed vs still-open, refreshed references).

## How to read

- Code references are `file:line` into the platform tree.
- "TRUE" means the code matches the claim; "MISLEADING" means a
  half-truth; "FALSE" means the code contradicts it.
- Where the original `docs/` doc differs, the v2 doc wins.
