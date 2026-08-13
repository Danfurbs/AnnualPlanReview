
Implementation Plan — No Changes Implemented
Executive conclusion
The business clarification materially narrows the earlier governance review. The application should remain a lightweight, mutable operational review tool built around:

V0 — Original Approved Plan, which may be corrected.

A single sparse V1/Reforecast layer, continuously usable throughout the year.

Corrected Work Done through a manually selected reporting period.

V1 where explicitly present, otherwise V0, for future periods.

Existing stage-aware comments and binary Reviewed status, without approvals, immutable submissions, formal snapshots, workflow roles, action tracking, or notification machinery.

This supersedes the governance review’s recommendations for immutable RF-stage submissions, stage-to-period mapping, structured mandatory commentary, approval workflow, materiality thresholds, and separate EAC terminology. The governance review correctly identified several calculation and clarity defects, but its proposed governance architecture is not the target operating model. The application’s existing operational navigation, drill-down, PostgreSQL persistence, comments, review status, and Work Order corrections should be retained. 

No files, database records, or schemas were changed during this review.

1. What Already Behaves Correctly and Should Be Left Alone
1.1 Financial-year and V0/V1 separation
The forecast storage model is already keyed by financial year and plan version, and the PostgreSQL forecast rows retain the required Standard Job, Work Group, FY, plan version, period, and value dimensions. That is compatible with the clarified annual model and does not need a forecast-submission or RF-stage dimension. 

The governance review’s proposal to add immutable stage/submission entities should therefore be rejected. The business rules explicitly state that V1 is a continuously usable amendment layer, not an RF6-only plan, and that immutable numerical RF snapshots are not required. 

Leave unchanged
Separate V0 and V1 plan-version keys.

Separate forecast data per financial year.

No V2/V3 version tree.

No RF-stage key on forecast rows.

No stage-specific forecast snapshot tables.

No “submission”, “approval”, or “reopened forecast” entities.

1.2 Effective V1 inheritance logic
The read-time merge function already implements the most important clarified rule correctly:

V0 values are copied into an effective projection.

Stored V1 periods overlay V0 periods.

Property presence, rather than truthiness, distinguishes a missing value from explicit zero.

Work Group aliases are normalized to avoid double counting. 

The effective forecast functions also resolve all jobs appearing in either V0 or V1, rather than requiring a complete copied V1 plan. 

The existing automated test expressly verifies that:

A missing V1 period inherits V0.

An explicit V1 zero remains zero.

Alias normalization does not add V0 and V1 together. 

Leave unchanged
Read-time effective V1 resolution.

Explicit-zero semantics in the merge function.

Work Group identity normalization.

V1 inheritance for jobs with no V1 record.

Existing raw-V1 access where the UI needs to indicate what was explicitly amended.

1.3 Manual-cutoff calculation once a period has been selected
The underlying cutoff helper already uses Work Done through the selected period and forecast afterward. It also correctly treats an explicit zero Work Done value as zero rather than falling back to forecast. 

The dashboard uses the selected cutoff as authoritative and ignores later Work Done when calculating the hybrid full-year Actual. This is consistent with the clarified rule that future or partial-period Work Done must not advance the completed reporting period. 

Leave unchanged
Work Done through the selected cutoff.

Forecast after the cutoff.

Ignoring future Work Done in the full-year Actual calculation.

The independence of RF stage and reporting period.

The ability to select any P1–P13 regardless of RF stage.

The defect is not the selected-period calculation; it is the continued availability and default use of Auto, addressed below.

1.4 Work Order corrections
The existing Work Order correction approach should remain. The UI:

Shows amended units.

Retains and displays the original value.

Allows a correction to be reverted.

Marks amended Work Orders.

Includes an amended Work Order export. 

The PostgreSQL persistence stores Work Order amendments separately from Work Done and updates that correction payload independently. 

Leave unchanged
The original-versus-corrected Work Order presentation.

Revert behavior.

Amended Work Order export.

Corrected values feeding the effective Work Done map and dashboard.

Retrospective correction of Work Done.

The existing absence of immutable “closed actual” snapshots.

1.5 Comments and review status
The existing low-friction comment UI aligns with the clarification: a user selects context, enters free text, and adds a comment without mandatory action/owner/due-date fields. 

The database already preserves comment context including FY, RF stage, delivery unit, Work Group, and engineer filters. The additional structured columns can remain nullable for backward compatibility, but should not become mandatory. 

Review status is already keyed by Standard Job, financial year, and RF stage, which is the correct isolation boundary for RF3/RF6/RF9/RF11 review completion. 

The existing UI offers only Reviewed/Needs Review and a “Mark Reviewed” action, matching the clarified binary review concept. 

Leave unchanged
Free-text comments.

Existing optional contextual tags.

Historical comments remaining visible.

Comments not being automatically copied into later RF commentary.

Binary Reviewed/Needs Review status.

FY- and RF-stage-specific review status.

Optional structured comment columns remaining nullable.

No Draft/Submitted/Approved/Reopened workflow.

No mandatory actions, owners, dates, drivers, evidence, or completion gates.

1.6 Operational drill-down and charting
The governance review correctly recognized the value of the existing multi-level dashboard and drill-down. The current breakdown supports overall, Work Group, and engineer scope, and aggregates data for the selected view before applying status. 

The cumulative graph separately obtains V0 and effective V1 periods and constructs the projected Work Done-plus-forecast line using the selected cutoff. 

Leave unchanged
Standard Job cards.

Engineer and Work Group filters.

Delivery Unit and portfolio roll-ups.

Work Group and Work Order drill-down.

The existing performance graph.

Independent RAG calculation from volumes aggregated at the active view.

V0 being available as supporting comparison.

Forecast comparison tooling.

1.7 Existing concurrency controls
Full forecast replacement uses an expected revision and locks/checks that revision before deleting or reinserting rows. A stale revision aborts before the replacement proceeds. 

Per-job forecast saves occur inside a transaction, and the browser uses the smaller per-job endpoint for breakdown edits rather than replacing a complete FY snapshot. 

These controls should be retained and expanded through tests, not redesigned during RF6.

2. What Needs Changing
Priority 0 — Safety tests and preservation controls before functional changes
Before changing runtime behavior:

Add characterization tests around all affected persistence and calculation paths.

Record production reconciliation counts for:

Forecast rows by FY and plan version.

Distinct Standard Job × Work Group × Period keys.

Explicit-zero V1 rows.

Forecast comments.

Job comments by FY/RF stage.

Review statuses by FY/RF stage.

Work Done snapshots by FY.

Work Order amendments.

Take and verify a restorable PostgreSQL backup.

Do not invoke any existing clear/delete-all forecast or Work Done operation during migration or rollout.

Put calculation/UI changes behind a short-lived rollout flag if deployment practice permits, so the RF6 user can revert presentation behavior without reverting stored data.

Deploy tests and server-side validation before changing the editor’s write representation.

This is necessary because the current full-save implementation intentionally deletes and reinserts the entire FY/version snapshot in one transaction. It is transactionally protected, but a representation bug in the payload could still replace valid V1 rows with unintended zeros. 

Priority 1 — Make V1 genuinely sparse at period level
Current problem
The effective merge is correct, but several write paths are not truly sparse.

updateForecastWorkGroup recreates the selected Work Group and writes every P1–P13 value, coercing missing/blank input to zero. Therefore, editing one period can materialize zero overrides for every other period and prevent those periods from inheriting later V0 corrections. 

The Standard Job breakdown editor similarly displays and saves all periods into the raw V1 Work Group object. Thus, its “Save Plan v1 override” action stores a complete Work Group period set rather than only the periods that differ from V0. 

Required change
Introduce a single canonical sparse-V1 write function:

At Standard Job × normalized Work Group × Period.

Compare an entered V1 value against V0.

Store the property if the user explicitly intends an amendment, including explicit zero.

Remove the property only when the user explicitly selects “inherit/reset to V0”.

Never infer “missing” from numeric zero.

Never create zero properties merely because other periods in the row were not edited.

Remove an empty Work Group container only after all its period overrides are gone.

Remove an empty job-level V1 record only when it has no remaining forecast amendments or V1-specific forecast comments.

Recalculate display totals from the effective projection, not from sparse raw V1 totals.

UI intent
Provide clearly separate actions:

Correct V0 — edits V0.

Reforecast / Correct V1 — edits the sparse V1 layer.

Inherit V0 or Reset this period to V0 — removes the V1 property.

An explicit numeric 0 remains “reforecast to zero”.

“Correct V1” does not require a separate data model; it is the same sparse V1 write path with clearer wording.

Compatibility requirement
Do not rewrite existing V1 records to “clean them up.” Existing fully populated V1 Work Groups may represent deliberate historical edits, copied V0 values, or explicit zeros, and there is no safe automated way to infer original intent. Treat every currently stored V1 property as explicit. New sparse semantics apply prospectively.

Priority 2 — Enforce non-negative forecast values on every write boundary
Current problem
The breakdown editor validates non-negative values, but the shared backend validator accepts any finite number. 

That means bulk imports, full saves, or direct API requests can still store negative V0 or V1 values.

Required change
Add shared validation tests first.

Reject negative values in:

V0 editor inputs.

V1 editor inputs.

Paste/bulk upload parsing.

JSON import.

Per-job API save.

Full forecast API save.

Return a descriptive 400 response identifying job, Work Group, and period.

Preserve explicit zero.

Do not silently clamp or convert negative values to zero.

A database constraint is recommended only after the legacy-data audit described in the migration section.

Priority 3 — Remove automatic reporting-period inference
Current problem
The UI defaults to Auto, and application logic resolves Auto to the maximum period containing Work Done. 

That directly conflicts with the authoritative rule that the reporting cutoff must always be manually selected and must never move based on Work Done.

Required change
Remove the Auto control and getMaxWorkDonePeriod() fallback from reporting calculations.

Require explicit reporting-period selection before rendering performance measures.

Never derive or change the period when Work Done is uploaded.

Keep reporting period separate from RF stage.

Do not default RF3→P3, RF6→P6, RF9→P9, or RF11→P11.

Display FY, RF stage, and reporting period together in dashboard headings, drill-down, exports, and later the review pack.

Label the control Reporting Period, not merely “Forecast starts after”.

Keep future-period Work Done available in Work Order detail but exclude it from Work Done-to-date and Actual until the reporting period advances.

The existing cutoff tests should remain; they validate the calculation after a manual period has been supplied. 

Priority 4 — Correct and centralize RAG behavior
Current problem
The current RAG logic uses strict > comparisons:

More than 10% becomes Amber.

More than 50% becomes Red.

As a result:

Exactly 10% is incorrectly Green.

Exactly 50% is incorrectly Amber. 

The zero-forecast/nonzero-Actual case returns noforecast, and the UI labels it as grey rather than the required Red. 

Required change
Create one pure, shared variance/RAG function used by job cards, summaries, top-ten lists, drill-downs, graphs where applicable, exports, and tests:

variance = Work Done − effective forecast for period-to-date.

Direction:

Negative: Under Delivery.

Positive: Over Delivery.

Zero: on plan.

RAG uses abs(variance) / forecast.

Green: < 10%.

Amber: >= 10% && < 50%.

Red: >= 50%.

Forecast 0 and Work Done 0: Green.

Forecast 0 and Work Done > 0: Red.

No absolute-volume materiality condition.

Aggregate forecast and Work Done volumes first, then calculate RAG for the active filtered view.

Never aggregate child colours into a parent colour.

Rename “Minor Variance”, “Critical”, and grey “No Forecast” labels where needed so they do not contradict the nationally defined thresholds.

Priority 5 — Separate the two required dashboard comparisons
The current internal a field is a hybrid series: Work Done through the cutoff and forecast afterward. That hybrid is valid under the clarified business definition of Actual, even though the governance review recommended calling it EAC. The rename-to-EAC recommendation must not be implemented. The governance review did, however, correctly identify that Work Done and the hybrid series are difficult to distinguish in the current presentation. 

Required dashboard measures
Prominently show both:

Period-to-date performance

Corrected Work Done for P1 through selected reporting period.

Latest effective forecast for those same periods.

Unit and percentage variance.

Under Delivery/Over Delivery.

RAG calculated from those aggregated period-to-date values.

Full-year position

Actual = corrected Work Done through reporting period plus latest effective forecast after reporting period.

Compare against full-year latest effective forecast.

Show unit and percentage variance.

Make the hybrid definition visible in the card/tooltip/subheading.

Supporting analysis should show V0 comparisons but not make V0 the default management benchmark once V1 amendments exist.

Implementation detail
Replace ambiguous generic f, a, wd, and v view-model use with named calculation outputs internally, while keeping storage unchanged:

effectiveForecastToDate

correctedWorkDoneToDate

effectiveForecastFullYear

actualFullYear

periodToDateVariance

fullYearVariance

This is a code/view-model refactor, not a data migration.

Priority 6 — Show annual V0-to-Reforecast movement
Add a visible bridge at the active scope:

V0 annual total.

Effective V1/Reforecast annual total.

Unit change.

Percentage change.

A clear zero-V0 denominator presentation, such as “N/A” plus unit change.

Calculate this from the pure annual V0 plan and effective sparse V1-over-V0 plan. Do not use child-colour aggregation, and do not require driver codes.

The existing comparison tooling already calculates V0 and V1 volumes and deltas at Work Group level, so it can be adapted rather than replaced. 

Priority 7 — Correct exports without removing existing formats
Required forecast exports
Retain separate, explicit exports for:

V0.

Reforecast.

Full portfolio.

Individual engineer.

Individual Work Group Set.

The current JSON export serializes whichever plan data it is given and identifies FY/version, which should remain available for compatibility. 

Add or correct the Reforecast business export so that every output cell is resolved as:

Through reporting period: corrected Work Done.

Future periods: explicit V1 where present.

Otherwise future V0.

Also retain:

Comments export.

Corrected Work Orders export.

Planned-versus-performance export.

Each export should state FY, RF stage where relevant, reporting period, export type, and generation timestamp. Do not replace all exports with a generic “latest truth” file.

Priority 8 — Clarify labels and editing actions
Targeted, low-risk label updates:

Plan v0 → V0 — Original Approved Plan.

Plan v1 (Updated) → V1 / Reforecast.

Forecast starts after → Reporting Period.

Over Delivered → Over Delivery.

Under Delivered → Under Delivery.

Explain Work Done and Actual adjacent to their displays.

Clarify that “Mark Reviewed” is review completion, not approval or freezing.

Clarify whether a field is editing V0 or adding/removing a V1 amendment.

The present labels still say “Plan v1 (Updated)” and instruct users to initialize V1 from V0, which incorrectly suggests V1 must be a copied complete plan. 

Priority 9 — Targeted modal refinements
Without a broad redesign:

Apply a body scroll lock while any modal is open.

Restore body scrolling only when the final open modal closes.

Keep the Standard Job Breakdown close/X control sticky and visible while its content scrolls.

Preserve keyboard focus behavior already present in editors.

Avoid altering modal content or operational workflows during RF6 unless required for calculation safety.

Priority 10 — Review pack after calculation stability
Implement the PDF review pack only after forecast, cutoff, dashboard, and RAG behavior is verified. It should include:

FY.

RF stage.

Reporting period.

Headline RAG and variance.

Work Done versus latest forecast.

Full-year Actual/outlook.

Relevant comments.

Reviewed/Needs Review context.

Existing performance graph.

Deliberate blank notes space.

This is desirable, but it must not delay the data-semantic fixes.

Deferred by authoritative business decision
Do not implement in this phase:

Forecast submissions or immutable RF snapshots.

Stage-to-period mappings.

Mandatory structured commentary.

Materiality by absolute unit volume.

Driver taxonomy.

Approval workflow.

Role-based authorization.

Comprehensive forecast edit audit.

Notifications/reminders.

Bulk review/action workflows.

Full Work Done source-file provenance architecture.

Wholesale accessibility/UI redesign.

Copy-prior-year-plan enhancements.

PDF review pack before core stability.

Complex authentication during the active RF6 stabilization work; basic authentication can be a later isolated change.

3. Database and Schema Migration Plan
3.1 Migrations not required for core V1 semantics
The existing forecast row grain can already represent sparse V1 at Standard Job × Work Group × Period level. Explicit zero is representable as a stored numeric row, while absence is representable as no row. Therefore:

No new forecast table is required.

No RF-stage/submission column is required.

No conversion of V1 data is required.

No destructive rewrite should occur.

Existing V0 and V1 rows remain authoritative.

3.2 Recommended migration: non-negative database constraint
A database-level constraint would provide defense in depth, but it must be introduced safely.

Pre-migration audit
Run a read-only query equivalent to:

SELECT fiscal_year, plan_version, job_number, work_group, period, value
FROM forecasts
WHERE value < 0
ORDER BY fiscal_year, plan_version, job_number, work_group, period;
If no negative rows exist
Use an additive migration:

ALTER TABLE forecasts
ADD CONSTRAINT forecasts_value_nonnegative
CHECK (value >= 0) NOT VALID;

ALTER TABLE forecasts
VALIDATE CONSTRAINT forecasts_value_nonnegative;
Deploy API validation before validating the constraint.

If negative rows exist
Do not delete, reset, clamp, or overwrite them automatically.

Export and quarantine the list for business review.

Keep them readable.

Reject new negative writes at the application/API layer.

Defer constraint validation until each legacy value has an explicitly authorized V0 correction or V1 correction.

Record the reconciliation outside any automated migration.

This is necessary because the current schema has only NOT NULL DEFAULT 0, not a non-negative constraint. 

3.3 Potential migration: persisted reporting-period selection
Whether reporting period should be stored in PostgreSQL is the only significant remaining schema decision.

If it is a shared operational setting, use a new additive table such as:

reporting_context
- fiscal_year
- delivery_unit or scope key
- reporting_period
- updated_at
Do not add it to forecasts, comments, review statuses, or Work Done rows. Do not derive historical values. Initially populate no rows and require the user to select a period; do not backfill from maximum Work Done or RF stage.

If reporting period is only a per-user/session display choice, no schema migration is needed; use a new FY-scoped browser setting. This ambiguity is flagged below.

3.4 Migration mechanism improvements
Schema evolution is currently embedded in runtime/init CREATE TABLE IF NOT EXISTS statements rather than represented as numbered migrations. Before adding any constraint or context table:

Introduce an idempotent migration runner and schema-version table.

Make every migration additive and transactional where PostgreSQL permits.

Record applied migration name and timestamp.

Test migration against a production-shaped copy.

Test both upgrade and application rollback compatibility.

Never use table recreation or DROP COLUMN.

Keep old application code able to operate while the new migration is present.

The existing initializer demonstrates that tables are currently created directly without an explicit migration ledger. 

4. Existing-Data Impact and Preservation Analysis
4.1 Forecast V0 data
Risk
V0 correction UI could accidentally be wired through a V1 write path.

A full-snapshot save could replace a valid FY/version payload if sparse serialization is wrong.

Adding a negative-value constraint could fail on legacy negatives.

Preservation
Do not migrate or rewrite existing V0 rows.

Keep existing FY and plan_version = 'v0' identifiers.

Make Correct V0 an explicit user action.

Use per-job transactional updates where possible.

Keep revision conflict handling.

Never interpret a V0 correction as a V1 amendment.

Do not add immutability or lock reviewed periods.

4.2 V1 amendments and explicit zeros
Risk
Removing “redundant” V1 values could erase intentional amendments.

Treating zero as empty could turn a deliberate zero back into inherited V0.

Existing complete copied V1 Work Groups cannot safely be distinguished from deliberate overrides.

Current full-save delete/reinsert logic amplifies any serializer defect.

Preservation
Treat every existing stored V1 row—including zero—as explicit.

Do not normalize existing V1 data into a newly inferred sparse form.

Preserve Work Group aliases during reads.

Apply prospective sparse writes only to periods the user explicitly changes or resets.

Add round-trip tests proving explicit zeros survive API, PostgreSQL, load, edit, save, and export.

4.3 Forecast-builder comments
Risk
Forecast comments are tied to job, Work Group, FY, and plan version. Some current Work Group reset/copy operations delete forecast comments along with V1 Work Group data. For example, reset removes both the raw V1 Work Group and its forecast comment. 

Preservation
Do not delete V1 forecast comments when removing only one period override.

Define a separate explicit “delete forecast comment” action.

Keep comments even if a Work Group temporarily has no numeric V1 override, unless the user expressly removes the comment.

Ensure sparse cleanup never removes a job whose only V1 content is a comment.

Preserve existing forecast_comments keys and rows.

4.4 Review comments
Risk
New label/filter changes could make older comments appear missing if context matching changes.

A new required-field policy could reject existing comments with empty optional structured fields.

Preservation
Keep current IDs and FY/RF-stage fields.

Keep optional fields nullable.

Do not copy comments into a later RF stage.

Display historical comments under their original context.

Do not bulk rewrite comment records.

Ensure exports include existing legacy comments even when optional metadata is absent.

4.5 Review statuses
Risk
Conflating reporting period with RF stage could move or hide status.

Introducing approval workflow would make existing Reviewed records semantically incomplete.

Preservation
Keep the current (job_number, fiscal_year, rf_stage) key.

Do not add reporting period to the review-status identity.

Keep old Reviewed timestamps.

Do not reset status when forecasts, Work Done, or reporting period change.

If underlying data changes, display that fact if useful, but Reviewed remains mutable operational context rather than an immutable certification.

4.6 Corrected Work Orders
Risk
Work Order amendments are stored in one JSON document rather than as FY-keyed relational rows. The application must continue matching them to loaded Work Orders. A change in Work Order identity construction, import normalization, or FY handling could make old corrections inaccessible even though the JSON remains present. 

Preservation
Do not change Work Order correction identifiers in the calculation phase.

Do not replace or clear the amendment JSON.

Test corrections against re-uploaded Work Done and multiple FYs.

Preserve original value, corrected value, and amended export.

Treat corrected Work Done as effective Work Done in all new calculations.

If a later relational migration is desired, dual-read old JSON and new rows first; copy rather than move, reconcile counts, and retain the old JSON until a separate verified retirement phase.

4.7 Work Done snapshots
Risk
Uploading Work Done for an FY currently replaces that FY’s JSON snapshot. This is existing behavior, but calculation refactoring must not accidentally clear other years or amendments. PostgreSQL upserts the selected FY’s Work Done document independently. 

Preservation
Leave other FY rows untouched.

Do not infer reporting period from the uploaded content.

Apply existing Work Order corrections after loading/reloading the selected FY.

Never carry Work Done into a new FY.

Do not create immutable Work Done snapshots merely to satisfy the superseded governance proposal.

Retain the existing uploaded timestamp as operational metadata.

4.8 Local browser caches
Risk
Older browsers may hold full V1 snapshots, override metadata, comments, or review status while PostgreSQL is authoritative in deployed/API mode.

Preservation
In server mode, continue treating PostgreSQL as authoritative.

Do not run a browser migration that deletes legacy keys.

Version new reporting-period preferences under a new key.

Ensure effective forecast reads continue to support existing serialized forecast format.

Keep current import compatibility for older stage-nested exports.

5. Test Plan
5.1 Tests to add before changing code
Sparse V1 model
Missing V1 job inherits all V0 values.

Missing V1 Work Group inherits V0.

Missing V1 period inherits V0.

Explicit V1 zero overrides a positive V0 value.

Positive V1 overrides V0.

Editing P9 does not materialize P1–P8 or P10–P13.

Resetting P9 removes only P9 and restores V0 inheritance.

Removing the final numeric amendment does not remove a retained V1 forecast comment.

Existing fully populated V1 records round-trip unchanged.

V0 correction becomes visible through inherited effective V1 periods but does not alter explicit V1 periods.

Work Group code/description aliases do not double count.

Non-negative validation
Negative V0 browser entry is rejected.

Negative V1 browser entry is rejected.

Negative paste/import row is rejected.

Negative per-job API payload returns 400.

Negative full-save API payload returns 400 before any database delete.

Zero is accepted through every path.

Positive decimals are accepted.

Failed validation leaves the prior PostgreSQL snapshot unchanged.

Reporting period
No dashboard calculation is shown until a reporting period is manually selected.

Future Work Done never advances the reporting period.

RF-stage changes do not change reporting period.

Reporting-period changes do not change RF stage.

P5 remains selectable during RF6.

Work Done after P5 is excluded from Work Done-to-date and Actual’s completed portion.

Explicit zero Work Done through cutoff remains zero.

Future forecast zero remains zero rather than using later Work Done.

FY change requires the appropriate FY-specific manual selection behavior once the persistence ambiguity is resolved.

RAG
Parameterized tests for both over- and under-delivery:

0% → Green.

9.999% → Green.

Exactly 10% → Amber.

49.999% → Amber.

Exactly 50% → Red.

Above 50% → Red.

Forecast 0 / Work Done 0 → Green.

Forecast 0 / Work Done positive → Red.

Equal-magnitude over- and under-delivery produce identical RAG.

A small absolute volume at 50% remains Red.

Aggregated parent RAG is calculated from aggregate volumes, not child colours.

Dashboard measures
Period-to-date Work Done versus effective forecast.

Actual equals corrected Work Done through cutoff plus effective forecast afterward.

V1 fallback to V0 is used in both measures.

Future Work Done does not enter Actual before the selected period advances.

Corrected Work Order values feed Work Done-to-date and Actual.

Full-year V0, effective V1, unit movement, and percentage movement reconcile.

V0-zero percentage movement renders safely.

Engineer, Work Group, Delivery Unit, and portfolio totals reconcile to the same detailed rows.

Comments and review status
Existing comments remain available after forecast edits.

V1 period reset does not delete forecast comments.

Comments remain isolated by FY/RF context.

Previous-stage comments remain visible as history but are not copied.

Review status remains keyed by job/FY/RF stage.

Forecast, reporting-period, V0, V1, and Work Done changes do not reset Reviewed.

Existing nullable structured fields continue to load/save.

Work Order corrections
Original and corrected values survive reload.

Corrected units feed all new calculations.

Revert restores the original value.

Corrections remain available after Work Done re-upload.

Corrections for another FY are not removed.

Corrected Work Order export preserves both values.

Exports
V0 export contains V0 only.

Reforecast export uses corrected Work Done through cutoff.

Future explicit V1 is used.

Future missing V1 inherits V0.

Explicit V1 zero exports as zero.

Portfolio, engineer, and Work Group Set exports reconcile.

Existing JSON imports/exports remain readable.

Comments and corrected Work Order exports remain unchanged and accessible.

5.2 Database and migration tests
Apply migrations to an existing schema containing realistic V0/V1/comments/reviews/Work Done/amendments.

Apply each migration twice successfully.

Verify row counts and checksums before and after.

Verify explicit-zero V1 rows remain present.

Verify application rollback still reads the migrated database.

Verify NOT VALID constraint deployment does not lock out legacy reads.

Verify negative legacy audit behavior without mutating values.

Verify a stale full-save revision rolls back before deletion.

Verify server validation fails before opening the replacement transaction where practical.

Restore the backup into a temporary database and run reconciliation queries.

5.3 Browser/end-to-end tests
Add a small E2E suite for the highest-risk RF6 workflow:

Select FY and RF6.

Manually select P5.

Load V0 and a sparse V1.

Confirm effective future inheritance.

Reforecast one future period to zero.

Correct another V1 value.

Correct a V0 value and confirm only inherited V1 cells change.

Amend a Work Order in P4.

Confirm Work Done-to-date, Actual, RAG, and annual bridge.

Add a comment and mark Reviewed.

Reload the application.

Confirm all forecast values, explicit zero, comment, status, and Work Order correction remain available.

Export V0, Reforecast, comments, and corrected Work Orders.

6. Recommended Deployment Sequence During Active RF6 Use
Phase A — No semantic production change
Add characterization tests.

Audit production data read-only.

Verify backup and restore.

Add logging/reconciliation for failed saves and revision conflicts.

Document rollback steps.

Phase B — Server-side guardrails
Add non-negative API validation.

Add sparse-payload validation.

Preserve old read formats.

Do not yet rewrite the editor.

Deploy and monitor rejection logs.

Phase C — Sparse V1 writer
Introduce canonical period-level amendment/reset operations.

Start with the Standard Job breakdown editor.

Then update Forecast Builder, paste, import, copy, and initialization flows.

Avoid full FY V1 rewrites where a per-job save can be used.

Confirm explicit-zero and comment preservation after every path.

Phase D — Calculation consistency
Remove Auto and require manual reporting period.

Centralize Work Done, Actual, effective forecast, variance, and RAG calculations.

Correct exact 10%/50% and zero-forecast behavior.

Add the two dashboard headline comparisons.

Keep the old calculation available briefly behind a rollback flag if feasible.

Phase E — Annual bridge, exports, labels, and modal fixes
Add V0-to-effective-Reforecast movement.

Add resolved Reforecast exports by scope.

Clarify terminology.

Add body scroll lock and sticky close control.

Do not combine these changes with database migration deployment.

Phase F — Optional later work
Basic authentication.

PDF review pack.

Prior-year plan-copy helpers.

Relational normalization of Work Order amendments only if separately justified.

7. Remaining Business Ambiguities
Most questions from the governance review are resolved by the authoritative clarification. There are only two issues that genuinely affect implementation design.

Blocking ambiguity 1 — Scope and persistence of the manually selected reporting period
The rules say the period must always be manually selected, but do not say whether it is:

A shared operational setting persisted in PostgreSQL per FY and Delivery Unit/portfolio; or

A per-user/browser view choice that each user selects independently.

This affects whether a backwards-safe schema migration is required and whether two users should see the same reporting basis. It should be resolved before implementing reporting-period persistence.

Safest interim choice during RF6: require a selection in each browser session and do not persist it to PostgreSQL until the ownership/scope is confirmed. This prevents automatic inference without creating a potentially incorrect shared setting.

Blocking ambiguity 2 — Whether “no completed reporting period” must be representable
The current control offers P1–P13 plus Auto. Once Auto is removed, the system has no way to express “before P1 / no completed period.” If the tool is used before P1 closes, it needs an explicit P0 or “No completed period” selection.

This does not block the RF6 correction work, but it blocks finalizing the valid reporting-period domain.

Non-blocking implementation choices
These can be resolved conservatively during development and do not require further business clarification:

Correct V0 versus Reforecast UI: use explicit action labels and confirmation text; no new schema.

Correct V1: use the same sparse V1 amendment path.

Annual movement percentage when V0 is zero: show unit change and N/A percentage.

Forecast comments on a Work Group with no numeric V1 override: preserve them independently.

Existing fully populated V1 records: treat all stored properties as explicit; do not infer sparsity retrospectively.

Basic authentication: defer until core RF6 stability is complete.

Review pack: defer until calculations and exports are stable.

8. Explicit Preservation Guarantee for the Future Implementation
The implementation should not be accepted unless automated and production reconciliation demonstrate that:

No existing V0 row is deleted or altered by migration.

No existing V1 row—including zero—is deleted or reinterpreted.

No forecast-builder comment is removed.

No job review comment is removed or hidden.

No Reviewed status is reset or moved.

No Work Done FY snapshot is cleared.

No Work Order amendment is removed or becomes unreachable.

Old JSON forecast exports remain importable.

The previous application version can still read the migrated database during rollback.

PostgreSQL remains the authoritative store in the deployed API configuration.
