<?php
require_once __DIR__ . '/config.php';

$user = requireAuth();
$db = getDB();

// Build response matching mock.json shape
$st = $db->query('SELECT data_key, data_value FROM app_data');
$data = [];
foreach ($st as $row) {
  $data[$row['data_key']] = json_decode($row['data_value'], true);
}

// Add currentUser
$data['currentUser'] = [
  'id' => $user['id'],
  'name' => $user['name'],
  'initials' => $user['initials'],
  'location' => $user['location'],
  'bio' => $user['bio'],
  'essay' => $user['essay'],
  'joined' => $user['joined'],
  'status' => $user['status'],
  'standing' => (int)$user['standing'],
  'competence' => (int)$user['competence'],
  'activeRoles' => 0,
  'standingDrift' => '',
  'competenceNote' => '',
  'interestScore' => 0,
  'interestDrift' => '',
  'rolesBreakdown' => '',
  'domains' => [],
  'circles' => [],
  'activity' => [],
];

// Merge user-specific data from participants
$participants = $data['participants'] ?? [];
foreach ($participants as $p) {
  if ($p['id'] === $user['id'] || $p['name'] === $user['name']) {
    $data['currentUser']['domains'] = $p['domains'] ?? [];
    $data['currentUser']['circles'] = $p['circles'] ?? [];
    break;
  }
}

// Override currentUser circles with user's actual circle data
$userCircles = $data['userCircles'] ?? [];
if (isset($userCircles[$user['id']])) {
  $data['currentUser']['circles'] = $userCircles[$user['id']];
}

// User activity
$userActivity = $data['userActivity'] ?? [];
if (isset($userActivity[$user['id']])) {
  $data['currentUser']['activity'] = $userActivity[$user['id']];
}

json($data);
