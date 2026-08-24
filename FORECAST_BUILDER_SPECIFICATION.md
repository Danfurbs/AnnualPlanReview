# Task: Rebuild the Forecast Builder as Engineer → Standard Job → Work Group Set

Repo: `Danfurbs/AnnualPlanReview`.

## Implementation status

**Status date: 24 August 2026**

-   **Phase 1 --- implemented and regression-tested on the preview branch,
    awaiting deployment safety gate.** The FY-relative, current-ownership
    discovery layer and isolated planning metadata persistence are implemented
    with frontend and PostgreSQL service coverage. The additive database table
    is created by the existing idempotent schema initialisation; it does not
    migrate forecast records.
-   **Phase 2 --- implemented and corrected on the preview branch.** A separately labelled,
    read-only Forecast Builder Preview now shows the selected planning FY,
    engineer queue, explicit All / Not Forecasted / Forecasted filters,
    progress, Standard Job cards, manual Standard Job addition, and the manual
    Forecasted workflow. Planning status persists independently from RF
    Reviewed and does not write forecast values.
    The engineer queue is now scoped exclusively through the organisation
    hierarchy to the dashboard's selected Delivery Unit; a concrete Delivery
    Unit is required, and stale engineer selection, navigation, search,
    filters, discovery caches, and metadata actions all use that same scoped
    set. Changing Delivery Unit changes presentation context only and does not
    rewrite or remove forecast or planning metadata. At widths up to 900px the
    engineer buttons remain one keyboard-accessible, horizontally scrollable
    row contained within the preview rather than widening the document.
    Evidence loading is also implemented one FY at a time, with V0, V1, and
    Work Done loaded concurrently within that FY, stale-request protection,
    compact per-year evidence maps, cached engineer queues, and visible
    spinner, FY progress, progress bar, and read-only reassurance.
-   **Phases 3--5 --- not started.** Standard Job expansion, V0 inputs,
    Standard-Job saving, Planning Context/copy-forward, and profile charts are
    not available in the preview yet.
-   **Phase 6 --- not authorised.** The current Forecast Builder remains the
    production workflow alongside the clearly labelled preview and must not be
    retired without the product owner's explicit confirmation.

At this break, the dashboard has a new **Forecast Builder Preview** action.
Opening it shows the read-only Phase 2 planning queue; the current Forecast
Builder remains available from both the dashboard and the preview header. The
next implementation break will add Phase 3 expansion, V0 Work Group Set inputs,
comments, and explicit per-Standard-Job saving.

This replaces the current Work-Group-Set-first Forecast Builder
(`forecast-editor.js`, Forecast Builder section of `index.html`) with a
new **Engineer → Standard Job → Work Group Set** planning workflow.

The rebuild exists to fix a real omission risk: Standard Jobs delivered
by an unexpected Work Group Set can be missed when planning starts from
the Work Group Set perspective. For example, an OLE-labelled Standard
Job may actually have been delivered by an Off Track Work Group Set. The
new workflow should start with the engineer, build a defensible queue of
Standard Jobs from recent history, and then show the relevant Work Group
Sets underneath each job.

## Critical rollout and data-preservation constraint

This rebuilt Forecast Builder is the standard mechanism for constructing
V0 for **one selected future financial year at a time**.

FY28 is expected to be the first production cycle using the new
workflow, but **FY28 must not be hard-coded anywhere in the
implementation**. The same workflow must work for FY29, FY30, and later
years by deriving all planning and history windows from the financial
year selected by the user.

This rebuild is a **new way of discovering and editing the selected FY's
V0**, not a migration of historical forecast data.

Hard constraints:

-   Do not migrate, rewrite, normalize, compact, reinterpret, or
    otherwise modify V0/V1 forecast records belonging to financial years
    earlier than the selected planning FY to support this feature.
-   Do not change V1/Reforecast persistence or editing as part of this
    work.
-   Existing V0/V1 forecasts, comments, RF review comments/statuses,
    Work Done, and Work Order corrections must remain readable and
    unchanged.
-   Prefer the simplest additive implementation that preserves the
    existing data model and derives behaviour from the selected FY
    rather than calendar-specific constants.
-   Do not introduce compatibility complexity solely to support
    partially built V0 plans created in the old Forecast Builder. The
    first production use is expected to begin with a new annual planning
    cycle.
-   Any new planning-workspace metadata such as manually-added jobs or
    `Forecasted` flags must be isolated from forecast values and must
    not require destructive changes to existing forecast tables.

**This is a large feature. Build and land it in the phases below, each
as its own commit/PR, in order.** Do not attempt this as one large
change.

The earlier V0/V1 work required many follow-up fixes because related
changes were landed in large batches. Phase 1 in particular must be
correct and fully tested before UI work is built on top of it.

### Parallel preview and retirement approval

Phases 1--5 must be built alongside the current Forecast Builder rather
than replacing it in place. Expose the rebuilt workflow through a clearly
labelled **Forecast Builder Preview** route/navigation entry, and provide
an obvious way back to the current Forecast Builder. The current builder
must remain available and operational throughout preview testing.

Both builders use the same canonical forecast records; the preview is not
a second forecast store and must not duplicate or migrate forecast data.
Keep the new screen/controller isolated from the current builder UI where
practical so it can be enabled, disabled, or rolled back without changing
the existing workflow.

Phase 6 is optional and requires the product owner's explicit approval.
Passing automated tests, completing Phases 1--5, or making the preview
available does not by itself authorise removal of the current builder.

## Out of scope for this entire prompt --- do not touch

-   V1/Reforecast editing. It remains in Standard Job Breakdown.
-   Dashboard Work Group Set / Engineer / Delivery Unit / portfolio
    views.
-   RF review workflow and existing `Reviewed` status.
-   Work Done upload financial-year changes.
-   Historical forecast-data migration.
-   V1 sparse-writer redesign.
-   Reporting Period / Auto-cutoff redesign.
-   Authentication, review packs, and other unrelated roadmap items.

------------------------------------------------------------------------

# Core business rules for this rebuild

## Financial-year behaviour

-   The user explicitly selects the FY whose V0 is being constructed.
-   The builder writes only to that selected FY's V0.
-   It must not assume the selected FY is the newest FY in the database.
-   Previous FYs are read-only historical/planning evidence in this
    workflow.
-   The automatic discovery window is always selected FY minus 1, minus
    2, and minus 3.
-   All older available FYs may be viewed as history but do not
    automatically seed the queue.
-   A future FY starts with its own independent Forecasted flags and
    manually added planning-queue metadata.

## V0 semantics

The Forecast Builder is **V0-only**.

V0 is the Original Approved Plan being constructed for the new financial
year.

**Blank and zero are equivalent in V0.**

There is no V0 inheritance layer beneath V0, so do not import V1's
missing-versus-explicit-zero semantics into this screen.

-   Blank V0 period = `0`.
-   Explicit V0 `0` = `0`.
-   Positive value = planned volume.
-   Negative values remain invalid under the existing forecast rules.

Do not redesign V0 persistence to make it sparse merely because V1 is
sparse. The missing/explicit-zero distinction belongs to V1/Reforecast
only.

## Planning status

Do not reuse the RF `Reviewed` status.

Introduce a separate manual planning flag named **Forecasted**.

`Forecasted` means:

> I have considered this Standard Job for this financial year's V0 plan.

Rules:

-   It is set only by an explicit **Mark Forecasted** action.
-   Opening, closing, editing, or saving a job must not set it
    automatically.
-   A Standard Job remains editable after being marked Forecasted.
-   Subsequent V0 edits do not automatically clear the Forecasted flag.
-   Persist it by **Financial Year + Engineer + Standard Job**.
-   A new financial year starts with no jobs marked Forecasted.
-   It must not alter or interact with RF `Reviewed`, comments, V0
    values, V1, or organisation ownership.

Engineer progress is derived only from these flags:

**X of Y Standard Jobs forecasted**

No separate engineer-complete flag is required. `Y of Y` is sufficient.

Sidebar filters should be:

-   All
-   Not Forecasted
-   Forecasted

Do not infer an `In Progress` state.

------------------------------------------------------------------------

# Phase 1: Inclusion-logic data layer + tests --- no UI

This phase fixes the omission problem. Get it right and fully tested
before building UI.

## Automatic planning-window rule

For the **selected planning financial year**, automatically seed the
planning queue from the **three immediately preceding financial years**.

Derive this window from the selected FY. Do not hard-code specific FY
labels.

Example only: FY28 planning examines FY27, FY26, and FY25; FY29 planning
examines FY28, FY27, and FY26.

Any one of those three years may independently qualify a Standard Job
for the queue. A job with activity only in FY25 must still appear in
FY28 even if it had nothing in FY26 or FY27.

Older years do **not** cause automatic queue inclusion, but remain
available later in History.

## `getStandardJobsForEngineer(engineerId, currentYear)`

Return the union of Standard Jobs supported by evidence against Work
Group Sets **currently owned by the selected engineer**, using current
ownership from `organisation-data.js`.

A Standard Job qualifies if any current Work Group Set owned by the
engineer has, in any of the previous three FYs:

1.  A final effective forecast: V1 where amended, otherwise V0. Reuse
    `getEffectiveForecastJob`; do not reimplement V0/V1 merge logic.
2.  Corrected Work Done.
3.  A forecast comment/comment-only record, even if there was no
    forecast volume or Work Done.
4.  More than one of the above.

Also include:

5.  Any current-year V0 data/comment that already exists, for
    robustness.
6.  A Standard Job explicitly added to this engineer's current-year
    planning queue.

### Current ownership wins

Historical ownership must not control the new planning queue.

If Work Group Set ABC belonged to Engineer A in FY25/FY26 but currently
belongs to Engineer B for FY28 planning, its historical evidence should
seed **Engineer B's FY28 queue only**.

Do not duplicate the same evidence into both engineer queues because of
historical ownership.

## Manually added Standard Jobs

Provide planning metadata for a manually-added Standard Job, scoped to:

**Financial Year + Engineer + Standard Job**

Requirements:

-   The entry survives reload/restart.
-   Adding the job does **not** itself create V0 values or comments.
-   It starts as **Not Forecasted**.
-   Adding a job immediately increases that engineer's progress
    denominator.
-   Provide **Remove from Forecast Builder** only for manually-added
    jobs that still have no V0 data and no comments.
-   Removing from the planning queue deletes only the queue metadata; it
    must never delete forecast data.
-   If V0 data or comments exist, block removal rather than risk hiding
    meaningful planning data.

## `getWorkGroupSetsForStandardJob(jobNumber, engineerId, currentYear)`

For a Standard Job in the selected engineer's section, return the Work
Group Sets **currently owned by that engineer** that have qualifying
evidence.

Use the same three-year inclusion window for automatic rows.

A current engineer-owned Work Group Set qualifies if it has any of:

-   Current-year V0 volume or current-year V0 forecast comment.
-   Prior-three-year final effective forecast.
-   Prior-three-year corrected Work Done.
-   Prior-three-year comment-only forecast evidence.
-   A manually-added current-year row, if such lightweight row metadata
    already fits naturally into the implementation.

### Important display rule

Entering an engineer's section should normally show **that engineer's
Work Group Sets only**.

Do not automatically display every Work Group Set across all disciplines
under the job.

The omission bug is fixed because a cross-discipline Work Group Set's
history causes the Standard Job to appear under **that Work Group Set's
current engineer**, not because all Work Group Sets are shown under
every engineer.

## Reason tags

Tag each returned Standard Job and Work Group Set with its inclusion
reasons, for example:

-   recent forecast
-   recent Work Done
-   comment-only
-   current V0
-   manually added
-   multiple reasons

The UI can use these as lightweight context badges, and tests can assert
why an item is present.

## Phase 1 tests

Write isolated tests for:

-   inclusion via final effective forecast only;
-   inclusion via corrected Work Done only;
-   inclusion via comment-only evidence only;
-   inclusion via FY-3 evidence where FY-1 and FY-2 are empty;
-   exclusion where there is no qualifying evidence in the three-year
    window;
-   multiple simultaneous inclusion reasons;
-   the original regression case: a Standard Job whose nominal
    discipline differs from the Work Group Set that historically
    delivered it;
-   Work Group ownership change: historical evidence follows the set to
    its current engineer only;
-   manually-added Standard Job persistence;
-   removing an untouched manually-added job;
-   blocking removal once V0 data/comments exist;
-   correct Work Group Set filtering to the selected engineer.

**Acceptance criteria:** Phase 1 returns correct, reason-tagged,
ownership-safe results across all fixture scenarios before Phase 2
begins.

------------------------------------------------------------------------

# Phase 2: Read-only screen shell + Forecasted workflow

Build the screen structure using real Phase 1 data before enabling V0
editing.

The supplied visual mock-up is directional rather than a pixel-perfect
contract. Preserve the application's current theme, terminology, and
component conventions, while using the mock-up's useful overall hierarchy:
engineer navigation, expandable Standard Job cards, an in-context profile,
and Work Group Set rows. Prefer a more usable or accessible interaction
where it meets the same planning need. In particular, do not copy mock-up
labels that conflict with the Forecasted rules below.

## Engineer sidebar

Include:

-   Engineer search.
-   Filters: **All / Not Forecasted / Forecasted**.
-   Each engineer row shows:
    -   `X of Y Standard Jobs forecasted`
    -   a small progress bar.
-   Previous / Next Engineer navigation.

No inferred In Progress state.

## Standard Job card list

For the selected engineer, show Standard Jobs in SJN ascending order.

Each collapsed card should show:

-   SJN
-   description
-   unit
-   current FY V0 total
-   number of attached Work Group Sets
-   useful history badges/reason tags
-   **Forecasted / Not Forecasted** chip

Include a prominent **+ Add Standard Job** control for genuinely new
work with no qualifying history.

## Forecasted action

Each Standard Job must have an explicit **Mark Forecasted** / equivalent
toggle.

Rules:

-   Manual only.
-   Persists by FY + Engineer + Standard Job.
-   Does not lock the job.
-   Does not change when the user merely opens/closes the card.
-   Does not reset after later V0 edits.
-   Does not interact with RF Reviewed.

If an engineer is 18/18 Forecasted and a new Standard Job is added,
progress immediately becomes 18/19 until the new job is explicitly
marked Forecasted.

**Acceptance criteria:** engineer progress and filters reflect only the
persisted manual Forecasted flag and remain correct across reloads and
engineer switching.

------------------------------------------------------------------------

# Phase 3: Expand/collapse + V0 Work Group Set grid + Standard Job save

## Work Group Set grid

Expanding a Standard Job card shows rows from
`getWorkGroupSetsForStandardJob(...)`.

Columns:

-   Work Group Set
-   P1--P13
-   Total
-   Comments
-   Planning Context / History
-   relevant source badges

P1--P13 are editable V0 number inputs.

Preserve useful Excel-paste behaviour across a row.

## V0 blank/zero behaviour

For this screen:

**blank = zero**

Do not introduce V1-style sparse semantics to V0.

It is acceptable for the persisted V0 representation to contain zeros
where the current V0 storage model expects them.

The critical safeguard is instead:

-   never write to V1;
-   never reinterpret historical V1 records;
-   never modify other Standard Jobs simply because this job was saved.

## Comments

Current-year V0 forecast comments remain entered against the individual
Work Group Set using the existing forecast-comment storage shape.

Do not add a new Standard-Job-level V0 forecast comment field.

There is no separate `No requirement this FY` flag at Work Group Set
level.

If a historically relevant Work Group Set has no requirement this year,
its V0 can remain zero. Any useful explanation is recorded in its
comment. The Standard Job's manual Forecasted flag records that the
overall job has been considered.

## + Add Work Group Set

This is a deliberate failsafe.

Although the normal grid only shows the selected engineer's current Work
Group Sets, **+ Add Work Group Set must search all active Work Group
Sets**, without discipline filtering.

This covers:

-   organisation-data errors;
-   ownership changes that have not yet been updated;
-   unusual delivery arrangements.

Adding another engineer's Work Group Set here must **not** change
organisation ownership.

If entering V0 data/comments against that exceptional Work Group Set
naturally makes it remain visible under the current engineer using the
existing data model, preserve that behaviour.

Persist an added exceptional row as lightweight planning-workspace metadata
scoped by **Financial Year + Engineer + Standard Job + Work Group Set** so
that an untouched row survives reload. This metadata is only a visibility
association for the selected planning workspace: it must not change
organisation ownership or create forecast values/comments. An untouched
association may be removed without affecting business data; once V0 data or
comments exist, removing the association must never delete those records.

Do not turn this lightweight association into a shadow ownership or
engineer-override model. Current ownership remains authoritative for normal
automatic discovery and organisational reporting.

## Save Standard Job

Do not auto-save each cell and do not save each Work Group Set
separately.

Provide one explicit **Save Standard Job** action covering all V0 edits
and current-year forecast comments made within that Standard Job.

Requirements:

-   The user may edit several Work Group Set rows and comments before
    saving.
-   The job profile chart may update live from unsaved in-memory values.
-   Saving should be atomic at Standard Job scope where the existing
    backend architecture permits: all changes for that Standard Job save
    successfully or none are committed.
-   If saving fails, keep the user's unsaved edits/comments in the UI so
    they can retry without re-entering the job.
-   Do not roll back or affect other Standard Jobs.
-   Saving does not automatically mark the job Forecasted.
-   Marking Forecasted does not replace the need to save changed V0
    data.
-   Warn about unsaved changes before switching FY, switching engineer,
    leaving the page, or otherwise discarding the expanded job's unsaved
    work.

Prefer the smallest safe backend change necessary to support
Standard-Job-level saving. Do not turn this into a broad
forecast-persistence rewrite.

**Acceptance criteria:** multiple Work Group Set edits for one Standard
Job save together, failure does not lose the user's in-browser edits, V1
is untouched, and no other Standard Job is modified.

------------------------------------------------------------------------

# Phase 4: Historical planning context + copy-forward

Each Work Group Set row gets an expandable **Planning Context** area.

This replaces the need for a large standalone comments subsystem.

Its purpose is to answer two planning questions directly beside the
values being entered:

1.  **Why did we forecast these volumes in the past?**
2.  **Why did Work Done differ from forecast, and should that change our
    expectation this year?**

## History window

The automatic planning queue uses only the previous three FYs.

Once a job/Work Group Set is open, however, the Planning Context may
show **all available historical FYs**.

Older years are reference only and must not cause current queue
inclusion.

Load older history efficiently/lazily where practical rather than
rendering every historical record for every job upfront.

## Historical numerical context

For each available prior FY show:

-   final effective forecast total: V1 where amended, otherwise V0;
-   corrected Work Done total;
-   Work Done coverage:
    -   `through Pn`
    -   `full year`
    -   `not uploaded`

These states must be explicit. A real zero and `not uploaded` are
different.

## Historical comments

Make historical comments easy to access within Planning Context.

Include relevant existing comments tagged at:

-   **Delivery Unit**
-   **Engineer**
-   **Work Group Set**

Also include their source where available:

-   V0
-   V1 / Reforecast
-   RF3
-   RF6
-   RF9
-   RF11

Each item must clearly show:

-   Financial Year
-   tag/scope
-   source/stage

Work Group Set-specific comments should be the most prominent, with
Engineer and Delivery Unit comments shown as broader context.

Historical comments are read-only.

Do not automatically copy old RF commentary into the current FY.

Do not create a new comment type for this feature; this is a read view
over existing comment data.

A lightweight **View all comments for this Standard Job** aggregation
may be added if it falls naturally out of the same component, but do not
build a separate large comments application purely for this.

## Copy Forecast

For a selected historical FY:

-   copy that year's **final effective forecast** into the current V0
    row;
-   final effective forecast means V1 where explicitly amended,
    otherwise V0;
-   do not copy the old year's original V0 when a later effective
    forecast exists.

Automatically add a current V0 Work Group Set comment such as:

`Copied from FY26 final effective forecast.`

## Copy Work Done

Copy a complete 13-period planning profile:

-   for historical periods where corrected Work Done exists, copy
    corrected Work Done;
-   for remaining periods without Work Done coverage, fill from that
    FY's final effective forecast.

Example source comment:

`Copied from FY26 corrected Work Done through P8, with P9-P13 populated from FY26 final effective forecast.`

This makes the source and blend transparent.

## Which historical years can be copied

If it is straightforward using the same History component, allow Copy
Forecast and Copy Work Done from **any historical FY shown**.

If supporting arbitrary older years materially complicates the
implementation, limit copying to the previous three FYs initially while
still allowing older history to be viewed.

Do not add architecture solely for arbitrary-old-year copying.

## Work Group Set renames

Historical rows use the current Work Group Set name.

Do not build point-in-time/versioned name resolution for old years.

## No Dismiss state

Do **not** add a Dismiss action for stale comment-only rows.

Historical comment-only evidence is intentionally visible. If it is
irrelevant this year, leave V0 at zero and add a current comment only if
useful.

**Acceptance criteria:** Planning Context gives the planner enough
information to understand both historical forecast rationale and
forecast-vs-actual variance without leaving the Forecast Builder; copy
actions populate V0 and leave an automatic source comment.

------------------------------------------------------------------------

# Phase 5: Standard Job profile chart

Provide one chart per Standard Job card, combining the Work Group Sets
currently shown in that engineer's Standard Job.

Use a **line chart**.

## Default view

Show:

-   current FY V0 being built as the primary series;
-   immediately preceding FY as the default historical reference series.

The current FY V0 series should update live from unsaved grid edits
without a page reload.

## Historical reference profile

For a prior FY, build a blended reference line:

-   corrected Work Done for periods actually reported;
-   final effective forecast for periods after Work Done coverage ends.

Do not present the blended line as though it is all one data type.

Add a clear visual transition/marker, similar to the existing Standard
Job Breakdown graph, showing:

**Work Done ends here → Forecast begins here**

If historical Work Done is full year, show it as full-year Work Done
with no forecast tail.

If Work Done was not uploaded, show the effective forecast profile and
clearly indicate that no Work Done was available.

## Show all history

Provide **Show all history** to overlay all available prior FYs on the
same chart.

The three-year automatic queue window does not limit History; older
years may be shown when the user deliberately requests them.

Do not replace or reset the current FY series when history is toggled.

**Acceptance criteria:** editing V0 updates the current-year line live;
historical lines correctly blend Work Done and forecast; the Work
Done-to-Forecast transition is visually obvious; Show all history adds
older years without affecting current edits.

------------------------------------------------------------------------

# Phase 6: Optional retirement of the old Work-Group-Set-first Forecast Builder

Do this **only after Phases 1--5 are working and tested and the product
owner has explicitly confirmed that the preview is accepted**. This must be
a separate retirement commit/PR. Do not infer approval from preview usage,
automated test results, or completion of earlier phases.

Remove from the Forecast Builder UI specifically:

-   the old Work-Group-Set-first entry screen;
-   the Plan V0/V1 selector;
-   `Select Work Groups to copy to V1`;
-   `Reset current Work Group from V0`;
-   any Forecast Builder wording suggesting that V1 must be created from
    V0.

Do not assume the underlying functions are unused elsewhere.

Before removing shared functions, confirm whether Standard Job
Breakdown, dashboard, imports/exports, or other screens still depend on
them.

The Standard Job Breakdown's V1/Reforecast editing must remain
unaffected.

Run its existing tests and confirm they still pass unchanged.

**Acceptance criteria:** explicit product-owner approval is recorded; the
old construction UI no longer exists; the new Engineer → Standard Job →
Work Group Set V0 builder is the only Forecast Builder entry workflow; a
tested rollback path exists; and existing V1/Reforecast functionality
remains intact.

------------------------------------------------------------------------

# Cross-phase test and delivery requirements

After **every phase**, not only at the end:

-   run `node --test tests/*.test.js`;
-   run `npm test` in `backend/`;
-   run any relevant browser/E2E tests available for the changed
    workflow;
-   confirm existing V1/Reforecast tests still pass;
-   confirm historical FY data is not rewritten.

Land each phase as its own commit/PR.

Do not proceed to the next phase with failing tests or unresolved
data-loss risks.

Before Phase 6 removes the old UI, run an end-to-end new-FY planning
scenario using test fixture years rather than hard-coded production FY
identifiers:

1.  Select a planning FY and an engineer.
2.  Confirm the queue contains a job qualifying only from the third
    prior FY.
3.  Confirm a cross-discipline historical job appears under the current
    owner of the Work Group Set.
4.  Manually add a genuinely new Standard Job.
5.  Add a Work Group Set from outside the engineer's normal ownership
    using the unrestricted failsafe search.
6.  Enter V0 across multiple Work Group Sets.
7.  Add/edit current-year Work Group Set comments.
8.  Inspect historical forecast, Work Done, and DU/Engineer/Work Group
    Set comments.
9.  Copy a prior final effective forecast.
10. Copy a partially completed historical Work Done profile and verify
    the forecast tail is used.
11. Confirm the automatic source comments are created.
12. Confirm the graph updates before save and clearly marks historical
    Work Done-to-Forecast transition.
13. Save the Standard Job.
14. Reload and confirm V0/comments persisted.
15. Mark the Standard Job Forecasted and confirm progress updates.
16. Edit it again and confirm Forecasted remains set.
17. Confirm all FYs earlier than the selected planning FY remain
    unchanged.
18. Confirm Standard Job Breakdown V1 editing still behaves exactly as
    before.

The overriding goal is:

> Make new-FY V0 construction easier to reason about and much harder to
> omit work, while preserving the existing forecast model and historical
> data rather than redesigning them.
