<?php
// Audit-only API wrapper — copy to <htdocs>/solis-audit/api.php to serve the
// platform API against the isolated `solis_audit` database (a copy of the
// live database), so module audits can exercise write paths without touching
// development data.
//
//   mkdir <htdocs>\solis-audit
//   copy this file to <htdocs>\solis-audit\api.php
//
// The wrapper lives outside the repository on purpose: it is scaffolding for
// the audit, not part of the product.
putenv('SOLIS_DB_NAME=solis_audit');
putenv('SOLIS_DB_USER=root');
putenv('SOLIS_DB_PASS=');
putenv('SOLIS_DB_HOST=localhost');
putenv('SOLIS_DB_PORT=3306');
require __DIR__ . '/../../solis/platform/api.php';
