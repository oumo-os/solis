# Audit suite

The module-by-module functionality audit as executable code. Each file is a
self-contained check suite; together they produced the reports in
[`../README.md`](../README.md) and the wave documents.

## What it needs

- The platform running (XAMPP: Apache + MySQL), the live app at `http://localhost/solis/`
- Node 18+ (the suites use only `node` built-ins)
- MySQL's client on the path, or `SOLIS_XAMPP` set (default `m:\dev\xampp`)

## Isolated environment (why it exists)

Write paths — votes, drafts, verdicts, applications, memberships — are exercised
against a **copy** of the live database so development data is never touched.

```bat
rem 1. copy the API wrapper next to the site (outside the repo)
copy docs\audit\suite\audit-api-wrapper.php  <htdocs>\solis-audit\api.php

rem 2. recreate the isolated database from a fresh dump of the live one
docs\audit\suite\reset-audit-db.cmd
```

The wrapper points the platform's own `api.php` at `solis_audit` through the
`SOLIS_DB_NAME` environment variable, so the audited code is exactly the shipped
code. Tear down by dropping the database and deleting the wrapper directory.

## Running

```bat
rem reset the isolated database before every module
docs\audit\suite\reset-audit-db.cmd

node docs\audit\suite\m00-isolation.mjs     rem the harness proves its isolation
node docs\audit\suite\m01-deliberation.mjs  rem proposals → deliberation → draft → aSTF
node docs\audit\suite\m02-voting.mjs        rem votes, aggregates, crystallisation
node docs\audit\suite\m03-astf.mjs         rem aSTF adjudication
node docs\audit\suite\m04-jstf.mjs          rem jSTF judicial investigation
node docs\audit\suite\m05-xstf.mjs         rem xSTF execution
node docs\audit\suite\m06-vstf.mjs         rem vSTF verification
node docs\audit\suite\m07-pastf.mjs        rem p-aSTF health review
node docs\audit\suite\m08-circles.mjs       rem circles & membership
node docs\audit\suite\m09-threads.mjs       rem threads & engagement
node docs\audit\suite\m10-observatory.mjs  rem publications, news, events, library
node docs\audit\suite\m11-projects.mjs      rem projects & undertakings
node docs\audit\suite\m12-participants.mjs  rem participants & organisations
node docs\audit\suite\m13-auth.mjs          rem auth, session & registration
node docs\audit\suite\m14-competence-settings.mjs  rem competence, settings, records
node docs\audit\suite\m15-ui-surfaces.mjs   rem whole-app boot & render
node docs\audit\suite\m16-security-matrix.mjs      rem the authorization matrix
node docs\audit\suite\m17-participation.mjs rem participation follows domains
```

Standing checks against the live application:

```bat
node docs\audit\suite\b5_test.mjs      rem circles sweep (live, non-destructive)
node docs\audit\suite\b4_static.js     rem no hardcoded content in the SPA
node docs\audit\suite\check_inline.js platform\index.html   rem inline scripts parse
node docs\audit\suite\smoke_root.js    rem the public site renders live data
```

`SOLIS_REPO` and `SOLIS_XAMPP` override the repository and XAMPP locations.

## Notes

- The suites write their machine-readable results to `%TEMP%\solis-audit-reports\`;
  the findings live in the markdown reports under `docs/audit/`.
- `m15-ui-surfaces.mjs` boots the entire SPA (external scripts plus the inline
  script) in a sandboxed DOM against the live payload — it is how "the app
  renders every surface with live data" is verified without a browser.
- `m16-security-matrix.mjs` is the one to re-run after any change to the
  authorization rules; `m17-participation.mjs` after any change to the
  participation rules.
