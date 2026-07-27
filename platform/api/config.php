<?php
// Solis Commons API — Config & Helpers

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── DB Connection ──
function getDB(): PDO {
  static $db = null;
  if ($db) return $db;
  $host = '127.0.0.1';
  $port = 3306;
  $name = 'solis_commons';
  $user = 'root';
  $pass = '';
  $db = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  return $db;
}

// ── Response helpers ──
function json($data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function error(string $msg, int $code = 400): void {
  json(['error' => $msg], $code);
}

// ── Auth helpers ──
function generateToken(): string {
  return bin2hex(random_bytes(48));
}

function getAuthUser(): ?array {
  // XAMPP workaround: Authorization may arrive via different $_SERVER keys
  $header = $_SERVER['HTTP_AUTHORIZATION'] 
         ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] 
         ?? $_SERVER['Authorization'] 
         ?? '';
  if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) return null;
  $token = $m[1];
  $db = getDB();
  $st = $db->prepare('SELECT u.* FROM auth_tokens t JOIN users u ON t.user_id = u.id WHERE t.token = ? AND t.expires_at > NOW()');
  $st->execute([$token]);
  return $st->fetch() ?: null;
}

function requireAuth(): array {
  $user = getAuthUser();
  if (!$user) error('Unauthorized', 401);
  return $user;
}

// ── Read request body ──
function getBody(): array {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) error('Invalid JSON body');
  return $data;
}
