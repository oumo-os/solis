<?php
/**
 * Solis MySQL Backup Script
 *
 * Usage:
 *   php platform/db/backup-mysql.php                  # timestamped backup
 *   php platform/db/backup-mysql.php --latest          # also writes latest.sql
 *   php platform/db/backup-mysql.php --compress        # gzip compression
 *   php platform/db/backup-mysql.php --db solis_prod   # override database name
 */

$opts = getopt('', ['db:', 'latest', 'compress', 'help']);
if (isset($opts['help'])) {
    echo "Usage: php backup-mysql.php [--db name] [--latest] [--compress]\n";
    exit(0);
}

$dbHost = getenv('SOLIS_DB_HOST') ?: 'localhost';
$dbPort = (int)(getenv('SOLIS_DB_PORT') ?: 3306);
$dbUser = getenv('SOLIS_DB_USER') ?: 'root';
$dbPass = getenv('SOLIS_DB_PASS') ?: '';
$dbName = $opts['db'] ?? getenv('SOLIS_DB_NAME') ?: 'solis';
$backupDir = __DIR__ . '/backups';
$ts = date('Y-m-d_H-i-s');
$filename = "solis_{$ts}.sql";

if (!is_dir($backupDir)) mkdir($backupDir, 0755, true);

// Locate mysqldump: PATH first (portable), then XAMPP default
$mysqldump = '';
if (PHP_OS_FAMILY === 'Windows') {
    $mysqldump = trim(shell_exec('where mysqldump 2>nul') ?: '');
} else {
    $mysqldump = trim(shell_exec('which mysqldump 2>/dev/null') ?: '');
}
$mysqldump = strtok($mysqldump, "\r\n");
if (!$mysqldump || !file_exists($mysqldump)) {
    $mysqldump = 'M:/Dev/xampp/mysql/bin/mysqldump.exe';
}
if (!$mysqldump || !file_exists($mysqldump)) {
    echo "ERROR: mysqldump not found. Provide full path in script or add to PATH.\n";
    exit(1);
}

$cmd = sprintf(
    '"%s" --host=%s --port=%d --user=%s --password=%s --single-transaction --routines --triggers %s 2>&1',
    $mysqldump, $dbHost, $dbPort, $dbUser, $dbPass, $dbName
);

$output = shell_exec($cmd);
if ($output === null || $output === false) {
    echo "ERROR: mysqldump failed to execute.\n";
    exit(1);
}

// Strip password warning if any
$output = preg_replace('/^Warning: Using a password on the command line.*\n?/m', '', $output);

if (strlen($output) < 100) {
    echo "ERROR: Backup output suspiciously small (" . strlen($output) . " bytes). Output:\n$output\n";
    exit(1);
}

$dest = $backupDir . '/' . $filename;

if (isset($opts['compress']) && function_exists('gzencode')) {
    $compressed = gzencode($output);
    $dest .= '.gz';
    file_put_contents($dest, $compressed);
    $size = strlen($compressed);
    $label = 'compressed';
} else {
    file_put_contents($dest, $output);
    $size = strlen($output);
    $label = 'raw';
}

echo "Backup saved: $dest ($size bytes, $label)\n";

if (isset($opts['latest'])) {
    $latest = $backupDir . '/latest.sql';
    if (isset($opts['compress']) && function_exists('gzencode')) {
        $latest .= '.gz';
        file_put_contents($latest, $compressed);
    } else {
        file_put_contents($latest, $output);
    }
    echo "Latest symlink: $latest\n";
}

// Prune backups older than 30 days
$keep = 30;
$files = glob($backupDir . '/solis_*.sql*');
if ($files) {
    $now = time();
    $pruned = 0;
    foreach ($files as $f) {
        if ($now - filemtime($f) > $keep * 86400) {
            unlink($f);
            $pruned++;
        }
    }
    if ($pruned) echo "Pruned $pruned backup(s) older than $keep days.\n";
}
