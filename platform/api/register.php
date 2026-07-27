<?php
require_once __DIR__ . '/config.php';

$body = getBody();

$name     = trim($body['name'] ?? '');
$email    = trim($body['email'] ?? '');
$password = $body['password'] ?? '';
$location = trim($body['location'] ?? '');
$bio      = trim($body['bio'] ?? '');
$essay    = trim($body['essay'] ?? '');

if (!$name || !$email || !$password) error('Name, email, and password required');
if (strlen($password) < 6) error('Password must be at least 6 characters');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) error('Invalid email address');

$db = getDB();

// Check duplicate email
$st = $db->prepare('SELECT id FROM users WHERE email = ?');
$st->execute([$email]);
if ($st->fetch()) error('Email already registered', 409);

// Generate ID and initials
$id = strtolower(preg_replace('/[^a-z0-9-]/', '', preg_replace('/\s+/', '-', trim($name))));
// Ensure unique id
$baseId = $id;
$suffix = 1;
$st = $db->prepare('SELECT id FROM users WHERE id = ?');
while (true) {
  $st->execute([$id]);
  if (!$st->fetch()) break;
  $id = $baseId . '-' . ($suffix++);
}

$words = explode(' ', $name);
$initials = '';
foreach ($words as $w) {
  if (!empty(trim($w))) $initials .= strtoupper($w[0]);
}
$initials = substr($initials, 0, 2);

$hash = password_hash($password, PASSWORD_BCRYPT);
$joined = date('Y-m-d');

$db->prepare('INSERT INTO users (id, name, initials, email, password, location, bio, essay, joined) VALUES (?,?,?,?,?,?,?,?,?)')
   ->execute([$id, $name, $initials, $email, $hash, $location, $bio, $essay, $joined]);

$token = generateToken();
$expires = date('Y-m-d H:i:s', strtotime('+24 hours'));
$db->prepare('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
   ->execute([$id, $token, $expires]);

$user = [
  'id' => $id,
  'name' => $name,
  'initials' => $initials,
  'email' => $email,
  'location' => $location,
  'bio' => $bio,
  'essay' => $essay,
  'joined' => $joined,
  'status' => 'Active',
  'standing' => 0,
  'competence' => 0,
];

json(['token' => $token, 'user' => $user], 201);
