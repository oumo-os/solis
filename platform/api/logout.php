<?php
require_once __DIR__ . '/config.php';

$user = requireAuth();

$header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? $_SERVER['Authorization'] ?? '';
preg_match('/^Bearer\s+(.+)$/i', $header, $m);
$token = $m[1];

$db = getDB();
$db->prepare('DELETE FROM auth_tokens WHERE token = ?')->execute([$token]);

json(['ok' => true]);
