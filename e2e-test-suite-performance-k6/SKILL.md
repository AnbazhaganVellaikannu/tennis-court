---
name: e2e-test-suite-performance-k6
description: Use when building or running an on-demand k6 load/performance test suite for a full-stack web app — React/Vite (or similar) frontend, Node/Express (or similar) backend, a real database, session-cookie auth — that the user will run repeatedly before merging changes to verify the app meets its latency/throughput/concurrency requirements, including projected future growth. Covers mandatory NFR-gathering (never invent load targets), mandatory non-prod-database isolation with a technical guard, k6 project structure (NFR-driven config, smoke/load/stress scenarios, per-endpoint tagged thresholds), session-cookie auth gotchas specific to k6 (CSRF Origin-header requirement, per-iteration cookie-jar reset), data setup so business flows measure real performance instead of the test's own artificial exhaustion, and detailed HTML+JSON reporting for troubleshooting. Distilled from building a suite against a React+Express+Postgres+Better Auth e-commerce app, which surfaced a real capacity ceiling (an undersized DB connection pool) at the user's stated concurrency target.
---

# Building an on-demand k6 performance test suite

The goal is a suite the user runs **repeatedly, on demand, before merging** —
not a one-off demo with invented numbers. Three properties matter more than
raw scenario count: **the load must reflect the app's actual NFR, not a
generic default**, **it must never run against a production or shared dev
database**, and **a failure must point at a real, explainable capacity
limit** (a connection pool, a lock, an N+1 query) **so the user can
troubleshoot it, not just see a red threshold**. Everything below serves one
of those three goals.

## Phase 0 — Gather the NFR before writing a single script

Every application has different Non-Functional Requirements. A load test
built around invented numbers ("let's try 50 VUs") tells the user nothing
about whether *their* requirement is met. **Ask, every time this skill is
used on a new app, before generating any load:**

- Current expected concurrency (concurrent users / sessions) and throughput
  (requests or transactions per second).
- Projected future load (a growth multiplier, or a specific future number) —
  this is what turns the suite into a capacity-planning tool instead of a
  today-only check.
- Acceptable latency (p95 and p99 — a single "average" number is not
  enough to catch a long tail that a subset of real users would feel).
- Error budget (what error rate, if any, is acceptable).
- Which flows matter most and their relative traffic share (e.g. "70%
  browsing, 20% login churn, 10% checkout") — this becomes the scenario mix,
  not an even split across endpoints.

If the user doesn't have exact numbers, offer a small set of concrete
presets (e.g. "demo-scale: ~20 concurrent users, 2x growth headroom, p95
500ms/p99 1000ms, <1% errors") rather than silently picking one — but still
get an explicit choice. Write the agreed numbers into one config file (see
Phase 3) so they're a visible, editable, single source of truth — not
scattered across script files as magic numbers.

## Phase 1 — Isolate the database before running any load, no exceptions

**This is as important here as it is for a UI regression suite, arguably
more so**: a load test generates *sustained*, *concurrent* write traffic
(new users, new orders/bookings, decremented stock/seats/slots) for minutes
at a time. Pointed at a real dev or production database, it will pollute or
exhaust real data and skew real metrics/dashboards while it runs.

**Always ask the user for a dedicated, non-prod database connection string
before running anything — mandatory, every time, no default.** Never reuse
the app's existing dev `DATABASE_URL`, and never infer one from a previous
project. If the DB is Neon, a branch is the cheapest way to get one (Console
→ project → Branches → New Branch). Get the actual connection string from
the user directly.

Don't stop at asking — **add a technical guard**, not just a documented
rule, mirroring the e2e suite's `reuseExistingServer: false` philosophy of
failing loudly instead of silently doing the dangerous thing. Before any
script that touches the DB runs, compare the load-test `DATABASE_URL`'s host
against the real `.env`'s `DATABASE_URL` host and refuse to continue if they
match:

```js
// scripts/assert-nonprod-db.mjs
function hostOf(cs) { try { return new URL(cs).host; } catch { return null; } }
const loadtestHost = hostOf(process.env.DATABASE_URL);
const realHost = hostOf(/* read from the app's real .env */);
if (realHost && realHost === loadtestHost) {
  console.error('Refusing to run: load-test DATABASE_URL matches the real .env host.');
  process.exit(1);
}
```

Wire the chosen DB into its own env file (`.env.loadtest`, git-ignored,
separate from both `.env` and any `.env.test` an e2e suite already uses so a
heavy k6 run never contends with either), and inject it via a small
Node script (`dotenv` + `spawnSync`) rather than shell-sourcing — a plain
`source .env.loadtest` can silently truncate a connection string at the
first unescaped `&` in its query string (e.g.
`?sslmode=require&channel_binding=require`).

**Auth-provider migration gotcha** (same one that bites the Playwright e2e
skill): if the app uses a batteries-included auth library (Better Auth,
Supabase Auth, etc.), its user/session tables are usually created by a
*separate* one-time CLI migration, not the app's own idempotent schema
bootstrap. A fresh load-test database will 500 on the very first signup
request (`relation "user" does not exist`) until that migration runs once
against it. Check for this and run it as part of one-time setup — for
Better Auth: `npx @better-auth/cli migrate --config server/auth.js -y`
with the load-test env injected.

## Phase 2 — Read the app before scripting

Don't guess endpoints, payload shapes, or auth flow. Read the actual route
handlers, the auth client/middleware, and the one or two non-trivial
transactions (checkout, booking, payment) — these are almost always both
the highest business value *and* the most likely place a real capacity
limit shows up (a row lock, a multi-statement transaction, an N+1 query).
Note any shared, small resource the code itself documents as a limit — e.g.
a capped connection pool (`new Pool({ max: 5 })`) — before running load;
that number is frequently the *actual* ceiling the test will find, not
application logic. Knowing it up front turns a failing threshold into an
explainable finding instead of a mystery.

## Phase 3 — NFR-driven config, not hardcoded numbers per script

Put every number gathered in Phase 0 in one config file that every test
script imports — VU counts, ramp timings, latency thresholds, traffic mix.
Re-running with a changed NFR (or reusing this skill on a different app)
should mean editing exactly one file, nothing else.

```js
// config/nfr.config.js
export const NFR = {
  concurrentUsers: 20,
  rampUp: '1m', hold: '3m', rampDown: '1m',
  stressMultiplier: 2, stressRampUp: '2m', stressHold: '3m', stressRampDown: '1m',
  latencyP95Ms: 500, latencyP99Ms: 1000,
  errorRateThreshold: 0.01,
  trafficMix: { browse: 0.7, auth: 0.2, checkout: 0.1 }, // sums to 1
};
```

Recommended project layout (k6 supports local ES module imports, so this
composes cleanly):

```
perf/
  config/nfr.config.js   # single source of truth (Phase 0's numbers)
  lib/http.js            # BASE_URL, shared headers (see Phase 4's Origin gotcha)
  lib/flows.js           # one exported function per traffic flow
  lib/checks.js          # business-outcome Counters/Trends + responseCallback default
  lib/thresholds.js      # NFR -> k6 options.thresholds (global + per-endpoint tag)
  lib/scenarios.js        # NFR -> k6 options.scenarios (VUs per flow, from trafficMix)
  lib/report.js          # shared handleSummary (Phase 8)
  tests/smoke.js          # 1 VU / few iterations per flow — wiring check
  tests/load.js           # today's NFR, sustained
  tests/stress.js         # NFR x growth multiplier, latency informational
  scripts/prepare-data.mjs
  scripts/assert-nonprod-db.mjs
  scripts/with-loadtest-env.mjs
  reports/                # git-ignored, timestamped JSON+HTML per run
```

BASE_URL should point k6 at the API directly (e.g. `http://localhost:3000`),
**not** through a frontend dev server's proxy (e.g. Vite's `:5173`) — that
proxy exists for browser dev convenience and adds a hop the load test
doesn't need. This suite measures the API layer; it does not render the
frontend or measure client-side performance (bundle size, paint timing) —
say so explicitly in the README so results aren't misread as covering that.

## Phase 4 — Session-cookie auth in k6: two gotchas that produce false failures

k6 maintains a cookie jar per VU, which makes it look like a browser session
— until these two behaviors diverge from one:

**1. Better Auth (and similar) CSRF protection requires a matching `Origin`
header on any request that carries a `Cookie` header.** A real browser
always sends `Origin` on same-site POSTs; k6 doesn't unless told to. The
moment a VU has a session cookie (right after sign-up) and makes another
authenticated call, it 403s with something like `MISSING_OR_NULL_ORIGIN` —
not a capacity problem, a missing header. Fix once, globally:

```js
// lib/http.js
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const JSON_HEADERS = { 'Content-Type': 'application/json', Origin: BASE_URL };
```

`BASE_URL` must be one of the app's configured trusted origins — it usually
already is for `localhost`, since that's what a real browser would send in
dev too.

**2. k6 resets each VU's cookie jar at the start of every new iteration** —
confirmed empirically, not assumed: a session cookie set in iteration N is
simply gone in iteration N+1 (`http.cookieJar().cookiesForURL(url)` returns
`{}`), unlike a real browser tab that persists a session across many
actions. A flow that signs up once (say, on `__ITER === 0`) and expects to
reuse that session for later iterations of the *same* VU will 401 starting
on iteration 2 if you rely on the jar alone. Fix: capture the session token
once and manually re-inject it at the start of every later iteration —

```js
let sessionToken = null; // module scope = one private copy per VU in k6

export function checkoutFlow(data) {
  if (!sessionToken) {
    const res = http.post(`${BASE_URL}/api/auth/sign-up/email`, JSON.stringify({...}), { headers: JSON_HEADERS });
    if (res.status !== 200) return; // handle failure, don't cache a bad token
    sessionToken = http.cookieJar().cookiesForURL(BASE_URL)['<session-cookie-name>']?.[0];
  } else {
    http.cookieJar().set(BASE_URL, '<session-cookie-name>', sessionToken);
  }
  // ...authenticated requests for this iteration...
}
```

This also means: don't build a "smoke test" as one combined function that
calls a login flow *and* a session-dependent flow back-to-back on a shared
VU unless you intend that — e.g. a flow that explicitly signs out at the
end of every iteration will invalidate a session another flow expected to
still be there, if they share a VU. Give each traffic flow its own
scenario/VU pool even in the smoke test (see Phase 6) — it's both more
correct and a more faithful rehearsal of how load/stress will actually run.

## Phase 5 — Data setup: measure real endpoint performance, not your own exhaustion

Any flow that decrements a shared counter (stock, seats, slots) will start
returning a legitimate "conflict" response (409, or similar) once that
counter runs out — and a sustained load test *will* run out of small seeded
quantities almost immediately. Before running load:

- **Top up the counter** to a level no plausible run will exhaust (e.g.
  seeded stock of 8-20 units → 100,000), so the test measures checkout
  latency under concurrency, not "how fast does the app say no." Reuse the
  app's own idempotent schema/seed functions if it has them, then run a
  bulk `UPDATE` — don't reimplement seeding logic separately.
- **Still concentrate writes on a small "hot" subset** of resources (e.g.
  the first 5 of a catalog) rather than spreading evenly across all of
  them, to deliberately exercise real lock contention the way a flash-sale
  or popular-item scenario would. Topping up stock removes *artificial*
  exhaustion; it shouldn't remove realistic contention.
- **Treat a legitimate business-conflict response as a business outcome,
  not an HTTP failure.** Use k6's per-request `responseCallback` to keep it
  out of `http_req_failed` (which drives the error-rate threshold), and
  track it with its own Counter so it's visible in the report without
  inflating the error rate:

  ```js
  const res = http.post(url, body, {
    responseCallback: http.expectedStatuses(201, 409), // 409 = correct "sold out" response
  });
  if (res.status === 201) ordersCreated.add(1);
  else if (res.status === 409) ordersStockConflict.add(1);
  else ordersFailed.add(1); // a real failure — anything else
  ```

## Phase 6 — Scenario design: smoke → load → stress, sized from the NFR

Three test files, sharing all `lib/` code:

- **`smoke.js`** — 1 VU, 2-3 iterations, **one scenario per traffic flow**
  (not a single combined function — see Phase 4's gotcha). Purpose is
  wiring correctness (right BASE_URL, DB reachable, payload shapes accepted,
  auth working), not performance. Run this first, always; a load test that
  fails on a header typo is a wasted run.
- **`load.js`** — `NFR.concurrentUsers`, split across flows by
  `NFR.trafficMix`, ramped up/held/down per `NFR.rampUp/hold/rampDown`. This
  is the one to run before merging — today's SLA, asserted for real.
- **`stress.js`** — `NFR.concurrentUsers * NFR.stressMultiplier`, same
  structure. This is the projected-growth check. Latency thresholds here
  are **informational, not asserted** (the app is allowed to slow down
  under 2x+ load) — what it must not do is error out. What it's for: eyeball
  the HTML report's latency-over-time chart for where it bends sharply
  upward — that's the actual current capacity ceiling, the number worth
  bringing to a "do we need to scale before this ships" conversation.

Turn `trafficMix` into per-flow VU counts once, shared by both `load.js` and
`stress.js` via a `multiplier` parameter, instead of duplicating the
arithmetic:

```js
// lib/scenarios.js
export function buildScenarios({ multiplier = 1, rampUp, hold, rampDown }) {
  const total = Math.round(NFR.concurrentUsers * multiplier);
  const vusFor = (frac) => Math.max(1, Math.round(total * frac));
  const stagesFor = (target) => [{ duration: rampUp, target }, { duration: hold, target }, { duration: rampDown, target: 0 }];
  return {
    browsing: { executor: 'ramping-vus', exec: 'browse', stages: stagesFor(vusFor(NFR.trafficMix.browse)) },
    auth:     { executor: 'ramping-vus', exec: 'authFlow', stages: stagesFor(vusFor(NFR.trafficMix.auth)) },
    checkout: { executor: 'ramping-vus', exec: 'checkoutFlow', stages: stagesFor(vusFor(NFR.trafficMix.checkout)) },
  };
}
```

k6 auto-tags every metric with `scenario:<name>` when scenarios are named
like this, so the report can answer "which flow degraded," not just give
one blended number.

## Phase 7 — Thresholds: global, per-endpoint, and smoke's exception

Tag every request with a stable `name` (`{ tags: { name: 'CreateOrder' } }`)
and set both a global `http_req_duration` threshold and per-tag overrides —
a write endpoint with a DB transaction (checkout, booking) legitimately
deserves a looser budget than a cached read, and diluting them into one
number hides which one actually broke:

```js
thresholds.http_req_duration = [`p(95)<${NFR.latencyP95Ms}`, `p(99)<${NFR.latencyP99Ms}`];
thresholds['http_req_duration{name:CreateOrder}'] = [`p(95)<${NFR.checkoutLatencyP95Ms}`];
```

**Don't assert tight latency thresholds in `smoke.js`.** Its first request
against a serverless/cold database (Neon, etc.) eats a real connection
cold-start that can dwarf any reasonable threshold and means nothing about
actual capacity — smoke should assert `checks` pass and error rate is low,
and leave latency assertions to `load.js`/`stress.js`, where the DB
connection is warm and the sample size is large enough to mean something.

## Phase 8 — Reporting: detailed enough to troubleshoot without re-running

Every test file exports a shared `handleSummary` that writes, per run,
timestamped so repeated runs never clobber each other:

- **HTML** — via [k6-reporter](https://github.com/benc-uk/k6-reporter),
  imported directly by URL (k6's bundler resolves remote ES module imports,
  same mechanism as `https://jslib.k6.io/...`): per-endpoint latency
  percentiles, thresholds pass/fail, checks, custom business metrics. This
  is what a human opens to actually diagnose a failure.
- **JSON** — the full metrics dump, for scripting/CI/diffing runs later.

```js
// lib/report.js
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

export function buildSummary(testName) {
  return (data) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `perf/reports/${testName}-${ts}`;
    return {
      stdout: textSummary(data, { indent: ' ', enableColors: true }),
      [`${base}.json`]: JSON.stringify(data, null, 2),
      [`${base}.html`]: htmlReport(data, { title: `k6 ${testName} report` }),
    };
  };
}
```

k6 writes each key of `handleSummary`'s return value to that path — no
manual filesystem code needed. Git-ignore `perf/reports/*.{json,html}` but
keep the directory (`.gitkeep`) so the path always exists.

## Phase 9 — Reading the result: look for the explainable ceiling

A failing latency threshold at the user's stated NFR concurrency is the
whole point of this suite — but "failed" isn't the end of the story, it's
the start of troubleshooting. Before reporting a finding, check it against
what Phase 2 already told you about the app: a small connection pool
(`max: 5` against 20+ concurrent DB-touching VUs), a per-request
transaction with a row lock, a synchronous call to a slow external service.
In practice, the *application logic* is very often fine (100% functional
checks passing, 0% HTTP failures) while *infrastructure sizing* is what
actually breaches the SLA — that distinction is what makes a report
actionable ("raise the DB pool size" or "add read replicas") instead of
just red. Call this out explicitly when summarizing results to the user,
with the specific metric (e.g. `CreateOrder p95`) and the specific
suspected cause (e.g. the pool size in `db.js`), not just "load test
failed."

## Running it

One-time: get the NFR (Phase 0) and the non-prod DB (Phase 1), run any
auth-provider migration, then `prepare-data` (schema/seed/counter top-up).
Per run: start the API pointed at the load-test DB in one terminal, then
`smoke` → `load` → `stress` in order — never skip smoke, and never run
`load`/`stress` if `smoke` didn't pass cleanly. Wire simple npm scripts
(`perf:prepare`, `perf:server`, `perf:smoke`, `perf:load`, `perf:stress`,
`perf:report` to reopen the latest HTML report) and tell the user to run
`perf:smoke` + `perf:load` before merging a change that could affect
throughput or latency, and `perf:stress` when they specifically want to
know how much headroom remains before a projected-growth number breaks it.
