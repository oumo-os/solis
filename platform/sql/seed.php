<?php
// Solis Commons — Seed script
// Run: php seed.php
// Reads mock.json and populates the database

$mockPath = __DIR__ . '/../mock.json';
if (!file_exists($mockPath)) die("mock.json not found at $mockPath\n");

$data = json_decode(file_get_contents($mockPath), true);
if (!$data) die("Failed to parse mock.json\n");

// ── DB connection ──
$host = '127.0.0.1';
$user = 'root';
$pass = '';

try {
  $pdo = new PDO("mysql:host=$host;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  ]);

  // Create database
  $pdo->exec('CREATE DATABASE IF NOT EXISTS solis_commons CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  $pdo->exec('USE solis_commons');

  // Run schema
  $schema = file_get_contents(__DIR__ . '/schema.sql');
  // Strip CREATE DATABASE and USE — we already did that
  $schema = preg_replace('/CREATE DATABASE.*?;/i', '', $schema);
  $schema = preg_replace('/USE\s+\S+\s*;/i', '', $schema);
  $pdo->exec($schema);
  echo "Schema applied.\n";

  // ── Seed users ──
  $insertUser = $pdo->prepare(
    'INSERT INTO users (id, name, initials, email, password, location, bio, essay, avatar, joined, status, standing, competence)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), location=VALUES(location), bio=VALUES(bio), essay=VALUES(essay)'
  );
  $pwdHash = password_hash('solis123', PASSWORD_BCRYPT);

  $seenEmails = [];

  // Helper: generate email from name
  function emailFromName(string $name): string {
    $parts = explode(' ', trim($name));
    if (count($parts) >= 2) {
      return strtolower($parts[0]) . '@solis.local';
    }
    return strtolower($name) . '@solis.local';
  }

  // Seed participants as users
  foreach ($data['participants'] ?? [] as $p) {
    $email = emailFromName($p['name']);
    while (in_array($email, $seenEmails)) {
      $parts = explode('@', $email);
      $email = $parts[0] . rand(1, 99) . '@solis.local';
    }
    $seenEmails[] = $email;

    $avatar = '';
    if (isset($p['avatar'])) {
      if (!empty($p['avatar']['gold'])) $avatar = 'gold';
      elseif (!empty($p['avatar']['gradient'])) $avatar = $p['avatar']['gradient'];
    }

    // Extract domain keys from participant domains array
    // Domains are stored as array of { name, ws, color, ... } in mock.json
    // We store the raw participant data in app_data, so just insert user record

    $insertUser->execute([
      $p['id'] ?? strtolower(str_replace(' ', '-', $p['name'])),
      $p['name'],
      $p['initials'] ?? '',
      $email,
      $pwdHash,
      $p['location'] ?? '',
      $p['bio'] ?? null,
      null, // essay
      $avatar,
      $p['joined'] ?? date('Y-m-d'),
      'Active',
      0, 0,
    ]);
    echo "  User: {$p['name']} <$email>\n";
  }

  // Seed currentUser
  $cu = $data['currentUser'] ?? [];
  if ($cu) {
    $email = $cu['email'] ?? emailFromName($cu['name']);
    while (in_array($email, $seenEmails)) {
      $parts = explode('@', $email);
      $email = $parts[0] . rand(1, 99) . '@solis.local';
    }
    $seenEmails[] = $email;

    $avatar = '';
    // currentUser doesn't have avatar field in the same way

    $insertUser->execute([
      $cu['id'] ?? 'current',
      $cu['name'],
      substr($cu['name'], 0, 2),
      $email,
      $pwdHash,
      $cu['location'] ?? '',
      $cu['bio'] ?? null,
      $cu['essay'] ?? null,
      $avatar,
      $cu['joined'] ?? date('Y-m-d'),
      $cu['status'] ?? 'Active',
      $cu['standing'] ?? 0,
      $cu['competence'] ?? 0,
    ]);
    echo "  CurrentUser: {$cu['name']} <$email>\n";
  }

  // ── Seed app_data (JSON blobs) ──
  $insertData = $pdo->prepare('REPLACE INTO app_data (data_key, data_value) VALUES (?, ?)');

  $keysToStore = [
    'participants', 'circles', 'cells', 'stfs', 'threads',
    'inbox', 'projects', 'domains', 'domainLayout', 'registration',
    'organisations', 'systemSettings', 'integrityRecords',
    'governanceEvents', 'circleApplications', 'stfCandidates',
    'projectApplications', 'governanceLedger', 'publications',
    'news', 'events', 'opportunities', 'stats', 'exitReasonLabels',
  ];

  foreach ($keysToStore as $key) {
    if (isset($data[$key])) {
      $json = json_encode($data[$key], JSON_UNESCAPED_UNICODE);
      $insertData->execute([$key, $json]);
      echo "  app_data: $key (" . strlen($json) . " bytes)\n";
    }
  }

  echo "\nDone! Database seeded successfully.\n";

} catch (Exception $e) {
  die("ERROR: " . $e->getMessage() . "\n");
}
