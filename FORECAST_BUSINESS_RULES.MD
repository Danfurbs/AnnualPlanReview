Response to Forecast Governance Review

Thanks for the review. The assessment is useful, but a number of the recommendations assume a more formal forecasting-governance system than this tool needs to become.

The tool is primarily an operational annual-plan and review tool. It needs to support the latest working position, engineer reviews, reforecasting and export, while remaining relatively lightweight. Historical corporate snapshots and formal sign-off already exist elsewhere.

The following business decisions should govern the next phase of development.

1. Core forecast model

V0 — Original Approved Plan

V0 is the initial approved annual plan that has been signed off and loaded into ELLIPSE.

It is the heart of the annual plan and remains the reference for what was originally agreed.

V0 is not technically immutable. It must be possible to correct it later where genuine errors are identified. A correction to V0 should not be treated as a reforecast.

There is no requirement for a comprehensive audit-history system around every V0 correction at this stage.

V1 — Reforecast / refinement layer

V1 should not be treated as a separate complete plan or as an RF6-specific submission.

It is best understood as a sparse amendment/refinement layer over V0.

A user can make V1 amendments at any point during the year. RF6 is generally when the comprehensive reforecast exercise occurs, but V1 can be used before or after RF6 whenever new information becomes known.

The effective future forecast should therefore be:

V1 value where a V1 amendment exists, otherwise V0.

This inheritance must operate at individual:

Standard Job × Work Group × Period

level.

It is important to distinguish:

- no V1 value = no reforecast made; inherit V0;
- V1 = 0 = explicitly reforecast to zero;
- V1 > 0 = explicitly reforecast to that value.

Forecast values can never be negative.

This is consistent with the useful existing effective-V1 behaviour identified in the review, but it should be treated as a fundamental business rule rather than a convenience.

2. Editing intent

The tool needs to distinguish conceptually between three types of forecast change:

- Correct V0 — the original approved-plan data was wrong.
- Reforecast — the original plan was correct but the future expectation has changed.
- Correct V1 — an existing reforecast value was entered incorrectly.

The exact UI implementation can be decided during development, but it should be clear to the user which type of change they are making.

There is no requirement to create V2, V3 etc. or maintain a formal version tree.

The required model remains:

V0 baseline + sparse V1 amendments.

3. Latest version of the truth

For day-to-day management, the latest forecast is the primary operational truth.

V0 remains valuable because it tells us what we originally said, and users should still be able to inspect it for learning and retrospective analysis.

However, V0 should not be front and centre in the normal performance dashboard once a reforecast exists.

The main operational comparison should be against the latest effective forecast.

This is particularly useful where an engineer has reforecast down and subsequently over-delivers: V0 remains available to understand the forecasting history, but current management should be against the latest forecast.

4. Definitions of Work Done and Actual

The terminology should remain as follows.

Work Done

Work Done means physical work actually completed.

If the selected reporting period is P6, Work Done is the completed work relating to the reported position through that point.

Work Done may include corrections made inside the tool where source Work Order data is known to be wrong.

Actual

Actual is a full-year measure in this business context.

It means:

Work Done through the selected reporting period + latest effective forecast for future periods.

For example, at a P6 reporting cutoff:

P1–P6 Work Done + P7–P13 latest effective forecast = full-year Actual.

The review recommends avoiding the term Actual for this hybrid measure. That recommendation should not be implemented because the terminology above reflects the intended business meaning. Instead, the UI should make the definitions explicit so that Actual and Work Done cannot be confused.

5. Reporting period

The reporting cutoff must always be manually selected.

It must never be inferred from the latest period containing Work Done.

Work may legitimately already exist in a future or partially completed period. Automatically moving the reporting cutoff would incorrectly make an incomplete period appear as under-delivery.

RF stage and reporting period are completely independent concepts.

For example, an RF6 review may still use P5 as the selected reporting period if that is the latest period considered complete.

Therefore, do not hard-code:

RF3 = P3
RF6 = P6
RF9 = P9
RF11 = P11

The stage-to-period mapping suggested in the review is not appropriate for this process.

6. Reforecast behaviour

Reforecasting is performed only at:

Standard Job × Work Group × Period

level.

There should be no direct reforecasting of engineer totals, Work Group Set totals, Delivery Unit totals or portfolio totals. Those values should always roll up from the detailed forecast.

Not every Standard Job will be reforecast.

A reforecasted job also does not need to have every future period amended. It may be that only one future period changes.

During reforecasting, periods through the selected reporting cutoff should use the current corrected Work Done position.

Future periods then use:

V1 amendment where present, otherwise V0.

The reforecast can change both:

- phasing between periods; and
- the annual total.

For example, volume can move from P9 into P10, and the annual total can also move from 1,000 to 900.

The tool should visibly identify any annual movement:

V0 annual total → effective reforecast annual total → unit change → percentage change.

A complex mandatory reforecast-driver taxonomy is not required. Commentary explaining reforecast movements will be captured through the normal RF review comments.

7. Work Done corrections

The existing Work Order correction approach should be retained.

The tool already shows the original value and corrected value and retains enough information to export a list of corrected Work Orders for subsequent correction in ELLIPSE.

This is suitable and does not need redesigning.

Corrected Work Done should be treated as the effective Work Done position in the tool and should feed:

- performance calculations;
- Actual;
- and the current reforecast.

Work Done can change retrospectively if an error is discovered.

Closed/reviewed historical periods should therefore not be treated as immutable actual snapshots in this tool.

The full raw Work Done dataset is no longer retained by the application because of its size, so recommendations around persistent Work Done source-file metadata and provenance should be reconsidered against the current implementation.

8. Performance dashboard

The dashboard should show both of the following prominently.

Period-to-date performance

Work Done vs latest effective forecast through the selected reporting period.

This answers:

Are we delivering what we currently said we would deliver by this point?

Full-year position

Current full-year Actual/outlook vs latest full-year effective forecast.

This answers:

Where do we now expect the year to land?

V0 comparisons should remain available as supporting analysis, but they should not dominate the normal dashboard.

9. Variance terminology and RAG

Use:

Under Delivery / Over Delivery

rather than favourable/adverse.

RAG measures the magnitude of deviation from the latest effective forecast, regardless of direction.

Therefore, an equivalent over-delivery and under-delivery should receive the same RAG.

The nationally defined percentage thresholds must remain unchanged:

- Green: absolute variance < 10%
- Amber: absolute variance ≥ 10% and < 50%
- Red: absolute variance ≥ 50%

Exactly 10% is Amber.

Exactly 50% is Red.

Do not introduce an absolute-volume materiality test. The national percentage thresholds are fixed.

Special zero-forecast rules:

- Forecast = 0 and Work Done = 0 → Green
- Forecast = 0 and Work Done > 0 → Red

The review correctly identifies the need to make threshold boundaries and zero-denominator behaviour explicit, but the business definitions above should be used.

10. RAG at different aggregation levels

RAG should be calculated independently for whichever view/filter the user is currently looking at.

Underlying forecast and Work Done volumes roll up through the hierarchy.

For example, one engineer may be Red because they are under-delivering while another is over-delivering sufficiently that the overall Delivery Unit is Green.

Therefore, the RAG of a higher-level view should be calculated from the aggregated volumes at that level. It should not inherit the colours of lower-level items.

This should apply across the existing views such as engineer, Work Group Set and wider Delivery Unit/portfolio views. The existing multi-level drill-down capability is therefore worth preserving.

11. Comments

The existing general philosophy for comments should remain.

Comments are intentionally low-friction and may be added at any time.

For example, if a standard changes during the year, a user should be able to make a note immediately. Those comments then become useful supporting context when a formal RF review takes place later.

Comments should not require:

- corrective actions;
- owners;
- due dates;
- evidence links;
- mandatory driver classifications;
- or follow-up workflow.

The proposed structured commentary-completion controls in the review are therefore too stringent for this use case.

Comments should continue to be tagged to their appropriate context using the existing method.

Previous comments should remain visible as historical/supporting information, but should not automatically be copied into later RF-stage commentary as if they remain current.

12. RF reviews

RF3, RF6, RF9 and RF11 are formal management review stages with engineers.

They roughly represent review points through the year but are independent of reporting periods.

Reviews can also happen outside these stages.

The existing concept of Reviewed should remain.

Reviewed means:

the relevant review has been fully completed with all affected engineers and the appropriate review comments have been created.

Reviewed does not mean:

- formally approved;
- corporately signed off;
- forecast frozen;
- underlying data cannot change;
- or an action has been raised.

Formal presentation/sign-off happens outside this tool.

Therefore, do not introduce the proposed:

Draft → Submitted → Reviewed → Approved → Reopened

workflow.

13. Historical RF snapshots

There is no requirement for immutable numerical forecast snapshots at RF3/RF6/RF9/RF11.

Only one formal reforecasted plan can be submitted during the year, generally around RF6, and historical plan snapshots already exist in other internal systems.

The purpose of this tool is to show the latest version of the truth.

Therefore, the proposed forecast-submission entity and stage-specific immutable snapshot architecture should not be introduced unless another technical requirement emerges that genuinely requires it.

14. Exports

Exports should remain explicit business views rather than creating one generic “latest truth” export.

Required forecast exports:

- V0;
- Reforecast;
- full portfolio;
- individual engineer;
- individual Work Group Set.

The reforecast export should resolve the working model into a complete plan:

- Work Done/current actualised position through the selected reporting cutoff;
- future V1 amendment where present;
- otherwise future V0.

Other required/useful exports:

- comments;
- corrected Work Orders;
- planned vs actual/performance data.

The existing import/export capability is a strength and should be preserved.

15. Review Pack

A PDF review pack would be a useful enhancement.

It should be designed to support the actual conversation with an engineer rather than simply dump data.

It should contain, where appropriate:

- selected FY;
- selected RF stage;
- selected reporting period;
- headline RAG and variance;
- Work Done vs latest forecast;
- full-year outlook;
- relevant comments;
- review status/context;
- the existing performance graph prominently displayed;
- and deliberate blank space for the engineer/reviewer to hand-write their own notes.

The graph is particularly important and the existing graph should be preserved.

This is desirable functionality but should not block the more important forecasting-model improvements.

16. Financial years

Every financial year should be a completely separate annual plan.

Each FY has its own:

- V0;
- V1 amendments;
- Work Done;
- comments;
- RF reviews.

Work Done never carries into a new financial year.

Previous financial years should, however, remain available because there is considerable value in using prior plan profiles when building the next year's plan.

Potential future options could include:

- copy previous year's plan;
- mirror previous year's P1–P13 phasing;
- retain prior-year phasing but increase or decrease the annual total.

These are useful future enhancements rather than immediate requirements.

17. Security and permissions

Basic authentication/password protection is desirable because operational data may be held externally.

There is no current requirement for detailed role-based permissions.

Do not introduce separate editor/commenter/reviewer/approver/admin roles at this stage.

Authentication is useful; complex authorisation is not.

18. Audit history

There is no requirement for a comprehensive forecast edit-history system at this stage.

The tool will principally be driven by one user.

The existing Work Done correction history should remain because it serves a concrete reconciliation purpose with ELLIPSE.

There is no need to generalise this into a before/after audit trail for every V0 and V1 edit.

19. Notifications and bulk actions

No notification system is required.

Do not add automatic reminders for:

- commentary;
- overdue actions;
- reopened reviews;
- or approaching deadlines.

No bulk-review or bulk-action functionality is required either.

20. UI refinements

Some light UI improvements would be useful, but a broader accessibility or keyboard-navigation programme is not required for this phase.

Specific improvements:

- prevent the underlying main page from scrolling while a modal/popup is open;
- keep the Close/X control visible at all times in the Standard Job Breakdown;
- clarify ambiguous labels or controls;
- resolve other obvious usability friction where encountered.

Avoid turning this into a wholesale UI redesign.

21. Terminology to retain

The following terminology should be used consistently:

V0 — Original Approved Plan

V1 / Reforecast — amendments/refinements to V0

Work Done — physical work actually completed

Actual — full-year position made up of Work Done through the selected reporting period plus latest effective forecast for future periods

RF3 / RF6 / RF9 / RF11 — formal review stages

Reporting Period — manually selected completed-period cutoff

Under Delivery / Over Delivery — direction of variance

RAG — magnitude of deviation against the latest effective forecast

22. What to prioritise next

The next development phase should focus on making the existing model behave consistently with these definitions rather than introducing a larger governance architecture.

Highest priorities are:

1. Make the V0/V1 inheritance model explicit and robust at Standard Job × Work Group × Period level.
2. Preserve the distinction between no V1 amendment and an explicit zero.
3. Ensure forecast values cannot be negative.
4. Make Work Done, Actual and latest effective forecast calculations consistent with the manually selected reporting period.
5. Ensure the dashboard compares operational performance against the latest effective forecast.
6. Apply the agreed national RAG rules consistently, including exact 10%/50% boundaries and zero-forecast cases.
7. Clearly show annual V0-to-reforecast movement.
8. Preserve existing comments, review-status, Work Order correction and drill-down functionality.
9. Make V0 and reforecast exports work cleanly at portfolio, engineer and Work Group Set level.
10. Add the targeted modal/UI refinements above.

The existing Forecast Builder, exception dashboard, drill-down, comments, review stages, Work Order corrections and export capability remain the right foundations. The main objective now is to make the business semantics precise without adding governance mechanisms that are not required by the actual process.

Existing data is production data and must be preserved.
Changes made as a result of this specification must retain all currently stored forecast data, including V0, V1 amendments, comments, RF review status and corrected Work Order records. Existing data must remain readable and editable following implementation.
Database/schema changes must be backwards-safe and migratory rather than destructive. No existing records should be deleted, reset or silently reinterpreted as part of implementation.
Where a proposed implementation would require changing the meaning of existing persisted data, stop and flag this before proceeding.
