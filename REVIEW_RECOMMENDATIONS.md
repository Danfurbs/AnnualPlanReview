# Annual Plan Review - Bug & Feature Review

## Scope Reviewed
- Backend API and data layer (`backend/server.js`, `backend/routes/*`, `backend/services/*`)
- Core planning/review workflows implied by forecast, baseline, comments, work-done, and groups endpoints

## Bugs / Corrective Items

### 1) Stale forecast comments can persist after work-group changes
- **Evidence**: `saveForecast` deletes forecast rows but does not clear prior `forecast_comments` rows for the same job/year/version before reinserting current comments.
- **Where**:
  - PostgreSQL service: `backend/services/database-pg.js` (`saveForecast`)
  - SQLite service: `backend/services/database.js` (`saveForecast`)
- **Impact**: If a work group is removed or renamed, old comments may still be returned and displayed, creating inaccurate narrative context.

**Options**
1. **Delete comments per job/year/version before insert** (recommended)
   - Add a delete on `forecast_comments` matching the same job/year/version in `saveForecast`.
2. **Upsert + reconcile by active work-group keys**
   - Keep existing rows but delete rows not in incoming `wgs` set.

**Rationale**
- Option 1 is simplest and deterministic for full-replacement saves.
- Option 2 preserves history potential, but introduces more complexity and edge-case handling.

---

### 2) CORS wildcard + credentials can break authenticated browser calls
- **Evidence**: Server config sets `credentials: true` while defaulting origin to `*`.
- **Where**: `backend/server.js`
- **Impact**: Browsers reject credentialed CORS responses with wildcard origin; this can cause confusing intermittent client failures when cookies/auth are introduced.

**Options**
1. **Set `credentials: false` when origin is `*`** (recommended)
2. **Require explicit allowlist origins in all non-local environments**
3. **Dynamic per-request origin reflection with allowlist validation**

**Rationale**
- Option 1 is fastest stabilization with minimal behavior change.
- Option 2 is best long-term security posture.
- Option 3 is flexible for multi-tenant frontends but requires careful implementation.

---

### 3) Bulk comment validation treats valid falsy values as “missing”
- **Evidence**: `hasRequiredCommentFields` uses `!comment[field]` checks.
- **Where**: `backend/routes/comments.js`
- **Impact**: Values like `0` or `false` are rejected as missing even when present (especially future enum/numeric fields), reducing API robustness.

**Options**
1. **Use null/undefined checks only** (recommended)
2. **Schema validation with explicit constraints (e.g., Ajv/Zod/Joi)**

**Rationale**
- Option 1 is quick and low risk.
- Option 2 scales better and centralizes request validation consistency.

---

### 4) Inconsistent input validation across routes
- **Evidence**: Forecast routes enforce fiscal year/plan/job validation; groups/work-done routes accept looser input.
- **Where**: `backend/routes/forecasts.js`, `backend/routes/groups.js`, `backend/routes/work-done.js`
- **Impact**: Potential malformed records, difficult-to-debug downstream issues, and inconsistent API behavior.

**Options**
1. **Centralize reusable validators and apply to all routes** (recommended)
2. **Adopt OpenAPI + generated/request middleware validation**

**Rationale**
- Option 1 improves reliability quickly with moderate effort.
- Option 2 brings stronger contract governance and client generation support.

---

### 5) High payload limits without endpoint-specific controls
- **Evidence**: Body parser allows `50mb` globally.
- **Where**: `backend/server.js`
- **Impact**: Increased risk of resource pressure/DoS from oversized payloads, especially for endpoints not expecting large uploads.

**Options**
1. **Lower global limit and selectively raise for upload endpoints** (recommended)
2. **Keep limit but add API gateway/proxy request-size enforcement**

**Rationale**
- Option 1 keeps app-level guardrails close to code.
- Option 2 is useful defense-in-depth if infra controls are available.

---

## Feature Opportunities for Annual Plan vs Work-Done Review

### A) Variance Narratives & Auto-Generated Commentary
Build system-assisted commentary that explains plan-vs-actual deltas by job/work-group/period.

**Options**
1. **Rule-based templates** (recommended first)
   - e.g., “P4 actual exceeded plan by X due to Y trend condition.”
2. **LLM-assisted draft comments with human approval**
3. **Hybrid: rules for flags + optional AI rewrite for readability**

**Rationale**
- Rule-based starts deterministic/auditable.
- LLM drafts increase analyst speed but require governance.

---

### B) Variance Workflow States (Draft → Reviewed → Approved)
Add review lifecycle tracking so commentary is auditable.

**Options**
1. **Simple status + timestamp + reviewer fields** (recommended)
2. **Full workflow engine with role-based transitions**

**Rationale**
- Option 1 gives immediate accountability.
- Option 2 supports enterprise controls when process matures.

---

### C) Materiality Thresholds & Alerting
Highlight only meaningful variance to reduce noise.

**Options**
1. **Global thresholds (absolute and %)**
2. **Configurable thresholds by work-group or job type** (recommended)
3. **Adaptive thresholds based on historical volatility**

**Rationale**
- Per-group thresholds align with operational reality.
- Adaptive thresholds are powerful but require reliable history.

---

### D) Evidence Attachments for Commentary
Allow attaching files/links (change orders, field notes, approvals) to comments.

**Options**
1. **URL/link attachments only** (recommended initial)
2. **File upload + storage + metadata + retention policy**

**Rationale**
- Link-based evidence is lightweight and cheap to ship.
- Native uploads improve completeness but add storage/security overhead.

---

### E) Period Reconciliation View (Plan, Forecast, Actual, Variance)
Create a dedicated comparison grid and trend chart for each job/work group.

**Options**
1. **Table-first MVP with export** (recommended)
2. **Interactive charting with drill-through to raw entries**

**Rationale**
- Table-first solves immediate reporting and review use cases.
- Charting improves executive storytelling and pattern detection.

---

### F) Comment Quality Controls
Improve consistency of commentary data quality.

**Options**
1. **Structured comment fields** (root cause, corrective action, owner, due date) (recommended)
2. **Free-form text with linting suggestions**

**Rationale**
- Structured fields improve reporting and follow-up.
- Linting can complement but not replace structure.

---

### G) Benchmarking & Historical Context
Compare current variance against prior years/periods.

**Options**
1. **Prior-year same-period comparison** (recommended)
2. **Rolling 3-year median variance benchmarking**

**Rationale**
- Prior-year is easy to explain and quick to implement.
- Multi-year benchmarks reduce one-off distortions.

---

### H) Reviewer Productivity Features
Speed up review cycles for large portfolios.

**Options**
1. **Bulk actions (approve, tag, assign owner)** (recommended)
2. **Saved filters/pivots + sharable views** (recommended)
3. **Keyboard-first review mode**

**Rationale**
- Bulk + saved views can materially reduce time-to-review.
- Keyboard mode benefits power users once core UX is stable.

---

## Suggested Build Order
1. Correctness/security fixes (bugs 1–5).
2. Data model enhancements for structured commentary + statuses.
3. Variance reconciliation UI (table + export).
4. Thresholds/alerts and benchmarking.
5. AI-assisted narrative drafting (optional, controlled rollout).

## Success Metrics
- Reduced stale/invalid comment incidents.
- Faster median review cycle time per job.
- Higher percentage of records with actionable commentary fields filled.
- Lower rework from audit/reconciliation findings.
