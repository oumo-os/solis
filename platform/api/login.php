<?php
require_once __DIR__ . '/config.php';

$body = getBody();
$email = trim($body['email'] ?? '');
$password = $body['password'] ?? '';

if (!$email || !$password) error('Email and password required');

$db = getDB();
$st = $db->prepare('SELECT * FROM users WHERE email = ?');
$st->execute([$email]);
$user = $st->fetch();

if (!$user || !password_verify($password, $user['password'])) {
  error('Invalid email or password', 401);
}

// Generate token (sliding 24h — reset expiry on each login)
$token = generateToken();
$expires = date('Y-m-d H:i:s', strtotime('+24 hours'));
$db->prepare('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
   ->execute([$user['id'], $token, $expires]);

// Strip password hash from response
unset($user['password']);
json([
  'token' => $token,
  'user' => $user,
]);
