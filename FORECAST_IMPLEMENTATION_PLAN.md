# Forecast Business Rules Implementation Plan

## Purpose and constraints

This plan reviews the current application against `FORECAST_BUSINESS_RULES.MD` and the earlier `FORECAST_GOVERNANCE_REVIEW.md`. The business rules are authoritative wherever they conflict with assumptions or recommendations in the governance review.

The implementation must prioritise operational stability during the active RF6 review process. Existing PostgreSQL forecast data, V0 and V1 amendments, forecast and review comments, review statuses, Work Done snapshots, and Work Order corrections must not be deleted, reset, overwritten, reinterpreted, or made inaccessible. Any schema change must be additive, idempotent, and backwards-safe.

No implementation should begin until the safety tests, production-data audit, backup, and restore verification described below are complete.

## Implementation status

**Status date:** 13 August 2026<br>
**Status legend:** ✅ Implemented · 🟡 Partially implemented/prepared · ⏸️ Deferred until after RF6 · ❌ Not implemented

This status records what is present in the repository. A script being available does not mean it has been run against production. In particular, production reconciliation and backup/restore verification still require operator-supplied PostgreSQL connection details and retained evidence of successful execution.

| Area | Status | Current position | Remaining work |
| --- | --- | --- | --- |
| Existing V0/V1 inheritance | ✅ Implemented before this plan | Read-time V1-over-V0 inheritance and explicit-zero semantics remain in place. | Preserve this behaviour while changing future writers. |
| Preservation characterization tests | 🟡 Partial | Tests cover missing V1 inheritance, explicit zero, Work Group aliases, storage round-trip of an explicit zero/comment/amendment metadata, per-job persistence, revision-conflict rollback, comments, and review-status dimensions. | Add full browser/API/PostgreSQL preservation coverage, especially Work Order corrections and all V1 editing paths. |
| Production reconciliation | 🟡 Prepared, not executed | A repeatable-read, read-only reconciliation script reports forecast/zero counts, negative forecasts, comments, statuses, V1 override metadata, Work Done snapshots, and Work Order amendments. | Run against production with `DATABASE_URL`, retain the JSON report, and compare it after deployment. |
| PostgreSQL backup/restore | 🟡 Prepared, not verified | A guarded script creates a dump, restores only to a separately supplied disposable database, and compares reconciliation reports. | Run with production and disposable restore URLs, retain the dump and successful verification evidence. |
| Server-side non-negative validation | 🟡 Partial | Per-job and full forecast API payload validation rejects negative detailed and aggregate period values while accepting zero. | Browser paste/import characterization remains; no database constraint has been added. |
| RAG correctness | ✅ Implemented for current dashboard consumers | Central logic applies 10% Amber, 50% Red, direction symmetry, zero/zero Green, and zero forecast/non-zero Actual Red. | Extend tests when the post-RF6 dashboard calculation model is refactored. |
| Terminology/UI clarification | 🟡 Partial | Primary dashboard and breakdown controls use V0/V1/Reforecast, Reporting Period, Under Delivery, and Over Delivery terminology. | Audit remaining legacy labels and add fuller Work Done/Actual explanations after RF6. |
| Modal background scroll lock | ✅ Implemented | The page body is locked while a modal is open. | Browser regression coverage remains desirable. |
| Persistent Breakdown Close/X | ✅ Implemented | The Standard Job Breakdown header is sticky and its Close/X has an accessible label. | Browser regression coverage remains desirable. |
| Reporting Period browser persistence | ❌ Not implemented | The existing Auto option and current cutoff behaviour remain unchanged to avoid a broader RF6 behaviour change. | After RF6, remove inference, require manual selection, and persist by FY in the browser only. |
| P0 / No completed period | ⏸️ Deferred | Business intent is resolved. | Implement after RF6 alongside Reporting Period changes. |
| Sparse V1 production writers | ⏸️ Deferred | Existing writers were deliberately left unchanged during active RF6 use. | Characterize every writer, then introduce period-level sparse writes without rewriting existing V1 data. |
| Dashboard comparison refactor | ⏸️ Deferred | No broad Work Done/Actual/dashboard refactor has been made. | Implement the two clarified comparisons after RF6. |
| Annual V0-to-Reforecast movement | ⏸️ Deferred | Not implemented. | Implement after RF6. |
| Export redesign | ⏸️ Deferred | Existing exports remain unchanged. | Implement resolved Reforecast and scoped exports after RF6. |
| Review pack and authentication | ⏸️ Deferred | Not implemented. | Consider as later isolated work. |
| Migration framework/schema constraint | ⏸️ Deferred | No schema migration or data rewrite has been made. | Reassess after RF6 and only after the production negative-value audit. |

### RF6 release status summary

The isolated code changes approved for RF6 are present: RAG boundary/zero rules, server request validation, terminology refinements, modal scroll lock, and the persistent Breakdown Close/X. Preservation tests and operational tooling have been added, but the production reconciliation and backup/restore steps are **not complete until they are actually run and evidenced in the target environment**. No sparse-V1 writer, reporting-period behaviour, database schema, stored forecast, comment, review-status, Work Done, or Work Order amendment data was migrated or rewritten by these changes.

## Target operating model

The clarified target is a lightweight operational review tool, not a formal forecast-governance system:

- **V0 — Original Approved Plan** is the original annual plan and may be corrected when a genuine error is found.
- **V1 / Reforecast** is one continuously usable, sparse amendment layer over V0; it is not an RF6-only submission or a complete second plan.
- The effective forecast at `Standard Job × Work Group × Period` is an explicit V1 value when present, otherwise V0.
- Missing V1, explicit V1 zero, and positive V1 are three distinct states. Forecast values cannot be negative.
- Corrected Work Done is authoritative through a manually selected reporting period. Future periods use the latest effective forecast.
- **Actual** retains its business meaning: corrected Work Done through the selected reporting period plus the latest effective forecast for future periods.
- RF stage and reporting period are independent.
- Comments remain low-friction and review status remains Reviewed/Needs Review.
- The application does not need immutable RF snapshots, submissions, approvals, role workflows, mandatory driver taxonomies, action tracking, or notifications.

## Behaviour that is already correct and should remain

### Financial-year and plan separation

- Forecasts are already stored by financial year and plan version at Standard Job, Work Group, and period grain.
- Financial years remain separate plans; no Work Done should carry between years.
- The existing V0/V1 storage keys are compatible with the clarified model.
- Do not add RF stage or submission identifiers to forecast rows.
- Do not introduce V2/V3 versions or immutable stage snapshots.

### Effective V1 inheritance

- The read-time merge in `forecast-storage.js` already overlays sparse V1 periods on V0.
- It correctly uses property presence, so an absent V1 period inherits V0 while an explicitly stored zero remains zero.
- Existing Work Group alias normalisation prevents V0 and V1 aliases from being double-counted.
- Existing tests for missing-period inheritance and explicit zero should remain.

### Selected-cutoff calculations

- Once a period is selected, the calculation correctly uses Work Done through that period and forecast afterwards.
- Later Work Done is correctly excluded from the hybrid full-year Actual until the selected cutoff advances.
- An explicit zero Work Done value through the cutoff is correctly treated as zero.
- RF stage must remain independent of the reporting period.

The current **Auto** option is not correct and is addressed under required changes.

### Work Order corrections

- Retain the current original-versus-corrected unit display, amendment flag, revert action, and corrected Work Order export.
- Corrected Work Done must continue to feed performance, Actual, and reforecast calculations.
- Retrospective correction remains allowed; reviewed periods are not immutable snapshots.
- Preserve the current Work Order amendment identifiers and stored amendment document.

### Comments and review status

- Retain free-text comments and existing Work Group, engineer, FY, and RF-stage context.
- Keep optional structured database fields nullable; do not make actions, owners, due dates, evidence, or driver classifications mandatory.
- Historical comments remain visible but must not be copied into later RF stages as current commentary.
- Retain the binary Reviewed/Needs Review model keyed by Standard Job, FY, and RF stage.
- Forecast or Work Done changes must not reset a Reviewed status.

### Navigation, aggregation, and charting

- Preserve Standard Job cards, engineer and Work Group filters, Delivery Unit and portfolio roll-ups, exception views, drill-down, Work Orders, and the performance graph.
- Continue calculating a higher-level RAG from aggregated forecast and Work Done volumes at the active scope; never inherit or combine child colours.
- Keep V0 available as supporting analysis without making it the primary operational benchmark after a reforecast exists.

### Persistence and concurrency

- Retain PostgreSQL as the deployed authoritative store.
- Keep expected-revision conflict checking for full forecast saves.
- Keep transactional database writes and per-job saving for breakdown edits.
- Expand safety coverage rather than replacing these controls during RF6.

## Required changes, in priority order

### Priority 0 — preservation controls before runtime changes 🟡 Partially implemented

1. Add characterization and regression tests for every affected calculation and persistence path.
2. Take and verify a restorable PostgreSQL backup.
3. Record pre-deployment counts/checksums for:
   - forecast rows by FY and plan version;
   - distinct Standard Job, Work Group, and period keys;
   - explicit-zero V1 rows;
   - forecast comments and job review comments;
   - review statuses by FY and RF stage;
   - Work Done snapshots by FY; and
   - Work Order amendments.
4. Do not invoke clear/delete-all forecast or Work Done actions during migration or rollout.
5. Use a short-lived calculation/UI rollout flag if deployment practice permits, allowing presentation changes to be rolled back without touching stored data.
6. Deploy server-side guards before changing the editor's write representation.

### Priority 1 — make new V1 writes genuinely sparse by period ⏸️ Deferred until after RF6

The effective read logic is sparse, but current editor paths can materialise all P1–P13 values, often coercing blank or missing values to zero. This can prevent later V0 corrections from flowing into periods that the user never intended to amend.

Introduce one canonical sparse-V1 write operation:

- Work at `Standard Job × normalised Work Group × Period` grain.
- Store a property only when a user explicitly creates or changes an amendment, including an explicit zero.
- Remove a property only when the user explicitly chooses **Inherit V0** or **Reset this period to V0**.
- Never infer absence from numeric zero.
- Never create zero overrides for untouched periods.
- Remove an empty Work Group container only after all of its period overrides are removed.
- Remove an empty job-level V1 record only when it has no numeric amendments and no V1 forecast comments.
- Calculate displayed totals from the effective V1-over-V0 projection, not raw sparse V1 totals.

Clarify editing intent in the UI:

- **Correct V0** edits the original approved plan.
- **Reforecast / Correct V1** edits the sparse V1 layer.
- **Inherit V0** removes the selected V1 period property.
- Entering `0` explicitly remains a reforecast to zero.

Do not retrospectively compact existing V1 data. Every currently stored V1 property, including zero and values copied from V0, must be treated as explicit because its original intent cannot be inferred safely.

### Priority 2 — reject negative forecasts at every boundary 🟡 Server validation implemented; other boundaries pending

- Reject negative values in V0 and V1 editor inputs, paste/bulk upload, JSON import, per-job API saves, and full forecast API saves.
- Return a descriptive validation error identifying Standard Job, Work Group, and period.
- Accept zero and positive decimals.
- Never silently clamp a negative value to zero.
- Validate the complete payload before any full-snapshot delete/reinsert operation begins.

### Priority 3 — require a manually selected reporting period ⏸️ Deferred until after RF6

- Remove the **Auto** cutoff control and maximum-Work-Done-period inference.
- Require an explicit reporting-period selection before displaying performance calculations.
- Do not change the reporting period when Work Done is uploaded.
- Do not map RF3 to P3, RF6 to P6, RF9 to P9, or RF11 to P11.
- Display FY, RF stage, and reporting period together on dashboards, drill-down, exports, and the future review pack.
- Rename **Forecast starts after** to **Reporting Period** and explain that it is the latest period considered complete.
- Continue showing future-period Work Orders in detail while excluding their units from Work Done-to-date and the completed portion of Actual.

### Priority 4 — centralise and correct variance/RAG behaviour ✅ Implemented for current dashboard consumers

Create one pure calculation used by cards, summaries, top-ten views, drill-down, filters, and exports:

- Period-to-date variance is `corrected Work Done − latest effective forecast` over periods through the reporting cutoff.
- Negative means **Under Delivery**; positive means **Over Delivery**.
- RAG uses the absolute percentage deviation, so equal over- and under-delivery receive the same colour.
- Green: absolute variance `< 10%`.
- Amber: absolute variance `>= 10%` and `< 50%`.
- Red: absolute variance `>= 50%`.
- Forecast 0 and Work Done 0: Green.
- Forecast 0 and Work Done greater than 0: Red.
- Do not add an absolute-volume materiality condition.
- Aggregate volumes for the current scope first, then calculate RAG.

The current strict boundary comparisons must be corrected so exactly 10% is Amber and exactly 50% is Red. The grey **No Forecast** outcome for positive Work Done against zero forecast must become Red.

### Priority 5 — show the two required dashboard comparisons clearly ⏸️ Deferred until after RF6

Prominently display:

1. **Period-to-date performance**
   - Corrected Work Done through the reporting period.
   - Latest effective forecast for the same periods.
   - Unit and percentage variance, direction, and RAG.
2. **Full-year position**
   - Actual = corrected Work Done through the reporting period plus latest effective forecast after it.
   - Compare Actual with the full-year latest effective forecast.
   - Show unit and percentage variance with an explicit definition of Actual.

Retain the business term **Actual** rather than applying the governance review's EAC rename. Refactor ambiguous internal view-model names such as `f`, `a`, `wd`, and `v` toward explicit calculation names without changing stored data.

### Priority 6 — show annual V0-to-Reforecast movement ⏸️ Deferred until after RF6

At the active portfolio, Delivery Unit, engineer, Work Group Set, and Standard Job scope, show:

- V0 annual total;
- effective Reforecast annual total;
- unit change; and
- percentage change.

When V0 is zero, show the unit change and an `N/A` percentage rather than dividing by zero. No mandatory driver taxonomy is required.

### Priority 7 — correct and extend exports without breaking old formats ⏸️ Deferred until after RF6

Retain distinct exports for:

- V0;
- Reforecast;
- full portfolio;
- individual engineer;
- individual Work Group Set;
- comments;
- corrected Work Orders; and
- planned-versus-performance data.

The Reforecast business export must resolve every cell as:

- corrected Work Done through the selected reporting period;
- future explicit V1 when present; otherwise
- future V0.

Include FY, export type, selected reporting period, relevant RF stage, and generation timestamp. Keep the existing JSON forecast format readable and importable for backwards compatibility.

### Priority 8 — terminology and editing clarity 🟡 Partially implemented

- `Plan v0` → **V0 — Original Approved Plan**.
- `Plan v1 (Updated)` → **V1 / Reforecast**.
- `Forecast starts after` → **Reporting Period**.
- `Over Delivered` → **Over Delivery**.
- `Under Delivered` → **Under Delivery**.
- Explain Work Done and Actual adjacent to their displays.
- Explain that Reviewed means review completion, not approval, freezing, or immutability.
- Remove wording that suggests V1 must first be initialised as a complete copy of V0.

### Priority 9 — targeted modal refinements ✅ Implemented

- Lock background-page scrolling while any modal is open.
- Restore scrolling only after the last modal closes.
- Keep the Standard Job Breakdown close/X control visible while the modal content scrolls.
- Avoid a broad UI or accessibility redesign during RF6.

### Priority 10 — review pack after calculation stability ⏸️ Deferred

After the calculation and export changes are verified, add a PDF review pack containing FY, RF stage, reporting period, headline RAG/variance, Work Done versus latest forecast, full-year Actual, relevant comments, review status/context, the existing performance graph, and deliberate blank notes space.

## Work explicitly deferred or rejected

Do not implement the following governance-review proposals in this phase:

- forecast submission entities or immutable RF-stage snapshots;
- stage-to-period mappings;
- mandatory structured commentary or driver classification;
- absolute-volume materiality thresholds;
- Draft/Submitted/Reviewed/Approved/Reopened workflows;
- detailed roles or approval permissions;
- comprehensive forecast edit audit history;
- notifications and reminders;
- bulk review/action workflows;
- full Work Done source-file provenance architecture;
- wholesale accessibility/UI redesign;
- prior-year plan-copy helpers; or
- PDF review pack before the core model is stable.

Basic authentication is desirable but should be delivered later as an isolated change after RF6 calculation and persistence stability.

## Database and migration plan

### No migration required for sparse V1

The current `forecasts` table can already represent the required semantics:

- a stored V1 row represents an explicit amendment, including zero;
- no V1 row represents inheritance from V0.

No replacement forecast table, RF-stage column, submission ID, or V1 data rewrite is needed.

### Backwards-safe non-negative constraint ⏸️ Not applied during RF6

First run a read-only legacy audit:

```sql
SELECT fiscal_year, plan_version, job_number, work_group, period, value
FROM forecasts
WHERE value < 0
ORDER BY fiscal_year, plan_version, job_number, work_group, period;
```

If no negative rows exist, deploy API validation first, then add and validate an additive PostgreSQL constraint:

```sql
ALTER TABLE forecasts
ADD CONSTRAINT forecasts_value_nonnegative
CHECK (value >= 0) NOT VALID;

ALTER TABLE forecasts
VALIDATE CONSTRAINT forecasts_value_nonnegative;
```

If negative rows exist:

- do not delete, clamp, reset, or overwrite them automatically;
- keep them readable and export a reconciliation list;
- reject new negative writes at application/API boundaries;
- defer constraint validation until each legacy value receives an explicitly authorised correction.

### Reporting-period persistence ⏸️ Deferred until after RF6

Reporting Period is a user/browser view selection for RF6, not shared PostgreSQL business data. Persist it only in the session/browser with an FY-scoped key. Do not introduce a reporting-context database migration, add reporting period to forecast/comment/review/Work Done identities, or infer a value from Work Done or RF stage.

### Migration mechanism

Before applying any post-RF6 schema change:

1. Add an idempotent numbered migration runner and schema-version ledger.
2. Keep changes additive and transactional where PostgreSQL permits.
3. Test against a production-shaped database copy.
4. Verify both upgrade and application rollback compatibility.
5. Do not recreate tables, drop columns, or rewrite current rows.

## Existing-data impact and preservation

### V0

- Do not rewrite existing V0 rows.
- Correct V0 only through an explicit user action.
- A V0 correction should flow into effective V1 only where no explicit V1 period exists.
- Preserve revision conflict handling and transactional writes.

### V1 and explicit zero

- Treat every current V1 row as explicit, including zero and values equal to V0.
- Do not retrospectively compact or infer intent from existing V1 records.
- Test that explicit zeros survive database load, edit, save, reload, and export.
- Prefer period/per-job writes over replacing an FY-wide V1 snapshot.

### Forecast-builder comments

- Do not delete a V1 forecast comment when only a period amendment is reset.
- Preserve comments even when a Work Group has no numeric V1 override.
- Provide a distinct explicit action if a user wants to delete a forecast comment.
- Sparse cleanup must not remove a job whose only V1 content is a comment.

### Review comments

- Keep existing IDs, FY/RF context, optional fields, and historical visibility.
- Do not bulk rewrite records or impose new required fields.
- Ensure legacy comments remain exportable when optional metadata is absent.

### Review statuses

- Keep the existing Standard Job/FY/RF-stage key and reviewed timestamp.
- Do not add reporting period to status identity.
- Do not reset status when forecast, reporting period, or Work Done changes.

### Work Order corrections

- Do not change amendment identity construction during the calculation work.
- Do not clear or replace the amendment JSON as part of migration.
- Preserve original/corrected values, revert, and amended export.
- If a later relational migration is justified, dual-read and copy first; do not move or delete the old document until separately reconciled and verified.

### Work Done

- Leave other FY snapshots untouched during upload or calculation changes.
- Do not infer reporting period from uploaded data.
- Continue applying existing Work Order corrections after reload.
- Do not create immutable Work Done snapshots for superseded governance requirements.

### Browser caches and old exports

- PostgreSQL remains authoritative in deployed API mode.
- Do not delete legacy local-storage keys during rollout.
- Keep current serialized forecast and older stage-nested import formats readable.
- Store any new reporting-period preference under a new versioned key.

## Test plan and current coverage

The status markers below distinguish tests already present from future coverage. They do not indicate that production reconciliation or restore verification has been performed.

### Sparse V1 tests 🟡 Partial

- Missing V1 job, Work Group, and period inherit V0.
- Explicit V1 zero overrides positive V0.
- Editing one period does not materialise the other twelve.
- Resetting one period restores only that period's V0 inheritance.
- Removing the last numeric amendment retains V1 forecast comments.
- Existing fully populated V1 records round-trip unchanged.
- A V0 correction changes inherited effective periods but not explicit V1 periods.
- Work Group aliases do not double-count.

### Validation tests 🟡 Partial

- Negative browser entry, paste/import, per-job API save, and full API save are rejected.
- Full-payload rejection occurs before stored rows are deleted.
- Zero and positive decimals remain accepted.
- Failed validation leaves the previous PostgreSQL state unchanged.

### Reporting-period tests ⏸️ Deferred with the behaviour change

- Performance is unavailable until a reporting period is selected.
- Future Work Done never advances the period.
- RF-stage changes do not change reporting period, and reporting-period changes do not change RF stage.
- RF6 can use P5.
- Work Done after P5 is excluded until the selected period advances.
- Explicit zero Work Done through the cutoff remains zero.

### RAG tests ✅ Implemented for current rules

Test over- and under-delivery for:

- 0% and 9.999% → Green;
- exactly 10% and 49.999% → Amber;
- exactly 50% and above → Red;
- forecast 0 / Work Done 0 → Green;
- forecast 0 / positive Work Done → Red;
- equal magnitude in either direction → equal RAG; and
- higher-level RAG calculated from aggregate volumes rather than child colours.

### Dashboard and aggregation tests ⏸️ Deferred with the dashboard refactor

- Period-to-date corrected Work Done versus effective forecast.
- Actual equals corrected Work Done through cutoff plus effective forecast afterwards.
- Future Work Done does not enter Actual early.
- Work Order corrections feed all calculations.
- V0/effective-Reforecast annual totals and changes reconcile.
- Zero-V0 percentage presentation is safe.
- Engineer, Work Group Set, Delivery Unit, and portfolio totals reconcile to detail.

### Comments, review status, and correction tests 🟡 Partial

- Forecast edits and V1 resets retain forecast comments.
- Historical comments remain isolated by FY/RF stage and are not copied.
- Forecast, Work Done, or reporting-period changes do not reset Reviewed.
- Work Order original and corrected values survive reload and Work Done re-upload.
- Revert restores the original units.
- Corrected Work Order export retains reconciliation details.

### Export tests ⏸️ Deferred with export redesign

- V0 export contains V0 only.
- Reforecast export uses corrected Work Done through cutoff and effective future V1/V0.
- Explicit V1 zero exports as zero.
- Portfolio, engineer, and Work Group Set exports reconcile.
- Existing JSON imports/exports remain compatible.
- Comment and amended Work Order exports remain accessible.

### Migration and recovery tests 🟡 Tooling prepared; production execution pending

- Apply each migration twice to an existing production-shaped schema.
- Compare row counts/checksums before and after.
- Confirm explicit-zero V1 rows are unchanged.
- Confirm an older application build can read the migrated schema during rollback.
- Verify stale full-save revisions roll back before deletion.
- Restore the production backup into a temporary database and run reconciliation queries.

### RF6 end-to-end preservation scenario ❌ Not yet automated

Automate a browser flow that selects RF6 and P5, loads V0 plus sparse V1, creates an explicit-zero future amendment, corrects V1, corrects an inherited V0 period, amends a P4 Work Order, adds a comment, marks Reviewed, reloads, and verifies that all values, comments, review status, and Work Order correction remain accessible. Finally verify V0, Reforecast, comment, and corrected Work Order exports.

## Deployment sequence

1. **During RF6 — safety:** add tests, audit production data, and verify backup/restore.
2. **During RF6 — isolated guardrails:** deploy non-negative validation, RAG boundary fixes, low-risk terminology, and modal refinements without changing V1 writers.
3. **After RF6 — sparse writer:** update Standard Job editing first, then Forecast Builder, paste, import, copy, and initialisation paths.
4. **After RF6 — calculations:** require manual reporting period and centralise Work Done, Actual, variance, and RAG logic.
5. **After RF6 — presentation:** add annual movement and corrected exports.
6. **Later enhancements:** basic authentication, review pack, and prior-year planning helpers.

Do not combine the sparse-writer rollout, database constraint, and dashboard redesign in one deployment.

## Resolved implementation clarifications

- Reporting Period is a per-user/browser selection for RF6. It must not create shared PostgreSQL state or a schema migration.
- The future application should support **P0 / No completed period** at the start of a financial year, but this is explicitly deferred until after RF6.

## RF6 implementation boundary

During active RF6 use, implement only preservation/characterization tests, read-only production reconciliation, verified backup/restore capability, backwards-safe server validation, isolated RAG corrections, low-risk terminology, modal scroll lock, and a persistently visible Standard Job Breakdown close control. Sparse-V1 production write changes, dashboard refactoring, annual movement, export redesign, review pack, authentication, migration framework, and other architectural work remain deferred until RF6 is complete.

## Acceptance and preservation gate

Implementation must not be accepted unless automated tests and production reconciliation show that:

- no existing V0 row was deleted or changed by migration;
- no existing V1 row, including explicit zero, was deleted or reinterpreted;
- no forecast or review comment was removed or hidden;
- no review status was reset or moved;
- no Work Done FY snapshot was cleared;
- no Work Order correction was removed or made unreachable;
- old forecast exports remain importable;
- the previous application version can read the migrated database during rollback; and
- PostgreSQL remains the authoritative deployed store.
