<?php
require_once __DIR__ . '/config.php';

$user = requireAuth();

// Load user domains, circles, activity from app_data
$db = getDB();
$st = $db->query('SELECT data_key, data_value FROM app_data');
$app = [];
foreach ($st as $row) {
  $app[$row['data_key']] = json_decode($row['data_value'], true);
}

// Build enriched user profile
$profile = [
  'id' => $user['id'],
  'name' => $user['name'],
  'initials' => $user['initials'],
  'email' => $user['email'],
  'location' => $user['location'],
  'bio' => $user['bio'],
  'essay' => $user['essay'],
  'joined' => $user['joined'],
  'status' => $user['status'],
  'standing' => (int)$user['standing'],
  'competence' => (int)$user['competence'],
  'activeRoles' => 0,
  'domains' => [],
  'circles' => [],
  'activity' => [],
];

// Find user's domain data in participants
$participants = $app['participants'] ?? [];
foreach ($participants as $p) {
  if ($p['id'] === $user['id'] || $p['name'] === $user['name']) {
    $profile['domains'] = $p['domains'] ?? [];
    $profile['circles'] = $p['circles'] ?? [];
    break;
  }
}

// Find user's activity
$allActivity = $app['userActivity'] ?? [];
if (isset($allActivity[$user['id']])) {
  $profile['activity'] = $allActivity[$user['id']];
}

json($profile);
