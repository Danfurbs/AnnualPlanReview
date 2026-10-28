# Exports refresh proposal

Status: standalone Excel reports implemented. Combined review packs removed at the user’s request. Opening the modal performs no data reads or report calculations; preparation is on demand and yields in batches.

Implemented: left-menu Exports modal, independent DU/Engineer/Work Group Set scope for every report, inherited job filters with an explicit clear option, eight Excel reports, previews, multi-year coverage, printable variance brief, and a separate collapsed Saved data backups section. Forecast downloads remain in Forecast Builder, including saved-file controls moved from Settings. Comments Excel and JSON transfer formats are preserved. Browser acceptance checks encode and decode real XLSX workbooks using synthetic data.

## Aim

Add one **Exports** button to the dashboard's left menu. It opens a single modal for standalone review reports and non-forecast data backups. Keep forecast file exports in Forecast Builder.

## Existing exports and proposed destination

| Current export | Current location | Proposed home and treatment |
| --- | --- | --- |
| Comments Excel | Review card and upload modal | Exports: one Comments report with comment category and review-stage filters |
| Amended Work Orders Excel | Work Order Activity card | Exports: Work Orders report, defaulting to corrected orders, with an option for all uploaded orders |
| Work Group Job Summary Excel | Upload modal | Exports: rename Work Group Coverage; explain that this counts SJNs, with optional financial-year comparison |
| Forecast Summary Excel | Upload modal | Exports: refresh as Forecast Comparison, showing V0, latest effective forecast and movement |
| Top 10 Variance Brief print/PDF | Variance modal | Exports: preview and print/save PDF, retaining ranking controls |
| Comments JSON | Settings | Exports: Data backups; preserve the existing import-compatible format |
| Prior Submissions JSON | Baseline Management | Exports: Data backups; preserve import compatibility and make full-dataset scope explicit |
| V0 CSV/JSON | Forecast Builder | Keep in Forecast Builder |
| Forecast JSON and upload-template CSV | Settings | Consolidate into Forecast Builder's forecast export area; retain required transfer formats and clearly distinguish original V0, sparse V1 amendments and complete business views |

## Modal design

- Standalone expandable **Reports**, plus a separate **Data backups** section.
- A shared scope panel shows FY, RF stage, completed reporting cutoff, Delivery Unit, Engineer and Work Group Set. Search, SJN group, review status, variance and zero-volume filters appear explicitly when applicable.
- Confirmed default: inherit the current Delivery Unit and dashboard filters, with an explicit way to widen scope. Export scope changes do not change the dashboard.
- Each report has a short purpose statement, format, applicable filters, row/job count and one clear download action. Irrelevant controls are hidden rather than silently ignored.
- Whole-dataset backups and multi-year coverage reports display their different scope clearly; they do not pretend to follow current dashboard filters.
- Include a link to Forecast Builder for forecast file exports, without duplicating those download controls.
- Remove duplicate export buttons from Uploads, Settings, review cards and Baseline Management. Rename Upload & export files to Upload files, and Review & exports to Comments & review.

## Recommended report catalogue

| Report | Contents | Priority |
| --- | --- | --- |
| SJN performance | One row per SJN and unit: original plan, latest forecast, completed Work Done, projected full-year outcome, variance, RAG and review status | First release |
| Performance by period | SJN and Work Group Set rows for P1–P13, with V0, latest forecast, Work Done, projection and variance clearly identified | First release |
| Forecast comparison | V0 versus complete effective V1, movement and which periods have explicit V1 updates | Refresh existing |
| Comments | SJN description, organisational ownership, comment category, RF stage, text and existing action fields | Refresh existing |
| Work Orders | Original and corrected units, difference, work order identity, period and available correction metadata; corrected-only/all option | Refresh existing |
| Work Group coverage | Number of SJNs with forecast evidence per Work Group Set and FY, separating original and effective forecast | Refresh existing |
| Review progress | Reviewed/unreviewed SJNs for the selected FY/RF, with Engineer and Work Group Set context | First release |
| Top 10 variance brief | Existing brief, with explicit scope, ranking basis and printable preview | Refresh existing |

Confirmed output priority: each report is standalone, with its own scope, preview and download. No combined review pack.

## Consistent calculations and safeguards

- Original plan means V0.
- Latest forecast means V1 period overrides over V0. Missing overrides inherit V0; explicit zero stays zero. Resolve this per SJN and Work Group Set.
- Projected outcome means corrected Work Done through the selected cutoff, followed by the latest forecast. The business-rule reforecast output uses this complete working position; label it distinctly from saved forecast values.
- Show missing Work Done or an unselected cutoff as unavailable, rather than zero. Forecast-only reports can still be generated without Work Done.
- Show forecast comparison columns together; do not reintroduce a V0/V1 selection for review reports.
- Mark explicit V1 values and include original values/change in comparison sheets. Excel cannot depend on browser hover tooltips.
- Count unique SJNs in coverage and review totals. Do not add group rollups to their member rows. Separate incompatible units in summaries.
- Use the same scope and calculation rules across preview and workbook. Define comment-only/untagged comment inclusion explicitly, following current organisational ownership.
- Read confirmed shared data for saved business records and combine it with the current session's Work Done when required. Block dependent exports on failed reads or unresolved saves; do not silently substitute stale data.
- Generate each report from its captured data and scope. Record generation time, source/load times, cutoff, unit definitions, applied filters and availability notes on an About sheet.
- Keep leading zeros in SJNs, numeric zeros, existing import formats and all comments intact. Use readable column widths, filters and consistent filenames. Treat user-entered spreadsheet content as text where needed.

## Delivery sequence

1. Scope defaults and output priorities are confirmed. Map existing file columns and import compatibility.
2. Build the Exports modal and common report/scope/data preparation layer. Relocate existing downloads and preserve Forecast Builder exports.
3. Refresh existing reports and add SJN performance, period detail and review progress. Keep every report standalone.
4. Retain the standalone printable Top 10 variance brief.
5. Verify downloaded contents against the dashboard for single SJNs, Engineers, DUs and groups; partial V1, explicit zero, mixed units, missing uploads, P0/P13, different FYs, empty results and failed data loads. Check keyboard/mobile access and backup round trips.

## Confirmed user preferences

1. Reports default to the current Delivery Unit and filters, with a clear option to widen scope.
2. Each report is standalone. Combined review packs have been removed.
