**Governing the Solarian Commons**

*A Technical Document — Fourth Edition*

> *This edition adds the Vote Weight System and the AI Drafter in full,
> and records the reasoning that produced them. Where this document is
> silent, the Third Edition governs; where the Third Edition is silent,
> the Second.*

**Preamble to the Fourth Edition**

Two systems are specified here for the first time: how a vote’s weight
is actually computed, and how a resolution is drafted before anyone
votes on it. Both exist to answer the same underlying problem — that
deliberation is vulnerable to whoever happens to hold the pen.

If one participant in a deliberation cell drafts the resolution and then
votes on it, that person has disproportionate influence over the
outcome, regardless of their domain competence. Every other participant
must read the draft warily, alert to framing, emphasis, and the trick
words that make an argument's disagreeable parts unobtrusive. A drafting
process that removes that single point of authorship, and a weighting
process that removes manual control over whose voice counts more,
address the same vulnerability from two directions.

**XVI. The Vote Weight System**

Every vote cast on a resolution carries weight proportional to the
voter’s competence in the domains the resolution actually concerns. This
section specifies how that weight is computed.

**Standing and competence**

Each participant holds a Standing value per domain — a number from 0 to
3000 representing their perceived competence in that domain at the
current time. Standing begins equal to the participant’s verified
competence declaration and drifts afterward based on activity,
endorsements, and the outcomes of assessments they are subject to.
Standing is the figure used in vote-weight calculations; the original
declared and verified values remain on record but are not what a live
vote uses.

**Domain shares**

A resolution is attached to one or more domains — the areas of Commons
life it actually bears on. Each attached domain is assigned a share of
the resolution’s total weight, reflecting how central that domain is to
the matter at hand. Shares are not divided equally by default and are
not set by any participant. They are assigned by the AI Drafter (Section
XVII) based on its analysis of the resolution text, and they sum to one
across all attached domains.

> **Example:** *a resolution on debris-liability might carry shares of
> Space Law 0.38, Liability 0.35, Remote Sensing 0.27 — reflecting that
> the matter is most centrally a legal one, substantially a liability
> question, and only partly a remote-sensing concern.*
>
> **Fallback:** *if domain-share assignment fails for any reason, the
> system falls back to equal shares across attached domains, so a vote
> can always proceed.*

**Computing a voter’s effective weight**

For each domain attached to the resolution, a voter’s weight in that
domain is their Standing in that domain multiplied by the domain’s
share. Their total effective weight on the resolution is the sum of that
product across every attached domain. The resolution’s outcome is then
the ratio of effective weight cast for each option to the total
effective weight cast.

A participant with high Standing in a domain that carries a small share
of the resolution contributes less than a participant with moderate
Standing in a domain that carries most of the share. Weight follows
relevance, not raw competence alone.

**Why shares are not user-editable**

Allowing participants to set or adjust domain shares would allow exactly
the manipulation the system exists to prevent — a participant strong in
one domain inflating that domain’s share to inflate their own vote.
Assigning shares by AI analysis of the resolution text, rather than by
any interested party, is what makes the weighting resistant to that
manipulation. Recourse against a share that seems wrong exists through
the redraft mechanism (Section XVII), not through direct editing.

**XVII. The AI Drafter**

The AI Drafter exists to solve a specific problem: a deliberation with a
single human drafter creates a single point of disproportionate
influence, however competent or well-intentioned that drafter is. They
hold the pen; everyone else must read their draft warily, watching for
framing choices, selective emphasis, and language that quietly favours
their own preferred outcome. Removing a single named author from the
drafting step, and replacing manual domain-share assignment with the
same impartial process, closes that gap from both directions at once.

**What it does**

Within a deliberation cell, the AI Drafter reads the original proposal
and the full accumulated discussion, and produces a resolution: a title,
a full text with numbered clauses, a resolution type (Policy,
Resolution, Declaration, or Report), suggested implementing circles, and
the domain shares described in Section XVI. Each deliberation cell holds
exactly one resolution at a time. The Drafter creates it on request and
can redraft it a limited number of times as discussion continues.

**Generating the first draft**

Any participant in the cell may request a first draft once none exists.
The Drafter receives the original proposal text, the full deliberation
transcript to date, and the domains the cell has attached. It returns a
complete resolution, which is created as version one and opened for the
cell to review.

**Redrafting**

As discussion continues after a first draft exists, any participant may
request a redraft. This is deliberately not automatic or unilateral — it
is bounded by three controls, each aimed at preventing the redraft
mechanism itself from becoming a new vector for manipulation.

A maximum number of AI redrafts applies per resolution, configurable in
system settings, beyond which no further redraft may be generated for
that resolution. A cooldown period must elapse between redrafts,
preventing rapid successive redrafting in search of a favourable
version. And a redraft does not execute on a single participant’s
request — it requires a confirmation quorum, a fraction of the cell’s
participants who must each separately confirm that a redraft is
warranted, before the Drafter runs again.

Any change to the resolution — whether a manual edit or an AI redraft —
nullifies any votes already cast. This is irreversible by design: once
the text a vote was cast on has changed, that vote no longer applies to
what the resolution now says, and must be recast.

**Human editing remains available**

The Drafter does not remove human judgement from the process — it
removes single-authorship. Once a draft exists, participants with
editing standing may still revise it directly. What the Drafter prevents
is any one participant being the sole origin of the text that others
must then vote on. The draft always starts from an impartial synthesis
of the actual discussion, and any subsequent human edit is visible,
versioned, and nullifies existing votes exactly as a redraft would.

**Domain classification beyond deliberation**

The same underlying classification engine that assigns domain shares to
resolutions is used wherever the Commons needs an impartial read of what
a piece of content actually concerns — including the domain-tag
suggestions described elsewhere in this document for discussions and
undertakings. Centralising this in one classification capability, rather
than building a separate ad hoc mechanism each time domain relevance
needs judging, keeps the standard for impartiality consistent across the
Commons.

**Future direction: automatic domain-weight seeding**

A related idea, currently low priority, is to use the same
classification capability to auto-suggest a participant’s initial domain
weights at registration or at credential update — reading a submitted
CV, publication, or credential and proposing competence declarations
across relevant domains before the participant fills them in by hand.

This is deliberately deprioritised. It is closer to a convenience
feature than a structural necessity, and the classification cost of
parsing arbitrary submitted documents at registration scale is high
relative to the benefit. The core impartiality problem — keeping
resolution drafting and domain-share assignment free of manipulation —
is what justified building the classification capability in the first
place. Extending it to registration convenience can follow later, if it
proves worth the cost, but is not part of the system’s present scope.

> ***No one drafts alone.\
> No one weighs their own vote.\
> The same impartial read governs both.***
>
> *The pen is not held by any one hand.\
> The scale is not set by any one voice.*

*Governing the Solarian Commons · Fourth Edition · Solis · 2026*

*This edition adds to the Third Edition. Where silent, prior editions
govern in descending order.*
