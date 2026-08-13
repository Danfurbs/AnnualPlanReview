# Forecast Governance Review

## Review objective and scope

This review assesses the tool as a management process for:

1. maintaining a 13-period, full-year forecast;
2. producing quarterly commentary on actual-to-plan variance; and
3. creating and governing a six-month reforecast.

The assessment is based on the current user interface, calculation logic, persistence model, API validation, and automated tests. It distinguishes functionality that is already useful from controls that are needed before the tool can be treated as a governed forecasting record.

## Executive assessment

The tool is a **strong operational review prototype**. It already brings forecast, work done, work groups, job-level drill-down, variance prioritisation, commentary, review status, import/export, and shared PostgreSQL persistence into one workflow. The 13-period model is a good fit for an annual operational plan, and the dashboard is substantially more useful than a static spreadsheet for finding exceptions.

It is **not yet a complete quarterly forecasting control system**. The most important gap is semantic rather than cosmetic: future forecast values are displayed in an `Actual` measure, so the full-year `Actual` total is really a hybrid of actuals-to-date and forecast-to-go. The application also has review stages (`RF3`, `RF6`, `RF9`, and `RF11`) but forecast persistence is only keyed by financial year and `v0`/`v1`. Consequently, stage selection governs comments and review completion, but does not preserve a distinct forecast submission at each stage.

For a six-month reforecast, `v1` provides a practical editing mechanism, comparison against `v0`, selective copying, and actuals seeding. However, it behaves as one mutable updated plan rather than a formally submitted, approved, and frozen RF6 snapshot. That distinction must be resolved before reports can reliably answer “what did we forecast at the six-month point?” after later changes have been made.

## What works well

### Full-year forecast

- **Appropriate annual grain.** Forecasts use P1–P13 at both standard-job and work-group level. This supports an annual total while retaining the operational detail needed to understand phasing.
- **Useful entry and maintenance workflow.** The Forecast Builder provides work-group navigation, todo/done indicators, search, row entry, undo/redo, bulk upload, full export, and work-done copying. These are practical controls for a forecast maintained by several operational owners.
- **Baseline and reforecast separation.** `v0` and `v1` make the basic distinction between original plan and updated plan visible. The effective-v1 behaviour can inherit unchanged jobs from v0, reducing unnecessary duplication.
- **Comparison capability.** Users can compare v0 and v1 and can selectively copy work groups. This is a sound starting point for a reforecast bridge.
- **Multi-level review.** Dashboard filters, delivery units, engineers, work-group sets, groups, disciplines, job cards, period breakdowns, and work orders allow users to move from a portfolio signal to supporting operational detail.
- **Shared persistence and concurrency protection.** The canonical deployment uses PostgreSQL, and full forecast saves require an expected revision. A conflicting edit receives a conflict response rather than silently overwriting another user's full snapshot.
- **Import/export support.** Forecast, comment, work-done, and summary exports help reconcile the tool to source spreadsheets and downstream reporting.

### Quarterly variance commentary

- **Exception-led dashboard.** Forecast health, RAG status, top-ten variance, over/under filters, search, and review-status filters make it possible to focus review time on material or incomplete items.
- **Consistent drill-down.** Job breakdowns expose the period series, work-group performance, work orders, forecast comments, and review commentary in one place.
- **Stage-aware commentary and completion.** Commentary records contain FY and RF stage, and review status is keyed by job, FY, and stage. This supports separate evidence that a job was reviewed at RF3, RF6, RF9, or RF11.
- **Comment context.** Comments can be tagged to a work group or engineer, while forecast-builder comments remain attached to work-group/plan-version combinations. This gives both submission narrative and review discussion.
- **Evidence-ready data model.** The comment API and database already support root cause, corrective action, owner, due date, and evidence links, even though the current add-comment UI does not fully capture them.
- **Traceable operational source.** Work-order listings and amendment flags provide a route from a headline variance to the work that generated it.

### Six-month reforecast

- **RF6 is an explicit review stage.** It appears in the common stage list, comment categories, and stage-specific review status.
- **Pragmatic v1 construction.** Users can initialise from v0, copy selected work groups, copy actuals through a chosen period, edit remaining periods, and compare the result with v0.
- **Preservation of original plan.** Editing v1 does not inherently replace v0, enabling an original-plan versus updated-plan comparison.
- **Granular ownership.** Reforecast changes can be made at work-group and period level rather than only as an undifferentiated annual total.

## What needs improving

### Priority 0 — correct the management meaning of the numbers

#### 1. Separate actual, forecast-to-go, and latest estimate

The dashboard's calculation deliberately substitutes forecast for unreported future periods. That is useful for an expected-year-end series, but the substituted value is stored in the display field named `a` and presented as `Actual`. As a result:

- future periods appear to have actuals when they do not;
- full-year actual-to-plan variance is suppressed for forecast-to-go periods;
- “Actual”, “Work Done”, and “Forecast” are difficult for a reviewer to interpret consistently; and
- RAG status can change depending on whether a full-year or period-to-date view is being used without making the basis sufficiently explicit.

Use four unambiguous measures:

- **Original plan** — approved v0;
- **Actual to date** — work done only for closed/reported periods;
- **Forecast to go** — current forecast for future periods; and
- **Latest estimate / EAC** — actual to date plus forecast to go.

Then show both **actual-to-plan variance through the closed period** and **EAC-to-plan full-year variance**. Never label the hybrid series `Actual`.

#### 2. Define variance sign and denominator once

The tool calculates variance as actual/hybrid minus forecast and uses absolute variance divided by forecast for RAG. This needs a business definition covering:

- whether positive is favourable, adverse, or merely over-delivery;
- whether the comparison is actual vs phased original plan, actual vs latest forecast, or EAC vs annual plan;
- treatment of zero and negative plans;
- whether percentage thresholds are inclusive (the explainer says “greater than” while logic treats 10% and 50% as threshold hits); and
- materiality in units as well as percentage, so a tiny planned denominator does not dominate the exception list.

Recommended default: show signed delivery variance without calling it favourable/adverse, and configure a two-part materiality test (`absolute units >= X` **and/or** `absolute % >= Y`) by discipline or work group.

#### 3. Make the reporting cutoff controlled

The `Auto` cutoff is convenient, but a late or miscoded work-order period can move the effective reporting point for the whole dashboard. Store a governed “last closed period” per FY/delivery unit, display its source and timestamp, and restrict manual override to authorised users. Flag work reported beyond the closed period instead of silently moving the reporting basis.

### Priority 1 — make quarterly commentary a complete control

#### 4. Introduce explicit quarter/stage mapping

The system exposes RF3/RF6/RF9/RF11 and 13 periods, but does not encode what each stage means. Define, configure, and display:

| Review stage | Default closed period | Business purpose |
| --- | ---: | --- |
| RF3 | P3 | Q1 actual variance and outlook |
| RF6 | P6 | Q2 actual variance and six-month reforecast |
| RF9 | P9 | Q3 actual variance and year-end confidence |
| RF11 | P11 | Pre-close exception review |

If the organisation uses different period boundaries, make the mapping configuration rather than code. Clarify whether RF11 is a quarterly review, a pre-close review, or both.

#### 5. Make commentary structured and completion-based

The backend supports structured fields, but the current add-comment flow submits them empty. Add visible inputs for:

- variance driver/root cause;
- one-off vs timing vs permanent classification;
- quantified impact;
- corrective action;
- accountable owner;
- due date;
- expected recovery period;
- evidence link; and
- residual year-end impact.

Require commentary only when materiality rules are met, and prevent “Mark Reviewed” until required fields are complete or an explicit “no commentary required” reason is recorded. Preserve free text as a concise executive summary rather than the only structured evidence.

#### 6. Expand review workflow and audit evidence

Current status is effectively reviewed/not reviewed with a timestamp. Add `Draft → Submitted → Reviewed → Approved → Reopened`, together with actor identity, timestamps, role-based transitions, approval notes, and immutable status history. A current-state record alone cannot demonstrate who approved what or why it was reopened.

#### 7. Add quarterly rollups and output packs

The job-level exception workflow is good, but quarterly governance also needs:

- quarter-to-date and year-to-date totals;
- current-quarter, cumulative, and full-year outlook variance side by side;
- material variance counts with commentary-completeness counts;
- reforecast bridge by driver/work group/discipline;
- previous-quarter comparison; and
- a frozen/exportable review pack containing numbers, commentary, status, stage, cutoff, and generation timestamp.

### Priority 1 — make RF6 a true reforecast submission

#### 8. Store forecasts by submission/stage, not only v0/v1

Forecast storage is currently keyed by job, work group, FY, plan version, and period; it has no review-stage or submission identifier. Introduce a forecast-submission entity with at least:

- submission ID and label;
- FY and review stage;
- scenario/version;
- closed-through period;
- status;
- created/submitted/approved by and timestamps;
- source submission ID; and
- immutable snapshot rows after submission.

This allows v0, RF6 working draft, RF6 approved, RF9 outlook, and later scenarios to coexist. `v1` can remain a friendly label, but it should not be the primary governance key.

#### 9. Enforce RF6 actualisation rules

At RF6, P1–P6 should normally be locked to the governed actual snapshot and P7–P13 should be editable forecast-to-go. The existing copy-actuals action is optional and can target a user-selected period. Replace this for formal submission with validation that:

- closed periods reconcile to the selected actual snapshot;
- future periods are forecast, not copied actual placeholders;
- annual totals reconcile to work-group detail;
- material v0-to-RF6 changes have structured explanation; and
- no unassigned or invalid work groups remain.

Allow authorised exceptions, but require a reason and audit record.

#### 10. Provide a reforecast bridge

The v0/v1 cell comparison is useful, but management needs a summarised bridge:

`Original annual plan → actual variance through P6 → future-phasing change → scope/volume change → approved RF6 latest estimate`.

Require every material change to carry a driver code and narrative so the bridge can be aggregated without manually interpreting free text.

### Priority 2 — strengthen usability, data quality, and operations

- **Terminology:** Rename `Plan v1 (Updated)` to a business-defined label such as `Working reforecast` until it is submitted; distinguish “forecast comment” from “review commentary”.
- **Data freshness:** Show source file, upload time, uploader, record count, closed-through period, and reconciliation result for work done and forecasts on the dashboard.
- **Reconciliation:** Display forecast job total vs sum of work groups and block submission on differences rather than relying on recalculation behaviour alone.
- **Permissions:** Separate forecast editor, commenter, reviewer, approver, and administrator capabilities. The current shared backend model does not demonstrate user identity or role-based authority.
- **Change history:** Record before/after values for individual changes, not only current forecast state and an aggregate revision counter.
- **Notifications:** Alert owners to material variances without commentary, overdue actions, reopened reviews, and approaching submission deadlines.
- **Accessibility and interaction:** Replace ambiguous icon/text controls and browser alerts/confirms with accessible, non-destructive confirmations and inline validation; ensure keyboard focus is managed across the many modals.
- **Configuration:** Move FY list, review stages, stage-to-period mapping, thresholds, delivery units, and terminology into governed configuration.
- **Testing:** Add calculation tests for cutoff behaviour, hybrid/EAC totals, zero denominators, threshold boundaries, cumulative variance, stage isolation, RF6 locking, and submission immutability. Existing automated coverage is concentrated in storage and backend validation rather than end-to-end management calculations.

## What needs clarifying with process owners

The following questions must be answered before implementation because they change the data model or the meaning of reports.

### Forecast policy

1. Is v0 the approved annual budget, the initial operational forecast, or both?
2. Is v1 exclusively the six-month reforecast, or a continuously updated working forecast throughout the year?
3. Should RF3, RF6, RF9, and RF11 each preserve a separate numerical forecast snapshot, or do some stages review the same forecast?
4. Are all 13 periods equal accounting periods, and exactly which periods form each quarter?
5. Which source is authoritative for actuals, and when is a period considered closed?
6. Can actuals be amended after close? If so, should prior review packs retain the original actual snapshot or restate?
7. Are forecast values permitted to be negative, and are zero forecasts valid or missing?

### Variance policy

8. Does positive variance mean favourable, over-delivery, or simply actual above plan? Does this differ by job type?
9. Which headline is required: QTD actual vs plan, YTD actual vs plan, EAC vs annual plan, EAC vs prior forecast, or all four?
10. What are the materiality thresholds in absolute units and percentages, and should they vary by discipline/work group?
11. Should RAG be based on the original plan, latest approved forecast, or both?
12. How should jobs with forecast zero and actual non-zero be classified and ranked?

### Commentary and approval policy

13. Who authors, reviews, and approves commentary at each organisational level?
14. Is one job-level comment sufficient, or is commentary required per material work group/variance driver?
15. Which structured fields are mandatory, and what makes a comment “complete”?
16. Can a reviewer mark an exception complete without an action, and who can waive commentary?
17. What retention, evidence, and audit requirements apply to submitted forecasts and review decisions?

### RF6 policy

18. Must P1–P6 equal actuals exactly at submission, including later adjustments?
19. Does RF6 replace the annual plan for performance reporting, or remain a separate outlook while v0 stays the accountability baseline?
20. Which bridge categories are required for explaining v0-to-RF6 change?
21. Is approval required at job, delivery-unit, discipline, and/or portfolio level?
22. Can an approved RF6 submission be reopened, and must reopening create a new revision rather than mutate the approved one?

## Recommended target workflow

1. **Set context:** Administrator opens the FY/stage, sets the governed closed period, materiality rules, and submission deadline.
2. **Load and reconcile actuals:** Import work done with provenance; validate duplicates, invalid periods/work groups, and control totals; publish an actual snapshot.
3. **Calculate review views:** Present QTD/YTD actual vs phased v0, forecast-to-go, EAC vs annual v0, and movement vs the prior approved outlook.
4. **Triage exceptions:** Route material exceptions to the accountable owner; non-material records may be auto-classified as no-comment-required.
5. **Complete commentary:** Capture driver, quantified impact, action, owner, due date, recovery period, evidence, and executive summary.
6. **Build RF6:** Lock P1–P6 to the actual snapshot, edit P7–P13, classify material movements, and reconcile totals.
7. **Review and approve:** Submit at job/work-group level, roll up completion, approve by authorised roles, and resolve any reopened items.
8. **Freeze and publish:** Create immutable numerical and commentary snapshots and produce the quarterly/RF6 pack with source and generation metadata.
9. **Track actions:** Carry open actions into the next stage without copying stale variance commentary as if it were current.

## Prioritised delivery plan

### Release 1 — trustworthy measures

- Rename and separate actual, forecast-to-go, and EAC.
- Display YTD actual-to-plan and full-year EAC-to-plan variance together.
- Govern the closed period and align threshold boundary wording with calculations.
- Add calculation-focused automated tests.

**Exit criterion:** A reviewer can explain every headline number and reproduce it from plan, work done, cutoff, and forecast-to-go without relying on hidden substitution rules.

### Release 2 — complete quarterly review

- Configure stage-to-period mapping and materiality.
- Expose structured commentary fields and completeness validation.
- Add submitted/reviewed/approved workflow, identity, history, and quarterly pack export.

**Exit criterion:** Every material quarterly variance is either supported by complete, approved commentary or has an auditable waiver.

### Release 3 — governed RF6 reforecast

- Add submission IDs and immutable stage snapshots.
- Lock RF6 actual periods and validate reconciliation.
- Add change-driver classification and a v0-to-RF6 bridge.
- Freeze and publish approved RF6 submissions.

**Exit criterion:** The organisation can reproduce the exact approved RF6 forecast, its actual-data basis, every material change from v0, and its approval history after later forecasts have been created.

### Release 4 — scale and assurance

- Add permissions, notifications, saved views, bulk assignment/approval, and portfolio-level sign-off.
- Add end-to-end tests, accessibility checks, operational monitoring, and backup/restore exercises.

**Exit criterion:** The tool supports the intended user population and audit requirements without spreadsheet side controls.

## Suggested success measures

- 100% of headline metrics display basis, comparison, through-period, and data timestamp.
- 100% of material exceptions have complete commentary or an approved waiver.
- 100% of submitted RF6 actual periods reconcile to the governed actual snapshot.
- 100% of approved submissions are immutable and reproducible.
- Reduction in median time from period close to approved review pack.
- Reduction in manual reconciliation adjustments and comments returned for rework.
- Percentage of actions completed by due date and variance recoveries achieved by the stated recovery period.

## Overall conclusion

Keep the existing operational navigation, detailed forecast builder, exception dashboard, drill-down, imports/exports, and stage-aware comments/reviews. Those are the tool's strongest foundations. Before relying on it for formal quarterly or six-month governance, prioritise measure semantics, stage-specific immutable submissions, controlled cutoffs, structured commentary, and approval history. The central design decision is whether `v1` is a live working forecast or the approved RF6 record; it should not be expected to serve both purposes without a separate submission/snapshot layer.
