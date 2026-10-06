<?php
// api.php — Solis Commons database prototype server (PHP port of server.mjs)
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 86400');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$db = new mysqli(
    getenv('SOLIS_DB_HOST') ?: 'localhost',
    getenv('SOLIS_DB_USER') ?: 'root',
    getenv('SOLIS_DB_PASS') ?: '',
    getenv('SOLIS_DB_NAME') ?: 'solis',
    (int)(getenv('SOLIS_DB_PORT') ?: 3306)
);
if ($db->connect_error) { send(500, ['error' => 'DB: ' . $db->connect_error]); }
$db->set_charset('utf8mb4');

function send($code, $obj) { http_response_code($code); echo json_encode($obj); exit; }
function readBody() { $r = file_get_contents('php://input'); if (!$r) return (object)[]; $d = json_decode($r); return $d !== null ? $d : (object)[]; }
function dbGet($sql, $params = []) { global $db; $stmt = $db->prepare($sql); if (!$stmt) return null; if ($params) { $t = ''; foreach ($params as $p) $t .= is_int($p) && abs($p) < 2147483647 ? 'i' : 's'; $stmt->bind_param($t, ...$params); } $stmt->execute(); $r = $stmt->get_result(); $row = $r->fetch_assoc(); $stmt->close(); return $row; }
function dbAll($sql, $params = []) { global $db; $stmt = $db->prepare($sql); if (!$stmt) return []; if ($params) { $t = ''; foreach ($params as $p) $t .= is_int($p) && abs($p) < 2147483647 ? 'i' : 's'; $stmt->bind_param($t, ...$params); } $stmt->execute(); $r = $stmt->get_result(); $rows = []; while ($row = $r->fetch_assoc()) $rows[] = $row; $stmt->close(); return $rows; }
function dbRun($sql, $params = []) { global $db; $stmt = $db->prepare($sql); if (!$stmt) return null; if ($params) { $t = ''; foreach ($params as $p) $t .= is_int($p) && abs($p) < 2147483647 ? 'i' : 's'; $stmt->bind_param($t, ...$params); } $stmt->execute(); $info = ['affectedRows' => $stmt->affected_rows, 'insertId' => $stmt->insert_id]; $stmt->close(); return (object)$info; }
function pJson($s) { if ($s === null || $s === '') return null; $d = json_decode($s, true); return $d !== null ? $d : null; }
function groupBy($rows, $key) { $out = []; foreach ($rows as $r) { $k = $r[$key]; if (!isset($out[$k])) $out[$k] = []; $out[$k][] = $r; } return $out; }
function bindVal($v) { if (is_bool($v)) return $v ? 1 : 0; if (is_array($v) || is_object($v)) return json_encode($v); return $v; }
function legacyHash($pw) { return hash('sha256', (string)$pw); }
function isLegacyHash($s) { return preg_match('/^[0-9a-f]{64}$/', $s ?: ''); }
function hashPw($pw) { if (defined('PASSWORD_ARGON2ID')) return password_hash($pw, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 4, 'threads' => 3]); return password_hash($pw, PASSWORD_BCRYPT); }
function verifyPw($pw, $stored) { if (!$stored) return false; if (strpos($stored, '$argon2') === 0 || strpos($stored, '$2y$') === 0) return password_verify($pw, $stored); if (isLegacyHash($stored)) return hash_equals(legacyHash($pw), $stored); return false; }
$rateBuckets = [];
function rateLimit($key, $max, $windowMs) { global $rateBuckets; $now = (int)(microtime(true) * 1000); if (!isset($rateBuckets[$key]) || ($now - $rateBuckets[$key]['t'] > $windowMs)) $rateBuckets[$key] = ['n' => 0, 't' => $now]; $rateBuckets[$key]['n']++; $rateBuckets[$key]['t'] = $now; return $rateBuckets[$key]['n'] > $max ? (int)ceil(($rateBuckets[$key]['t'] + $windowMs - $now) / 1000) : null; }
function clientIp() { return preg_replace('/^::ffff:/', '', $_SERVER['REMOTE_ADDR'] ?? 'unknown'); }
$AUTH_LIMIT = 10; $AUTH_WINDOW_MS = 15 * 60 * 1000;
function genToken() { return bin2hex(random_bytes(48)); }
function getAuthHeader() {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) return $_SERVER['HTTP_AUTHORIZATION'];
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') return $v; }
    }
    return '';
}
function authUser() { $h = getAuthHeader(); if (!preg_match('/^Bearer\s+(.+)$/i', $h, $m)) return null; $u = dbGet('SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ? AND t.expires_at > NOW()', [$m[1]]); if ($u) maybeLiftSanctions($u['id'] ?? null); return $u; }
function isSteward($userId) { if (!$userId) return false; $ust = dbGet('SELECT status FROM users WHERE id = ?', [$userId]); if ($ust && in_array($ust['status'] ?? '', ['Restricted', 'Suspended'], true)) return false; return (bool)dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$userId]); }
function assertActiveMember($user) { if (!$user) return; $st = $user['status'] ?? ''; if ($st === 'Restricted' || $st === 'Suspended') send(403, ['error' => $st === 'Suspended' ? 'Activity frozen pending jSTF resolution' : 'Activity restricted pending jSTF investigation']); if ($st === 'Guest') send(403, ['error' => 'Guest privilege level — read and appeal only']); }
function syncTargetRestriction($userId, $restricted, $severity, $caseId = null) {
    if (!$userId) return;
    if ($restricted) {
        $want = $severity === 'frozen' ? 'Suspended' : 'Restricted';
        $cur = dbGet('SELECT status FROM users WHERE id = ?', [$userId]);
        if ($cur && $cur['status'] !== 'Former' && $cur['status'] !== $want) dbRun('UPDATE users SET status = ? WHERE id = ?', [$want, $userId]);
        return;
    }
    // Lifting is conservative: another open case still restricting keeps the
    // freeze; an active guest sanction restores Guest, never Active.
    foreach (dbAll("SELECT id, meta FROM cells WHERE type = 'jSTF Cell' AND status = 'Under Investigation'") as $oc) {
        if ($caseId && $oc['id'] === $caseId) continue;
        $om = pJson($oc['meta'] ?? '{}') ?: [];
        if (($om['targetId'] ?? null) === $userId && ($om['restriction']['state'] ?? '') === 'restricted') return;
    }
    if (jstfActiveSanction($userId, 'guest')) { dbRun("UPDATE users SET status = 'Guest' WHERE id = ?", [$userId]); return; }
    $cur2 = dbGet('SELECT status FROM users WHERE id = ?', [$userId]);
    if ($cur2 && in_array($cur2['status'] ?? '', ['Restricted', 'Suspended'], true)) dbRun("UPDATE users SET status = 'Active' WHERE id = ?", [$userId]);
}

// Strip everything up to /api or /api.php (works under any subdirectory base)
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH);
$path = preg_replace('#^.*/api(?:\.php)?#', '', $path);
$path = ($path === '' || $path === null) ? '/' : $path;
if ($path[0] !== '/') $path = '/' . $path;
$method = $_SERVER['REQUEST_METHOD'];
$cleanPath = rtrim($path, '/');


// ═════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ═════════════════════════════════════════════════════════
if ($method === 'POST' && $cleanPath === '/auth/login') {
    $body = readBody();
    $email = strtolower(trim((string)($body->email ?? '')));
    $retry = rateLimit('auth:' . clientIp(), $AUTH_LIMIT, $AUTH_WINDOW_MS);
    if ($retry) send(429, ['error' => 'Too many attempts', 'retryAfter' => $retry]);
    $user = dbGet('SELECT * FROM users WHERE lower(email) = ?', [$email]);
    $pw = (string)($body->password ?? '');
    if (!$user || !$user['password_hash'] || !verifyPw($pw, $user['password_hash'])) {
        if ($user) dbRun('UPDATE users SET failed_attempts = COALESCE(failed_attempts,0) + 1 WHERE id = ?', [$user['id']]);
        send(401, ['error' => 'Invalid email or password']);
    }
    if ($user['failed_attempts']) dbRun('UPDATE users SET failed_attempts = 0 WHERE id = ?', [$user['id']]);
    if (isLegacyHash($user['password_hash'])) { dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hashPw($pw), $user['id']]); $user['password_hash'] = null; }
    $token = genToken(); $expires = date('Y-m-d\TH:i:s.000\Z', time() + 86400);
    dbRun('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?,?,?)', [$user['id'], $token, $expires]);
    dbRun('DELETE FROM auth_tokens WHERE user_id = ? AND expires_at <= NOW()', [$user['id']]);
    unset($user['password_hash']);
    send(200, ['token' => $token, 'user' => $user]);
}
if ($method === 'POST' && $cleanPath === '/auth/register') {
    $retry = rateLimit('reg:' . clientIp(), $AUTH_LIMIT, $AUTH_WINDOW_MS);
    $body = readBody(); $name = $body->name ?? ''; $email = $body->email ?? ''; $password = $body->password ?? '';
    if ($retry) send(429, ['error' => 'Too many accounts from this address', 'retryAfter' => $retry]);
    if (!$name || !$email || !$password) send(400, ['error' => 'Name, email, and password required']);
    if (strlen((string)$password) < 6) send(400, ['error' => 'Password must be at least 6 characters']);
    if (dbGet('SELECT id FROM users WHERE lower(email) = ?', [strtolower((string)$email)])) send(409, ['error' => 'Email already registered']);
    $id = preg_replace('/^-+|-+$/', '', preg_replace('/[^a-z0-9]+/', '-', strtolower((string)$name))) ?: 'user-' . time();
    $words = preg_split('/\s+/', trim((string)$name)); $initials = '';
    foreach ($words as $w) $initials .= $w[0] ?? '';
    $initials = strtoupper(substr($initials, 0, 2));
    dbRun('INSERT INTO users (id,name,initials,email,location,bio,essay,joined,status,is_current,password_hash) VALUES (?,?,?,?,?,?,?,?,?,0,?)',
        [$id, $name, $initials, strtolower((string)$email), $body->location ?? '', $body->bio ?? '', $body->essay ?? '', date('Y-m-d'), 'Active', hashPw((string)$password)]);
    $token = genToken();
    dbRun('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?,?,?)', [$id, $token, date('Y-m-d\TH:i:s.000\Z', time() + 86400)]);
    $u = dbGet('SELECT * FROM users WHERE id = ?', [$id]); unset($u['password_hash']);
    send(201, ['token' => $token, 'user' => $u]);
}
if ($method === 'POST' && $cleanPath === '/auth/logout') {
    $h = getAuthHeader();
    if (preg_match('/^Bearer\s+(.+)$/i', $h, $m)) dbRun('DELETE FROM auth_tokens WHERE token = ?', [$m[1]]);
    send(200, ['ok' => true]);
}
if ($method === 'GET' && $cleanPath === '/auth/me') {
    $u = authUser(); if (!$u) send(401, ['error' => 'Unauthorized']); unset($u['password_hash']); send(200, ['user' => $u]);
}

// ═════════════════════════════════════════════════════════
// BOOTSTRAP ENDPOINT
// ═════════════════════════════════════════════════════════
if ($cleanPath === '/bootstrap' && $method === 'GET') {
    $empty = isset($_GET['empty']) && $_GET['empty'] === '1';
    $users = dbAll('SELECT * FROM users');
    $tok = null; $h = getAuthHeader();
    if (preg_match('/^Bearer\s+(.+)$/i', $h, $m)) $tok = $m[1];
    $currentRow = $tok ? dbGet('SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ? AND t.expires_at > ?', [$tok, date('Y-m-d\TH:i:s.000\Z')]) : null;
    $isSteward = isSteward($currentRow['id'] ?? null);
    // Integrity engine runs lazily here (no cron): conditions set by jSTF
    // verdicts (unverified claims, recorded vacancies) commission their own
    // vSTFs. Capped and idempotent — new rows appear on the next load.
    if (!$empty) integrityEnginePoll(3);
    $compByUser = groupBy(dbAll('SELECT * FROM user_competence'), 'user_id');
    $cirByUser = groupBy(dbAll('SELECT * FROM user_circles'), 'user_id');
    $orgByUser = groupBy(dbAll('SELECT * FROM user_orgs'), 'user_id');
    $dirByUser = groupBy(dbAll('SELECT * FROM participants'), 'user_id');
    $actByUser = groupBy(dbAll('SELECT * FROM user_activity'), 'user_id');

    $participants = [];
    $stewIds = [];
    foreach (dbAll("SELECT DISTINCT member_id FROM circle_roster WHERE status = 'active'") as $sr) $stewIds[$sr['member_id']] = true;
    foreach ($users as $u) {
        $dir = $dirByUser[$u['id']][0] ?? [];
        $participants[] = [
            'id' => $u['id'], 'name' => $u['name'], 'initials' => $u['initials'], 'status' => $u['status'],
            'steward' => !empty($stewIds[$u['id']]) && !in_array($u['status'] ?? '', ['Restricted', 'Suspended'], true),
            'standing' => $u['standing'] !== null ? (int)$u['standing'] : null,
            'location' => ($dir['location'] ?? $u['location']), 'joined' => ($dir['joined'] ?? $u['joined']),
            'avatar' => pJson($u['avatar'] ?? null) ?: [],
            'domains' => array_values(array_filter(array_map(function($c) { return $c['kind'] === 'roster' ? ['name' => $c['domain'], 'ws' => $c['ws'] ?? 0, 'color' => $c['color'] ?? null, 'evidence' => $c['evidence'] ?? null, 'verified' => (bool)($c['verified'] ?? false)] : null; }, $compByUser[$u['id']] ?? []))),
            'circles' => array_values(array_filter(array_map(function($c) { return $c['kind'] === 'roster' ? $c['circle'] : null; }, $cirByUser[$u['id']] ?? []))),
            'orgs' => array_values(array_map(function($o) { return $o['org_acronym']; }, $orgByUser[$u['id']] ?? [])),
            'bio' => $dir['bio'] ?? $u['bio'],
        ];
    }
    $currentUser = null;
    if ($currentRow) {
        $cuid = $currentRow['id'];
        $currentUser = [
            'id' => $cuid, 'name' => $currentRow['name'], 'initials' => $currentRow['initials'],
            'email' => $currentRow['email'], 'location' => $currentRow['location'], 'joined' => $currentRow['joined'],
            'status' => $currentRow['status'], 'standing' => $currentRow['standing'] ?? null, 'standingDrift' => $currentRow['standing_drift'] ?? null,
            'competence' => $currentRow['competence'] ?? null, 'competenceNote' => $currentRow['competence_note'] ?? null,
            'interestScore' => $currentRow['interest_score'] ?? null, 'interestDrift' => $currentRow['interest_drift'] ?? null,
            'activeRoles' => $currentRow['active_roles'] ?? null, 'rolesBreakdown' => $currentRow['roles_breakdown'] ?? null,
            'bio' => $currentRow['bio'], 'essay' => $currentRow['essay'], 'avatar' => pJson($currentRow['avatar'] ?? null) ?: [],
            'domains' => [], 'circles' => [], 'activity' => [],
        ];
        foreach (($cirByUser[$cuid] ?? []) as $c) { if ($c['kind'] === 'self') $currentUser['circles'][] = ['name' => $c['circle'], 'status' => $c['status'], 'since' => $c['since']]; }
        foreach (($actByUser[$cuid] ?? []) as $a) $currentUser['activity'][] = ['text' => $a['text'], 'time' => $a['time'], 'type' => $a['type']];
        $selfComp = array_values(array_filter($compByUser[$cuid] ?? [], function($c) { return $c['kind'] === 'self'; }));
        $compSrc = $selfComp ?: array_values(array_filter($compByUser[$cuid] ?? [], function($c) { return $c['kind'] === 'roster'; }));
        foreach ($compSrc as $c) $currentUser['domains'][$c['domain']] = ['ws' => $c['ws'] ?? null, 'wh' => $c['wh'] ?? null, 'interest' => $c['interest'] ?? null, 'barWs' => $c['bar_ws'] ?? null, 'barWh' => $c['bar_wh'] ?? null, 'members' => $c['members'] ?? null, 'evidence' => $c['evidence'] ?? null, 'verified' => (bool)($c['verified'] ?? false)];
        if (empty($currentUser['circles'])) foreach (($cirByUser[$cuid] ?? []) as $c) { if ($c['kind'] === 'roster') $currentUser['circles'][] = ['name' => $c['circle'], 'status' => 'Active', 'since' => $c['since']]; }
    }
    $kdByOrg = groupBy(dbAll('SELECT * FROM org_knowledge_domains'), 'org_id');
    $organisations = [];
    foreach (dbAll('SELECT * FROM organisations') as $o) {
        $organisations[] = ['id' => $o['id'], 'name' => $o['name'], 'acronym' => $o['acronym'], 'shortname' => $o['shortname'], 'location' => $o['location'], 'summary' => $o['summary'], 'status' => $o['status'], 'founded' => $o['founded'], 'foundingCell' => $o['founding_cell'], 'memberCount' => $o['member_count'], 'website' => $o['website'], 'logo' => $o['logo'], 'knowledgeDomains' => array_values(array_map(function($d) { return $d['domain']; }, $kdByOrg[$o['id']] ?? []))];
    }
    $domains = [];
    foreach (dbAll('SELECT * FROM domains') as $d) $domains[$d['id']] = ['label' => $d['label'], 'short' => $d['short'], 'color' => $d['color'], 'hasCircle' => (bool)$d['has_circle'], 'type' => $d['type'], 'taxonomy' => $d['taxonomy']];
    $layoutMeta = dbGet('SELECT * FROM domain_layout_meta WHERE id = 1');
    $seeds = []; foreach (dbAll('SELECT * FROM domain_layout') as $l) $seeds[$l['domain_id']] = [$l['x'], $l['y']];
    $domainLayout = ['worldSize' => $layoutMeta ? (int)$layoutMeta['world_size'] : 1800, 'seeds' => $seeds, 'camera' => pJson($layoutMeta['camera'] ?? null) ?: ['x' => 900, 'y' => 900, 'scale' => 0.5]];
    $cdByCircle = groupBy(dbAll('SELECT * FROM circle_domains'), 'circle_id');
    $rosterByCircle = groupBy(dbAll('SELECT * FROM circle_roster'), 'circle_id');
    $rdByRoster = groupBy(dbAll('SELECT * FROM circle_roster_domains'), 'roster_id');
    $propByCircle = groupBy(dbAll('SELECT * FROM circle_proposals'), 'circle_id');
    $resByCircle = groupBy(dbAll('SELECT * FROM circle_resolutions'), 'circle_id');
    $actByCircle = groupBy(dbAll('SELECT * FROM circle_activity'), 'circle_id');
    $circles = [];
    foreach (dbAll('SELECT * FROM circles') as $c) {
        $cds = $cdByCircle[$c['id']] ?? [];
        $roster = ['active' => [], 'former' => []];
        foreach (($rosterByCircle[$c['id']] ?? []) as $r) {
            $entry = ['id' => $r['member_id'], 'name' => $r['name'], 'initials' => $r['initials'], 'color' => $r['color'], 'ws' => $r['ws'], 'status' => $r['status'], 'joined' => $r['joined'], 'lastActive' => $r['last_active'], 'topDomain' => $r['top_domain'], 'domains' => array_map(function($d) { return $d['domain']; }, $rdByRoster[$r['id']] ?? []), 'domainWs' => array_map(function($d) { return $d['ws']; }, $rdByRoster[$r['id']] ?? [])];
            if ($r['status'] === 'former') { $entry['left'] = $r['left']; $entry['leftReason'] = $r['left_reason']; unset($entry['lastActive']); $roster['former'][] = $entry; } else { $roster['active'][] = $entry; }
        }
        $circles[] = ['id' => $c['id'], 'name' => $c['name'], 'status' => $c['status'], 'members' => $c['members'], 'motions' => $c['motions'], 'description' => $c['description'], 'founded' => $c['founded'], 'termOverride' => pJson($c['term_override'] ?? null), 'expiryOverride' => pJson($c['expiry_override'] ?? null), 'domains' => array_values(array_map(function($d) { return $d['domain']; }, array_filter($cds, function($d) { return !$d['mandate']; }))), 'mandate' => ['primary' => array_values(array_map(function($d) { return $d['domain']; }, array_filter($cds, function($d) { return $d['mandate'] === 'primary'; }))), 'secondary' => array_values(array_map(function($d) { return $d['domain']; }, array_filter($cds, function($d) { return $d['mandate'] === 'secondary'; })))], 'desiredWs' => array_reduce($cds, function($a, $d) { if ($d['desired_ws'] !== null) $a[$d['domain']] = $d['desired_ws']; return $a; }, []), 'roster' => $roster, 'proposals' => array_map(function($p) { unset($p['circle_id']); return $p; }, $propByCircle[$c['id']] ?? []), 'resolutions' => array_map(function($r) { unset($r['circle_id']); return $r; }, $resByCircle[$c['id']] ?? []), 'activity' => array_map(function($a) { unset($a['circle_id'], $a['id']); return $a; }, $actByCircle[$c['id']] ?? [])];
    }
    $cellDomains = groupBy(dbAll('SELECT * FROM cell_domains'), 'cell_id');
    $cellCircles = groupBy(dbAll('SELECT * FROM cell_circles'), 'cell_id');
    $msgByCell = groupBy(dbAll('SELECT * FROM cell_messages'), 'cell_id');
    $taskByCell = groupBy(dbAll('SELECT * FROM cell_tasks'), 'cell_id');
    $objByCell = groupBy(dbAll('SELECT * FROM cell_objectives'), 'cell_id');
    $teamByCell = groupBy(dbAll('SELECT * FROM cell_team'), 'cell_id');
    $draftByCell = groupBy(dbAll('SELECT * FROM draft_resolutions'), 'cell_id');
    $verByDraft = groupBy(dbAll('SELECT * FROM resolution_versions'), 'draft_id');
    $impByDraft = groupBy(dbAll('SELECT * FROM resolution_implementing_circles'), 'draft_id');
    $voteByCell = groupBy(dbAll('SELECT * FROM cell_votes'), 'cell_id');
    $voterByCell = groupBy(dbAll('SELECT * FROM vote_records'), 'cell_id');
    $draftVotesByCell = [];
    foreach (dbAll("SELECT cell_id, name, initials, vote FROM vote_records WHERE domain = 'resolution'") as $vr) { $draftVotesByCell[$vr['cell_id']][] = ['name' => $vr['name'], 'initials' => $vr['initials'], 'vote' => $vr['vote']]; }
    $vsumByCell = groupBy(dbAll('SELECT * FROM cell_vote_summary'), 'cell_id');
    $cells = [];
    $sealedStf = []; $sealedCase = []; $blankCircle = [];
    foreach (dbAll('SELECT * FROM cells') as $c) {
        $meta = pJson($c['meta'] ?? null) ?: [];
        $cell = ['id' => $c['id'], 'type' => $c['type'], 'title' => $c['title'], 'status' => $c['status'], 'delibType' => $c['delib_type'], 'participants' => $c['participants'], 'members' => $c['members'], 'progress' => $c['progress'], 'daysActive' => $c['days_active'], 'lead' => $c['lead'], 'circle' => $c['circle'], 'created' => $c['created'], 'deadline' => $c['deadline'], 'assessors' => $c['assessors'], 'commissionedBy' => $c['commissioned_by'], 'resolutionRef' => $c['resolution_ref'], 'entityType' => $c['entity_type'], 'source' => pJson($c['source'] ?? null), 'resolution' => pJson($c['resolution'] ?? null), 'deliverableSpecs' => pJson($c['deliverable_specs'] ?? null), 'domains' => array_values(array_map(function($d) { return $d['domain']; }, $cellDomains[$c['id']] ?? []))];
        foreach ($meta as $mk => $mv) { if ($mv !== null) $cell[$mk] = $mv; }
        if ($c['blind']) $cell['blind'] = true;
        $ccs = $cellCircles[$c['id']] ?? [];
        $cell['circles'] = array_values(array_filter(array_map(function($cc) { return empty($cc['circle_id']) && empty($cc['votes']) ? ['name' => $cc['name'], 'initials' => $cc['initials'], 'gradient' => $cc['gradient'], 'status' => $cc['status'], 'role' => $cc['role']] : null; }, $ccs)));
        $cell['participatingCircles'] = array_values(array_filter(array_map(function($cc) { return ($cc['circle_id'] || $cc['votes']) ? ['id' => $cc['circle_id'], 'name' => $cc['name'], 'role' => $cc['role'], 'votes' => $cc['votes']] : null; }, $ccs)));
        $cell['messages'] = array_map(function($m) { $msg = ['author' => $m['author'], 'initials' => $m['initials'], 'text' => $m['text'], 'time' => $m['time']]; if ($m['color'] !== null) $msg['color'] = $m['color']; return $msg; }, $msgByCell[$c['id']] ?? []);
        $cell['tasks'] = array_map(function($t) { return ['id' => $t['task_id'] ?: 't' . $t['id'], 'label' => $t['label'], 'status' => $t['status'], 'locked' => (bool)$t['locked'], 'assignee' => $t['assignee']]; }, $taskByCell[$c['id']] ?? []);
        $cell['objectives'] = array_map(function($o) { return ['id' => $o['obj_id'] ?: 'o' . $o['id'], 'label' => $o['label'], 'status' => $o['status'], 'assessors' => $o['assessors'] !== null ? (int)$o['assessors'] : null, 'deadline' => $o['deadline']]; }, $objByCell[$c['id']] ?? []);
        $cell['draftVotes'] = $draftVotesByCell[$c['id']] ?? [];
        $cell['team'] = array_map(function($t) use ($currentRow) { $meId = $currentRow['id'] ?? null; $meIni = $currentRow['initials'] ?? null; $self = $meId && (!empty($t['user_id']) ? $t['user_id'] === $meId : ($t['initials'] ?? null) === $meIni); return ['name' => $t['name'], 'initials' => $t['initials'], 'role' => $t['role'], 'focus' => $t['focus'], 'self' => (bool)$self]; }, $teamByCell[$c['id']] ?? []);
        // Blindness is team-only on judicial cells: anyone off the seated team
        // (or off the probe / commissioning team for xSTF) gets a sealed view —
        // no names, no target, no questions, no draft, no counts. Other blind
        // cells (motion audits) keep the steward rule so assessors can work.
        $judicialCell = in_array($c['type'] ?? '', ['jSTF Cell', 'xSTF Cell']);
        $auditClosed = (($c['type'] ?? '') === 'aSTF Cell') && (($c['delib_type'] ?? '') === 'judicial-audit') && (($c['status'] ?? '') === 'Verdict Filed');
        $caseSealed = false;
        if (!empty($c['blind'])) {
            if ($judicialCell) $caseSealed = !jstfTeamMember($c['id'], $currentRow) && !jstfProbeReader($c['id'], $currentRow);
            elseif (($c['type'] ?? '') === 'vSTF Cell') $caseSealed = !vstfReader($c['id'], $currentRow);
            elseif ($auditClosed) $caseSealed = true;
            else $caseSealed = !$isSteward;
        }
        if ($caseSealed) {
            $sealedStf['stf-' . $c['id']] = true; $sealedCase[$c['id']] = true;
            // jSTF and closed-audit rows carry the target in their circle
            // column — that column goes blank with the seal.
            if ($judicialCell || $auditClosed) $blankCircle['stf-' . $c['id']] = true;
            if (($c['type'] ?? '') === 'vSTF Cell') {
                // Verification is blind: candidate and filed assessors see the
                // record; everyone else sees that a verification exists.
                $cell['title'] = 'vSTF — sealed verification [' . $c['id'] . ']';
                unset($cell['candidateName'], $cell['candidateInitials']);
                $cell['assessments'] = [];
                if (is_array($cell['source'])) unset($cell['source']['candidateName'], $cell['source']['candidateInitials']);
                $cell['resolution'] = $cell['resolution'] ? ['status' => $cell['resolution']['status'] ?? 'Sealed'] : null;
            } elseif ($auditClosed) {
                // A closed judicial audit is precedent, not reading material:
                // the outcome lives in policies/integrity records; assessor
                // attribution and case theory stay sealed.
                $cell['title'] = 'aSTF — sealed audit [' . $c['id'] . ']';
                unset($cell['candidateName'], $cell['candidateInitials'], $cell['targetId'], $cell['targetName']);
                if (is_array($cell['source'])) unset($cell['source']['candidateName'], $cell['source']['candidateInitials'], $cell['source']['targetName']);
                $cell['verdict'] = null;
                $cell['assessments'] = [];
                $cell['resolution'] = $cell['resolution'] ? ['status' => $cell['resolution']['status'] ?? 'Sealed'] : null;
            } else {
            $sealedCellKind = (($c['type'] ?? '') === 'jSTF Cell') ? 'jSTF — sealed case' : (((($c['type'] ?? '') === 'aSTF Cell')) ? 'aSTF — sealed audit' : 'xSTF — sealed probe');
            $cell['title'] = $sealedCellKind . ' [' . $c['id'] . ']';
            $letters = ['A', 'B', 'C', 'D', 'E', 'F'];
            $blindLab = ($c['type'] === 'jSTF Cell') ? 'Adjudicator ' : 'Investigator ';
            $iniMap = []; $li = 0;
            $sealIni = function($ini, $teamLabel) use (&$iniMap, &$li, $blindLab, $letters) {
                $ini = (string)($ini ?? '');
                if ($ini === '') return ['lab' => 'Contributor ?', 'ini' => 'IN'];
                if (!isset($iniMap[$ini])) {
                    if ($teamLabel) { $tag = $letters[$li] ?? strval($li + 1); $iniMap[$ini] = ['lab' => $blindLab . $tag, 'ini' => 'I' . $tag]; }
                    else { $n = $li + 1; $iniMap[$ini] = ['lab' => 'Contributor ' . $n, 'ini' => 'IC' . $n]; }
                    $li++;
                }
                return $iniMap[$ini];
            };
            foreach (($cell['team'] ?? []) as $tv) $sealIni($tv['initials'] ?? '', true);
            $anonTeam = [];
            foreach (($cell['team'] ?? []) as $tv) { $mp = $sealIni($tv['initials'] ?? '', true); $anonTeam[] = ['name' => $mp['lab'], 'initials' => $mp['ini'], 'role' => $tv['role'], 'focus' => $tv['focus'], 'self' => false]; }
            $cell['team'] = $anonTeam;
            $cell['messages'] = array_map(function($m2) use ($sealIni) { $mm = $m2; $mp = $sealIni($m2['initials'] ?? '', false); $mm['author'] = $mp['lab']; $mm['initials'] = $mp['ini']; return $mm; }, $cell['messages']);
            if (!empty($cell['restriction']['votes']) && is_array($cell['restriction']['votes'])) $cell['restriction']['votes'] = array_map(function($v) use ($sealIni) { $mp = $sealIni($v['initials'] ?? '', false); $v['name'] = $mp['lab']; $v['initials'] = $mp['ini']; return $v; }, $cell['restriction']['votes']);
            if (!empty($cell['restriction']['history']) && is_array($cell['restriction']['history'])) $cell['restriction']['history'] = array_map(function($h) use ($sealIni) { $mp = $sealIni($h['initials'] ?? $h['votedBy'] ?? '', false); $h['votedBy'] = $mp['lab']; return $h; }, $cell['restriction']['history']);
            if (is_array($cell['source']) && !empty($cell['source']['team']) && is_array($cell['source']['team'])) $cell['source']['team'] = array_map(function($t2) use ($blindLab) { $t2['name'] = trim($blindLab); $t2['initials'] = 'IN'; return $t2; }, $cell['source']['team']);
            if (is_array($cell['source'])) { unset($cell['source']['targetName']); $cell['source']['team'] = []; }
            if (!empty($cell['draftVotes']) && is_array($cell['draftVotes'])) $cell['draftVotes'] = array_map(function($v) use ($sealIni) { $mp = $sealIni($v['initials'] ?? '', false); $v['name'] = $mp['lab']; $v['initials'] = $mp['ini']; return $v; }, $cell['draftVotes']);
            // Identity and theory sealed: target, thread, questions, mandate,
            // draft, findings, verdict record and restriction detail.
            unset($cell['targetId'], $cell['targetName'], $cell['threadId']);
            $cell['objectives'] = [];
            $cell['tasks'] = [];
            $cell['deliverableSpecs'] = null;
            $cell['resolutionDraft'] = null;
            $cell['findings'] = [];
            $cell['resolution'] = $cell['resolution'] ? ['status' => $cell['resolution']['status'] ?? 'Sealed'] : null;
            $cell['restriction'] = ['state' => 'sealed', 'restrictCount' => 0, 'teamSize' => 0, 'majority' => 0];
            }
    }
        $cell['draftResolutions'] = [];
        foreach (($draftByCell[$c['id']] ?? []) as $d) {
            $cell['draftResolutions'][] = ['id' => $d['res_id'] ?? $d['id'], 'rowId' => $d['id'], 'status' => $d['status'] ?: 'draft', 'title' => $d['title'], 'text' => $d['text'], 'action' => $d['action'], 'votesNullified' => (bool)$d['votes_nullified'], 'supersedes' => $d['supersedes'] ?? null, 'versions' => array_map(function($v) { return ['title' => $v['title'], 'text' => $v['text'], 'action' => $v['action'], 'author' => $v['author'], 'ts' => $v['ts']]; }, $verByDraft[$d['id']] ?? []), 'implementingCircles' => array_map(function($i) { return $i['circle_name']; }, $impByDraft[$d['id']] ?? [])];
        }
        $vs = $voteByCell[$c['id']] ?? [];
        if ($vs || isset($vsumByCell[$c['id']])) {
            $cell['votes'] = ['domains' => array_map(function($v) use ($c, $voterByCell) { return ['name' => $v['domain'], 'yea' => $v['yea'], 'nay' => $v['nay'], 'total' => $v['total'], 'voters' => array_values(array_filter(array_map(function($vr) use ($v) { return $vr['domain'] === $v['domain'] ? ['name' => $vr['name'], 'initials' => $vr['initials'], 'ws' => $vr['ws'], 'vote' => $vr['vote']] : null; }, $voterByCell[$c['id']] ?? [])))]; }, $vs), 'summary' => isset($vsumByCell[$c['id']]) ? pJson($vsumByCell[$c['id']][0]['summary']) : null];
        }
        $cells[] = array_filter($cell, function($v) { return $v !== null; });
    }
    $stfShape = ['pending' => [], 'active' => [], 'completed' => []];
    foreach (dbAll('SELECT * FROM stfs') as $s) {
        $obj = ['id' => $s['id'], 'type' => $s['type'], 'purpose' => $s['purpose'], 'circle' => $s['circle'], 'deadline' => $s['deadline'], 'status' => $s['status']];
        $sTitle = $s['title'];
        if (!empty($sealedStf[$s['id']])) {
            $sealedKind = ($s['type'] === 'xSTF') ? 'xSTF — sealed probe' : (($s['type'] === 'vSTF') ? 'vSTF — sealed verification' : (($s['type'] === 'aSTF') ? 'aSTF — sealed audit' : 'jSTF — sealed case'));
            $sTitle = $sealedKind . ' [' . $s['id'] . ']';
            // The circle column carries the target on jSTF/closed-audit rows
            // — sealed means sealed: no name, no circle-derived identity.
            // (vSTF/motion circles are structural and stay.)
            if (!empty($blankCircle[$s['id']])) $obj['circle'] = '';
        }
        if ($s['bucket'] === 'pending') $obj['candidate'] = $sTitle; else $obj['title'] = $sTitle;
        $stfShape[$s['bucket']][] = $obj;
    }
    $cdByCand = groupBy(dbAll('SELECT * FROM stf_candidate_domains'), 'candidate_id');
    $stfCandidates = array_values(array_filter(array_map(function($c) use ($cdByCand) { return ['id' => $c['id'], 'stfId' => $c['stf_id'], 'name' => $c['name'], 'initials' => $c['initials'], 'matchScore' => $c['match_score'], 'matchedDomains' => array_values(array_map(function($d) { return $d['domain']; }, $cdByCand[$c['id']] ?? [])), 'interestScore' => $c['interest_score'], 'competenceScore' => $c['competence_score'], 'status' => $c['status'], 'invitedDate' => $c['invited_date'], 'userId' => $c['user_id'] ?? null]; }, dbAll('SELECT * FROM stf_candidates')), function($sc) use ($sealedStf) { return empty($sealedStf[$sc['stfId']]); }));
    $replyByThread = groupBy(dbAll('SELECT * FROM thread_replies'), 'thread_id');
    $threads = array_map(function($t) use ($replyByThread) { return ['id' => $t['id'], 'title' => $t['title'], 'body' => $t['body'], 'author' => $t['author'], 'initials' => $t['initials'], 'avatar' => pJson($t['avatar'] ?? null) ?: [], 'domain' => $t['domain'], 'domainColor' => $t['domain_color'], 'badge' => $t['badge'], 'badgeClass' => $t['badge_class'], 'replies' => $t['replies'], 'likes' => $t['likes'], 'shares' => $t['shares'], 'time' => $t['time'], 'pinned' => (bool)$t['pinned'], 'endorsements' => $t['endorsements'] ?? 0, 'proposalCellId' => $t['proposal_cell_id'] ?? null, 'submitterId' => $t['submitter_id'] ?? null, 'visibility' => $t['visibility'] ?: 'public', 'jstfCellId' => $t['jstf_cell_id'] ?? null, 'repliesList' => array_map(function($r) { return ['id' => $r['id'], 'author' => $r['author'], 'initials' => $r['initials'], 'avatar' => pJson($r['avatar'] ?? null) ?: [], 'time' => $r['time'], 'body' => $r['body'], 'likes' => $r['likes']]; }, $replyByThread[$t['id']] ?? [])]; }, dbAll('SELECT * FROM threads'));
    $threads = array_values(array_filter($threads, function($t) use ($currentRow) { return jstfCanSeeThread($currentRow, $t); }));
    $actByInbox = groupBy(dbAll('SELECT * FROM inbox_actions'), 'inbox_id');
    $metaByInbox = groupBy(dbAll('SELECT * FROM inbox_meta'), 'inbox_id');
    $inbox = array_map(function($i) use ($actByInbox, $metaByInbox) { return ['id' => $i['id'], 'type' => $i['type'], 'title' => $i['title'], 'desc' => $i['desc'], 'time' => $i['time'], 'badge' => $i['badge'], 'unread' => (bool)$i['unread'], 'detail' => $i['detail'], 'nav' => $i['nav'], 'actions' => array_map(function($a) { return ['label' => $a['label'], 'style' => $a['style'], 'action' => $a['action']]; }, $actByInbox[$i['id']] ?? []), 'meta' => array_map(function($m) { return ['label' => $m['label'], 'value' => $m['value']]; }, $metaByInbox[$i['id']] ?? [])]; }, dbAll('SELECT * FROM inbox'));
    $authorByPub = groupBy(dbAll('SELECT * FROM publication_authors'), 'publication_id');
    $publications = array_map(function($p) use ($authorByPub) { return ['id' => $p['id'], 'title' => $p['title'], 'journal' => $p['journal'], 'date' => $p['date'], 'views' => $p['views'], 'downloads' => $p['downloads'], 'type' => $p['type'], 'abstract' => $p['abstract'], 'tags' => pJson($p['tags'] ?? null) ?: [], 'authors' => array_values(array_map(function($a) { return $a['author']; }, $authorByPub[$p['id']] ?? []))]; }, dbAll('SELECT * FROM publications'));
    $news = array_map(function($n) { return ['title' => $n['title'], 'time' => $n['time'], 'source' => $n['source']]; }, dbAll('SELECT * FROM news'));
    $library = array_map(function($l) { return ['id' => $l['id'], 'title' => $l['title'], 'category' => $l['category'], 'itemType' => $l['item_type'], 'domain' => $l['domain'], 'link' => $l['link'], 'curatedBy' => $l['curated_by']]; }, dbAll('SELECT * FROM library_items ORDER BY id DESC'));
    $events = array_map(function($e) { return ['title' => $e['title'], 'date' => $e['date'], 'location' => $e['location']]; }, dbAll('SELECT * FROM events'));
    $opportunities = array_map(function($o) { return ['title' => $o['title'], 'deadline' => $o['deadline'], 'type' => $o['type']]; }, dbAll('SELECT * FROM opportunities'));
    $domByProject = groupBy(dbAll('SELECT * FROM project_domains'), 'project_id');
    $projects = array_map(function($p) use ($domByProject) { return ['id' => $p['id'], 'title' => $p['title'], 'lead' => $p['lead'], 'progress' => $p['progress'], 'role' => $p['role'], 'domains' => array_values(array_map(function($d) { return $d['domain']; }, $domByProject[$p['id']] ?? []))]; }, dbAll('SELECT * FROM projects'));
    $exitReasonLabels = []; foreach (dbAll('SELECT * FROM exit_reason_labels') as $r) $exitReasonLabels[$r['key']] = $r['label'];
    $ss = dbGet('SELECT * FROM system_settings WHERE id = 1') ?: [];
    $jstfDomainsRaw = $ss['jstf_domains'] ?? '[]'; $jstfDomains = pJson(is_string($jstfDomainsRaw) ? $jstfDomainsRaw : json_encode($jstfDomainsRaw)) ?: []; if (!is_array($jstfDomains)) $jstfDomains = [];
    $systemSettings = ['stewardTermMonths' => $ss['steward_term_months'] ?? null, 'maxConsecutiveTerms' => $ss['max_consecutive_terms'] ?? null, 'cooloffMonths' => $ss['cooloff_months'] ?? null, 'pAstfCycleMonths' => $ss['p_astf_cycle_months'] ?? null, 'autoExpireCircles' => (bool)($ss['auto_expire_circles'] ?? false), 'defaultCircleExpiryMonths' => $ss['default_circle_expiry_months'] ?? null, 'jstfDurationDays' => $ss['jstf_duration_days'] ?? 30, 'astfDurationDays' => $ss['astf_duration_days'] ?? 10, 'vstfDurationDays' => $ss['vstf_duration_days'] ?? 14, 'jstfDomains' => array_values($jstfDomains), 'jstfAdjudicators' => (int)($ss['jstf_adjudicators'] ?? 3) ?: 3, 'jstfPoolMode' => in_array($ss['jstf_pool_mode'] ?? '', ['stewards', 'competence']) ? $ss['jstf_pool_mode'] : 'competence'];
    $sr = dbGet('SELECT stats FROM stats WHERE id = 1');
    $stats = $sr ? pJson($sr['stats']) ?: [] : [];
    $regRows = dbAll('SELECT * FROM registration_domains'); $regMeta = dbGet('SELECT * FROM registration_meta WHERE id = 1');
    $registration = ['domains' => array_map(function($r) { return ['name' => $r['name'], 'type' => $r['type']]; }, $regRows), 'eloMap' => $regMeta ? pJson($regMeta['elo_map']) ?: [] : [], 'knowledgeLevels' => $regMeta ? pJson($regMeta['knowledge_levels']) ?: [] : [], 'experientialLevels' => $regMeta ? pJson($regMeta['experiential_levels']) ?: [] : [], 'defaultInterests' => $regMeta ? pJson($regMeta['default_interests']) ?: [] : []];
    $integrityRecords = dbAll('SELECT * FROM integrity_records');
    $sanctions = array_map(function($s) { return ['id' => $s['id'], 'userId' => $s['user_id'], 'kind' => $s['kind'], 'scope' => $s['scope'], 'until' => $s['until'], 'reason' => $s['reason'], 'caseId' => $s['case_id'], 'created' => $s['created_at']]; }, dbAll("SELECT * FROM sanctions WHERE until IS NULL OR until > ?", [date('Y-m-d')]));
    $policies = dbAll('SELECT * FROM policies');
    $governanceEvents = array_map(function($g) use ($sealedCase) { $o = ['id' => $g['id'], 'type' => $g['type'], 'circle' => $g['circle'], 'date' => $g['date'], 'text' => $g['text']]; if ($g['participant'] !== null) $o['participant'] = $g['participant']; if (str_starts_with($g['type'] ?? '', 'jstf') || ($g['type'] ?? '') === 'astf-verdict') { foreach ($sealedCase as $cid => $_s) { if (strpos($g['text'] ?? '', (string)$cid) !== false) { unset($o['participant']); break; } } } return $o; }, dbAll('SELECT * FROM governance_events'));
    $domByApp = groupBy(dbAll('SELECT * FROM circle_application_domains'), 'app_id');
    $circleApplications = array_map(function($a) use ($domByApp) { return ['id' => $a['id'], 'circleId' => $a['circle_id'], 'circleName' => $a['circle_name'], 'applicant' => $a['applicant'], 'initials' => $a['initials'], 'motivation' => $a['motivation'], 'relevantDomains' => array_values(array_map(function($d) { return $d['domain']; }, $domByApp[$a['id']] ?? [])), 'status' => $a['status'], 'appliedDate' => $a['applied_date'], 'queuePosition' => $a['queue_position']]; }, dbAll('SELECT * FROM circle_applications'));
    $projectApplications = array_map(function($p) { return ['id' => $p['id'], 'cellId' => $p['cell_id'], 'projectName' => $p['project_name'], 'applicant' => $p['applicant'], 'initials' => $p['initials'], 'motivation' => $p['motivation'], 'status' => $p['status'], 'appliedDate' => $p['applied_date'], 'proposedRole' => $p['proposed_role']]; }, dbAll('SELECT * FROM project_applications'));
    $governanceLedger = array_map(function($l) { return ['id' => $l['id'], 'type' => $l['type'], 'target' => $l['target'], 'settings' => pJson($l['settings']), 'appliedBy' => $l['applied_by'], 'appliedAt' => $l['applied_at'], 'status' => $l['status']]; }, dbAll('SELECT * FROM governance_ledger'));
    $myEngagements = [];
    if ($currentRow) { foreach (dbAll('SELECT t.id, (SELECT COUNT(*) FROM thread_endorsements e WHERE e.thread_id = t.id AND e.user_id = ?) AS endorsed, (SELECT COUNT(*) FROM thread_bookmarks b WHERE b.thread_id = t.id AND b.user_id = ?) AS bookmarked FROM threads t', [strval($cuid), strval($cuid)]) as $r) $myEngagements[] = ['threadId' => $r['id'], 'endorsed' => $r['endorsed'] > 0, 'bookmarked' => $r['bookmarked'] > 0]; }
    $payload = ['currentUser' => $currentUser, 'participants' => $participants, 'organisations' => $organisations, 'domains' => $domains, 'domainLayout' => $domainLayout, 'circles' => $circles, 'cells' => $cells, 'stfs' => $stfShape, 'stfCandidates' => $stfCandidates, 'threads' => $threads, 'inbox' => $inbox, 'publications' => $publications, 'news' => $news, 'events' => $events, 'opportunities' => $opportunities, 'projects' => $projects, 'library' => $library, 'exitReasonLabels' => $exitReasonLabels, 'systemSettings' => $systemSettings, 'stats' => $stats, 'registration' => $registration, 'sanctions' => $sanctions, 'integrityRecords' => $integrityRecords, 'governanceEvents' => $governanceEvents, 'circleApplications' => $circleApplications, 'projectApplications' => $projectApplications, 'governanceLedger' => $governanceLedger, 'myEngagements' => $myEngagements];
    $payload['policies'] = $policies;
    if ($empty) { foreach (['participants','organisations','circles','cells','threads','inbox','publications','news','events','opportunities','projects','library','integrityRecords','governanceEvents','circleApplications','projectApplications','governanceLedger','stfCandidates','policies','sanctions','myEngagements'] as $k) $payload[$k] = []; $payload['stfs'] = ['pending' => [], 'active' => [], 'completed' => []]; $payload['domains'] = []; $payload['stats'] = []; }
    send(200, $payload);
}

// ═════════════════════════════════════════════════════════
// RESOURCE ROUTER
// ═════════════════════════════════════════════════════════
$routes = [
    ['table' => 'users', 'path' => '/users'],
    ['table' => 'domains', 'path' => '/domains'],
    ['table' => 'organisations', 'path' => '/organisations'],
    ['table' => 'circles', 'path' => '/circles'],
    ['table' => 'cells', 'path' => '/cells'],
    ['table' => 'stfs', 'path' => '/stfs'],
    ['table' => 'threads', 'path' => '/threads'],
    ['table' => 'inbox', 'path' => '/inbox'],
    ['table' => 'publications', 'path' => '/publications'],
    ['table' => 'news', 'path' => '/news'],
    ['table' => 'events', 'path' => '/events'],
    ['table' => 'opportunities', 'path' => '/opportunities'],
    ['table' => 'projects', 'path' => '/projects'],
    ['table' => 'integrity_records', 'path' => '/integrity-records'],
    ['table' => 'policies', 'path' => '/policies'],
    ['table' => 'governance_events', 'path' => '/governance-events'],
    ['table' => 'circle_applications', 'path' => '/circle-applications'],
    ['table' => 'project_applications', 'path' => '/project-applications'],
    ['table' => 'governance_ledger', 'path' => '/governance-ledger'],
    ['table' => 'exit_reason_labels', 'path' => '/exit-reason-labels'],
];
function updateRow($table, $body, $id = null) {
    $cols = array_map(function($c) { return $c['Field']; }, dbAll("SHOW COLUMNS FROM `$table`"));
    $entries = [];
    foreach ((array)$body as $k => $v) { if (in_array($k, $cols) && $k !== 'id') $entries[] = [$k, $v]; }
    if (!$entries) return false;
    $sets = array_map(function($e) { return $e[0] . ' = ?'; }, $entries);
    $vals = array_map(function($e) { return bindVal($e[1]); }, $entries);
    $targetId = $id ?: (is_object($body) ? ($body->id ?? null) : null);
    dbRun("UPDATE `$table` SET " . implode(', ', $sets) . " WHERE id = ?", array_merge($vals, [strval($targetId)]));
    return true;
}
function parseId($reqUrl, $base) { if (strpos($reqUrl, $base . '/') !== 0) return null; $rest = substr($reqUrl, strlen($base) + 1); if (!$rest || strpos($rest, '/') !== false) return null; return urldecode($rest); }
// Candidacy applications: frozen members and Guests may not apply.
if ($cleanPath === '/circle-applications' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (($user['status'] ?? '') === 'Guest') send(403, ['error' => 'Guest privilege level — read and appeal only']);
    if (jstfActiveSanction($user['id'] ?? null, 'candidacy_freeze')) send(403, ['error' => 'Steward candidacy frozen by jSTF sanction']);
}
foreach ($routes as $r) {
    $id = parseId($cleanPath, $r['path']);
    if ($cleanPath === $r['path'] || $id !== null) {
        if ($method === 'GET') {
            if ($r['table'] === 'threads') {
                $gViewer = authUser(); $gStew = isSteward($gViewer['id'] ?? null);
                if ($id !== null) { $row = dbGet('SELECT * FROM threads WHERE id = ?', [$id]); if (!$row) send(404, ['error' => 'Not found']); if (!jstfCanSeeThread($gViewer, $row)) send(404, ['error' => 'Not found']); send(200, $row); }
                $allT = dbAll('SELECT * FROM threads');
                $allT = array_values(array_filter($allT, function($t) use ($gViewer) { return jstfCanSeeThread($gViewer, $t); }));
                send(200, $allT);
            }
            if ($r['table'] === 'users') {
                if ($id !== null) { $row = dbGet('SELECT * FROM users WHERE id = ?', [$id]); if (!$row) send(404, ['error' => 'Not found']); unset($row['password_hash']); send(200, $row); }
                send(200, array_map(function($u) { unset($u['password_hash']); return $u; }, dbAll('SELECT * FROM users')));
            }
            // Raw cell/stf rows carry judicial identity in meta/source/title.
            // Blind judicial rows are invisible to anyone off the team.
            if (in_array($r['table'], ['cells', 'stfs'])) {
                $gv = authUser();
                $jstfHidden = function($cellId) use ($gv) {
                    $jc = dbGet('SELECT type, blind, delib_type, status FROM cells WHERE id = ?', [$cellId]);
                    if (!$jc || empty($jc['blind'])) return false;
                    $jt = $jc['type'] ?? '';
                    if ($jt === 'vSTF Cell') return !vstfReader($cellId, $gv);
                    if ($jt === 'aSTF Cell' && ($jc['delib_type'] ?? '') === 'judicial-audit' && ($jc['status'] ?? '') === 'Verdict Filed') return true;
                    if (!in_array($jt, ['jSTF Cell', 'xSTF Cell'])) return false;
                    return !jstfTeamMember($cellId, $gv);
                };
                if ($r['table'] === 'cells') {
                    if ($id !== null) {
                        $row = dbGet('SELECT * FROM cells WHERE id = ?', [$id]); if (!$row) send(404, ['error' => 'Not found']);
                        if ($jstfHidden($id)) send(404, ['error' => 'Not found']);
                        send(200, $row);
                    }
                    send(200, array_values(array_filter(dbAll('SELECT * FROM cells'), function($c) use ($jstfHidden) { return !$jstfHidden($c['id']); })));
                } else {
                    $cellOf = function($sid) { return str_starts_with($sid, 'stf-') ? substr($sid, 4) : null; };
                    if ($id !== null) {
                        $row = dbGet('SELECT * FROM stfs WHERE id = ?', [$id]); if (!$row) send(404, ['error' => 'Not found']);
                        $cc = $cellOf($id); if ($cc && $jstfHidden($cc)) send(404, ['error' => 'Not found']);
                        send(200, $row);
                    }
                    send(200, array_values(array_filter(dbAll('SELECT * FROM stfs'), function($s) use ($jstfHidden, $cellOf) { $cc = $cellOf($s['id']); return !($cc && $jstfHidden($cc)); })));
                }
            }
            if ($id !== null) { $row = dbGet("SELECT * FROM {$r['table']} WHERE id = ?", [$id]); if (!$row) send(404, ['error' => 'Not found']); send(200, $row); } send(200, dbAll("SELECT * FROM {$r['table']}"));
        }
        if ($method === 'POST' && $cleanPath === $r['path']) { if (in_array($r['table'], ['threads','vote_records','cell_votes','circle_proposals'])) { $wu = authUser(); if (!$wu) send(401, ['error' => 'Unauthorized']); assertActiveMember($wu); } $body = readBody(); if (!isset($body->id)) send(400, ['error' => 'id required']); dbRun("INSERT INTO {$r['table']} (id) VALUES (?) ON DUPLICATE KEY UPDATE id=id", [strval($body->id)]); $ok = updateRow($r['table'], $body); send($ok ? 201 : 409, ['ok' => (bool)$ok, 'id' => $body->id]); }
        if ($method === 'PATCH' || $method === 'PUT') { $body = readBody(); $row = dbGet("SELECT * FROM {$r['table']} WHERE id = ?", [$id]); if (!$row) send(404, ['error' => 'Not found']); updateRow($r['table'], $body, $id); send(200, dbGet("SELECT * FROM {$r['table']} WHERE id = ?", [$id])); }
        if ($method === 'DELETE') { $out = dbRun("DELETE FROM {$r['table']} WHERE id = ?", [$id]); send($out->affectedRows ? 200 : 404, ['ok' => $out->affectedRows > 0]); }
        send(405, ['error' => 'Method not allowed']);
    }
}

// ═════════════════════════════════════════════════════════
// CHILD COLLECTION ROUTES
// ═════════════════════════════════════════════════════════
$childDefs = [
    ['child' => 'circle_domains', 'parentKey' => 'circle_id', 'path' => '/circles/:id/domains'],
    ['child' => 'circle_roster', 'parentKey' => 'circle_id', 'path' => '/circles/:id/roster'],
    ['child' => 'circle_proposals', 'parentKey' => 'circle_id', 'path' => '/circles/:id/proposals'],
    ['child' => 'circle_resolutions', 'parentKey' => 'circle_id', 'path' => '/circles/:id/resolutions'],
    ['child' => 'circle_activity', 'parentKey' => 'circle_id', 'path' => '/circles/:id/activity'],
    ['child' => 'cell_domains', 'parentKey' => 'cell_id', 'path' => '/cells/:id/domains'],
    ['child' => 'cell_circles', 'parentKey' => 'cell_id', 'path' => '/cells/:id/circles'],
    ['child' => 'cell_messages', 'parentKey' => 'cell_id', 'path' => '/cells/:id/messages'],
    ['child' => 'cell_tasks', 'parentKey' => 'cell_id', 'path' => '/cells/:id/tasks'],
    ['child' => 'cell_objectives', 'parentKey' => 'cell_id', 'path' => '/cells/:id/objectives'],
    ['child' => 'cell_team', 'parentKey' => 'cell_id', 'path' => '/cells/:id/team'],
    ['child' => 'draft_resolutions', 'parentKey' => 'cell_id', 'path' => '/cells/:id/draft-resolutions'],
    ['child' => 'cell_votes', 'parentKey' => 'cell_id', 'path' => '/cells/:id/votes'],
    ['child' => 'vote_records', 'parentKey' => 'cell_id', 'path' => '/cells/:id/vote-records'],
    ['child' => 'stf_candidates', 'parentKey' => 'stf_id', 'path' => '/stfs/:id/candidates'],
    ['child' => 'thread_replies', 'parentKey' => 'thread_id', 'path' => '/threads/:id/replies'],
    ['child' => 'circle_application_domains', 'parentKey' => 'app_id', 'path' => '/circle-applications/:id/domains'],
];
$handled = false;
foreach ($childDefs as $d) {
    $pattern = str_replace(':id', '([^/]+)', $d['path']);
    $re = '#^' . $pattern . '$#';
    $childIdRe = '#^' . $pattern . '/([^/]+)$#';
    if (preg_match($re, $cleanPath, $m) || preg_match($childIdRe, $cleanPath, $cm)) {
        $parentId = urldecode($cm ? $cm[1] : $m[1]);
        if ($method === 'GET' && $d['child'] === 'thread_replies') { $tvRow = dbGet('SELECT * FROM threads WHERE id = ?', [$parentId]); if ($tvRow && ($tvRow['visibility'] ?: 'public') === 'stewards-only') { $rvUser = authUser(); if (!jstfCanSeeThread($rvUser, $tvRow)) send(404, ['error' => 'Not found']); } }
        if ($method === 'GET' && !preg_match($childIdRe, $cleanPath)) {
            if (in_array($d['child'], ['cell_team','cell_messages','vote_records','cell_votes','draft_resolutions','cell_objectives','cell_tasks','stf_candidates'])) {
                $gCellId = $parentId;
                if ($d['child'] === 'stf_candidates' && str_starts_with($parentId, 'stf-')) $gCellId = substr($parentId, 4);
                $gp = dbGet('SELECT type, blind FROM cells WHERE id = ?', [$gCellId]);
                if ($gp && !empty($gp['blind']) && in_array($gp['type'] ?? '', ['jSTF Cell', 'xSTF Cell'])) {
                    $gvr = authUser();
                    $ok = ($gp['type'] === 'jSTF Cell') ? jstfTeamMember($gCellId, $gvr) : jstfProbeReader($gCellId, $gvr);
                    if (!$ok) send(404, ['error' => 'Not found']);
                }
            }
            send(200, dbAll("SELECT * FROM {$d['child']} WHERE {$d['parentKey']} = ?", [$parentId]));
        }
        if ($method !== 'GET') {
            $wuser = authUser(); if (!$wuser) send(401, ['error' => 'Unauthorized']);
            $skipAssert = false;
            if ($d['child'] === 'thread_replies' && $method === 'POST') {
                $pt0 = dbGet('SELECT * FROM threads WHERE id = ?', [$parentId]);
                if ($pt0 && ($pt0['badge'] ?? '') === 'b-judicial') {
                    $p0 = jstfThreadParty($wuser, $pt0);
                    if (!$p0) send(403, ['error' => 'Not a party to this case']);
                    if ($p0 === 'target' || $p0 === 'submitter') $skipAssert = true;
                }
            }
            if (!$skipAssert && in_array($d['child'], ['thread_replies','vote_records','cell_votes','circle_proposals','cell_messages','circle_resolutions','cell_objectives','cell_team','cell_tasks'])) assertActiveMember($wuser);
            // Judicial cells are sealed: generic writes to a jSTF cell's
            // children require an open case and team-or-steward standing.
            // (Deliberation, votes, drafts, questions and membership each have
            // their own stricter endpoint; this is the backstop.)
            if (in_array($d['child'], ['cell_team','cell_objectives','cell_tasks','vote_records','cell_votes','draft_resolutions'])) {
                $jp = dbGet('SELECT type, status FROM cells WHERE id = ?', [$parentId]);
                if ($jp && ($jp['type'] ?? '') === 'jSTF Cell') {
                    if (($jp['status'] ?? '') !== 'Under Investigation') send(400, ['error' => 'Case is closed']);
                    if (!jstfTeamMember($parentId, $wuser) && !dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$wuser['id']])) send(403, ['error' => 'Only the jSTF team or stewards may modify this case']);
                }
            }
        }
        if ($method === 'POST' && !preg_match($childIdRe, $cleanPath)) {
            $body = readBody();
            if ($d['child'] === 'thread_replies' && empty($body->id)) $body->id = 'reply-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
            if ($d['child'] === 'thread_replies') {
                $pt = dbGet('SELECT * FROM threads WHERE id = ?', [$parentId]);
                if ($pt && ($pt['badge'] ?? '') === 'b-judicial') {
                    $party = jstfThreadParty($wuser, $pt);
                    if (!$party) send(403, ['error' => 'Not a party to this case']);
                    if (!empty($pt['jstf_cell_id'])) {
                        $lc = dbGet('SELECT status FROM cells WHERE id = ?', [$pt['jstf_cell_id']]);
                        if ($lc && in_array($lc['status'] ?? '', jstfTerminalStatuses(), true)) send(403, ['error' => 'Case thread frozen — verdict recorded']);
                    }
                    $isInitial = str_starts_with($pt['proposal_cell_id'] ?? '', 'user:');
                    if ($isInitial && $party === 'submitter') { $body->author = 'Anonymous'; $body->initials = '?'; }
                    else { $body->author = $wuser['name'] ?? $wuser['initials']; $body->initials = $wuser['initials'] ?? '?'; }
                    unset($body->avatar);
                }
            }
            if ($d['child'] === 'cell_messages') {
                $pc = dbGet('SELECT * FROM cells WHERE id = ?', [$parentId]);
                if ($pc && ($pc['type'] ?? '') === 'jSTF Cell') {
                    if (($pc['status'] ?? '') !== 'Under Investigation') send(400, ['error' => 'Case is closed']);
                    if (!jstfTeamMember($parentId, $wuser)) send(403, ['error' => 'Only the investigation team may deliberate']);
                }
                if ($pc && ($pc['type'] ?? '') === 'xSTF Cell') {
                    if (($pc['status'] ?? '') === 'Completed') send(400, ['error' => 'Execution cell is completed']);
                    $allowed = array_map(function($t) { return $t['initials']; }, dbAll('SELECT initials FROM cell_team WHERE cell_id = ?', [$parentId]));
                    $psrc = pJson($pc['source'] ?? '{}') ?: [];
                    if (!empty($psrc['jstfId'])) {
                        foreach (dbAll('SELECT initials FROM cell_team WHERE cell_id = ?', [$psrc['jstfId']]) as $jt) $allowed[] = $jt['initials'];
                    }
                    if (!empty($pc['circle'])) {
                        $cc = dbGet('SELECT id FROM circles WHERE id = ? OR LOWER(name) = LOWER(?)', [$pc['circle'], $pc['circle']]);
                        if ($cc) foreach (dbAll("SELECT initials FROM circle_roster WHERE circle_id = ? AND status = 'active'", [$cc['id']]) as $cr) $allowed[] = $cr['initials'];
                    }
                    if (!in_array($wuser['initials'] ?? null, $allowed)) send(403, ['error' => 'Only the probe team or the commissioning body may deliberate here']);
                }
            }
            $cols = array_filter(array_map(function($c) { return $c['Field']; }, dbAll("SHOW COLUMNS FROM `{$d['child']}`")), function($c) use ($d) { return $c !== $d['parentKey'] && $c !== 'id'; });
            $entries = []; foreach ((array)$body as $k => $v) { if (in_array($k, $cols)) $entries[] = [$k, $v]; }
            if ($d['child'] === 'thread_replies' && !empty($body->id)) array_unshift($entries, ['id', $body->id]);
            $keys = array_merge([$d['parentKey']], array_map(function($e) { return $e[0]; }, $entries));
            $vals = array_merge([$parentId], array_map(function($e) { return bindVal($e[1]); }, $entries));
            dbRun("INSERT INTO {$d['child']} (" . implode(',', $keys) . ") VALUES (" . implode(',', array_fill(0, count($keys), '?')) . ")", $vals);
            if ($d['child'] === 'cell_team') dbRun('UPDATE cells SET participants = (SELECT COUNT(*) FROM cell_team WHERE cell_id = ?) WHERE id = ? AND type = ?', [$parentId, $parentId, 'jSTF Cell']);
            send(201, dbGet("SELECT * FROM {$d['child']} WHERE {$d['parentKey']} = ? ORDER BY id DESC LIMIT 1", [$parentId]));
        }
        if (preg_match($childIdRe, $cleanPath, $cm)) {
            $childId = urldecode($cm[2]);
            if ($method === 'PATCH' || $method === 'PUT') { $body = readBody(); $cols = array_filter(array_map(function($c) { return $c['Field']; }, dbAll("SHOW COLUMNS FROM `{$d['child']}`")), function($c) { return $c !== 'id'; }); $entries = []; foreach ((array)$body as $k => $v) { if (in_array($k, $cols)) $entries[] = [$k, $v]; } if (!$entries) send(200, dbGet("SELECT * FROM {$d['child']} WHERE id = ?", [$childId])); $sets = array_map(function($e) { return $e[0] . ' = ?'; }, $entries); dbRun("UPDATE {$d['child']} SET " . implode(', ', $sets) . " WHERE id = ?", array_merge(array_map(function($e) { return bindVal($e[1]); }, $entries), [$childId])); send(200, dbGet("SELECT * FROM {$d['child']} WHERE id = ?", [$childId])); }
            if ($method === 'DELETE') { $out = dbRun("DELETE FROM {$d['child']} WHERE id = ?", [$childId]); if ($d['child'] === 'cell_team') dbRun('UPDATE cells SET participants = (SELECT COUNT(*) FROM cell_team WHERE cell_id = ?) WHERE id = ? AND type = ?', [$parentId, $parentId, 'jSTF Cell']); send($out->affectedRows ? 200 : 404, ['ok' => $out->affectedRows > 0]); }
            send(405, ['error' => 'Method not allowed']);
        }
        send(405, ['error' => 'Method not allowed']);
    }
}

// ═════════════════════════════════════════════════════════
// DRAFT CHILD ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/cells\/([^\/]+)\/draft-resolutions\/([^\/]+)\/(versions|implementing-circles)$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $cellId = urldecode($m[1]); $draftId = urldecode($m[2]); $kind = $m[3]; $body = readBody();
    $draft = dbGet('SELECT * FROM draft_resolutions WHERE id = ? AND cell_id = ?', [strval($draftId), $cellId]);
    if (!$draft) send(404, ['error' => 'Not found']);
    if ($kind === 'versions') {
        $cols = ['draft_id', 'title', 'text', 'action', 'author', 'ts'];
        $keys = ['draft_id']; foreach ($cols as $c) { if ($c !== 'draft_id' && isset($body->$c)) $keys[] = $c; }
        $vals = array_map(function($k) use ($body, $draftId) { return $k === 'draft_id' ? strval($draftId) : bindVal($body->$k); }, $keys);
        dbRun("INSERT INTO resolution_versions (" . implode(',', $keys) . ") VALUES (" . implode(',', array_fill(0, count($keys), '?')) . ")", $vals);
    } else {
        dbRun('INSERT INTO resolution_implementing_circles (draft_id, circle_name) VALUES (?,?) ON DUPLICATE KEY UPDATE 1=1', [strval($draftId), strval($body->circle_name ?? '')]);
    }
    send(201, ['ok' => true]);
}

// ═════════════════════════════════════════════════════════
// ENGAGEMENT ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/threads\/([^\/]+)\/(endorsement|bookmark)$/', $cleanPath, $m)) {
    if ($method !== 'POST' && $method !== 'DELETE') send(405, ['error' => 'Method not allowed']);
    $threadId = urldecode($m[1]); $kind = $m[2];
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    if (!dbGet('SELECT id FROM threads WHERE id = ?', [$threadId])) send(404, ['error' => 'Not found']);
    $table = $kind === 'endorsement' ? 'thread_endorsements' : 'thread_bookmarks';
    if ($method === 'POST') dbRun("INSERT INTO $table (user_id, thread_id) VALUES (?,?) ON DUPLICATE KEY UPDATE 1=1", [$user['id'], $threadId]);
    else dbRun("DELETE FROM $table WHERE user_id = ? AND thread_id = ?", [$user['id'], $threadId]);
    $resp = ['ok' => true, 'threadId' => $threadId];
    if ($kind === 'endorsement') { $nRow = dbGet('SELECT COUNT(*) AS n FROM thread_endorsements WHERE thread_id = ?', [$threadId]); $n = (int)($nRow['n'] ?? 0); dbRun('UPDATE threads SET endorsements = ? WHERE id = ?', [$n, $threadId]); $resp['endorsed'] = ($method === 'POST'); $resp['endorsements'] = $n; }
    else $resp['bookmarked'] = ($method === 'POST');
    send(200, $resp);
}

// ═════════════════════════════════════════════════════════
// PIN ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/threads\/([^\/]+)\/pin$/', $cleanPath, $m)) {
    if ($method !== 'POST' && $method !== 'DELETE') send(405, ['error' => 'Method not allowed']);
    $threadId = urldecode($m[1]); $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $inRoster = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($inRoster['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    if (!dbGet('SELECT id FROM threads WHERE id = ?', [$threadId])) send(404, ['error' => 'Not found']);
    $pinned = ($method === 'POST');
    dbRun('UPDATE threads SET pinned = ? WHERE id = ?', [$pinned ? 1 : 0, $threadId]);
    send(200, ['ok' => true, 'threadId' => $threadId, 'pinned' => $pinned]);
}

// ═════════════════════════════════════════════════════════
// RAISE PROPOSAL
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/threads\/([^\/]+)\/raise-proposal$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $threadId = urldecode($m[1]); $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $inRoster = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($inRoster['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $t = dbGet('SELECT * FROM threads WHERE id = ?', [$threadId]); if (!$t) send(404, ['error' => 'Not found']);
    if ($t['proposal_cell_id']) send(409, ['error' => 'Already raised as a proposal']);
    $mc = (int)(dbGet("SELECT COUNT(*) AS n FROM users WHERE status = 'Active'")['n'] ?? 0) ?: 0;
    $cellId = 'delib-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $source = ['type' => 'commons-thread', 'proposer' => $user['name'] ?? $user['initials'], 'threadId' => $threadId, 'threadTitle' => $t['title'], 'threadAuthor' => $t['author'], 'threadBody' => substr($t['body'] ?? '', 0, 600)];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, source, resolution) VALUES (?,?,?,?,?,?,?,?)', [$cellId, 'Deliberation Cell', $t['title'], 'Active', 'commons-thread', max($mc, 4), json_encode($source), json_encode(['status' => 'Draft'])]);
    dbRun('UPDATE threads SET proposal_cell_id = ? WHERE id = ?', [$cellId, $threadId]);
    send(201, ['ok' => true, 'threadId' => $threadId, 'cellId' => $cellId]);
}

// ═════════════════════════════════════════════════════════
// DIRECT PROPOSAL
// ═════════════════════════════════════════════════════════
if ($cleanPath === '/proposals/direct' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $inRoster = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($inRoster['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $title = trim((string)($body->title ?? '')); if (!$title) send(400, ['error' => 'title required']);
    $mc = (int)(dbGet("SELECT COUNT(*) AS n FROM users WHERE status = 'Active'")['n'] ?? 0) ?: 0;
    $cellId = 'delib-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $source = ['type' => 'direct-proposal', 'proposer' => $user['name'] ?? $user['initials'], 'description' => trim((string)($body->description ?? '')), 'domain' => trim((string)($body->domain ?? ''))];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, source, resolution) VALUES (?,?,?,?,?,?,?,?)', [$cellId, 'Deliberation Cell', $title, 'Active', 'direct-proposal', max($mc, 4), json_encode($source), json_encode(['status' => 'Draft'])]);
    send(201, ['ok' => true, 'cellId' => $cellId]);
}

// ═════════════════════════════════════════════════════════
// SETTINGS PROPOSAL
// ═════════════════════════════════════════════════════════
if ($cleanPath === '/proposals/system' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $inRoster = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($inRoster['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $allowed = ['system-settings', 'circle-settings', 'circle-creation']; $delibType = (string)($body->delibType ?? '');
    if (!in_array($delibType, $allowed)) send(400, ['error' => 'delibType required']);
    $title = trim((string)($body->title ?? '')); if (!$title) send(400, ['error' => 'title required']);
    $mc = (int)(dbGet("SELECT COUNT(*) AS n FROM users WHERE status = 'Active'")['n'] ?? 0) ?: 0;
    $cellId = 'delib-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $source = ['type' => (string)($body->sourceType ?? 'settings-proposal'), 'proposer' => $user['name'] ?? $user['initials'], 'submitter' => $user['id']];
    $meta = json_encode(['settingsSnapshot' => is_object($body->snapshot) ? $body->snapshot : new \stdClass()]);
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?)', [$cellId, 'Deliberation Cell', $title, 'Active', $delibType, max($mc, 4), json_encode($source), json_encode(['status' => 'Draft']), $meta]);
    send(201, ['ok' => true, 'cellId' => $cellId]);
}

// ═════════════════════════════════════════════════════════
// VOTE ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/cells\/([^\/]+)\/vote-records$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cellId = urldecode($m[1]); $body = readBody();
    if (!$body || empty($body->domain)) send(400, ['error' => 'domain required']);
    $initials = trim((string)($user['initials'] ?? ($body->initials ?? '')));
    $vote = in_array($body->vote ?? '', ['yea', 'nay', 'abstain']) ? $body->vote : 'abstain';
    $ws = max(0, (int)($body->ws ?? 0));
    dbRun('DELETE FROM vote_records WHERE cell_id = ? AND domain = ? AND initials = ?', [$cellId, $body->domain, $initials]);
    dbRun('INSERT INTO vote_records (cell_id, domain, name, initials, ws, vote) VALUES (?,?,?,?,?,?)', [$cellId, $body->domain, $body->name ?? null, $initials, $ws, $vote]);
    $rows = dbAll("SELECT domain, COALESCE(SUM(CASE WHEN vote='yea' THEN ws END),0) AS yea, COALESCE(SUM(CASE WHEN vote='nay' THEN ws END),0) AS nay, COALESCE(SUM(CASE WHEN vote='abstain' THEN ws END),0) AS abst FROM vote_records WHERE cell_id = ? GROUP BY domain", [$cellId]);
    $tY = 0; $tN = 0; $tA = 0;
    foreach ($rows as &$r) { $r['yea'] = (int)$r['yea']; $r['nay'] = (int)$r['nay']; $r['abst'] = (int)$r['abst']; $tY += $r['yea']; $tN += $r['nay']; $tA += $r['abst'];
        $ex = dbGet('SELECT cell_id, domain FROM cell_votes WHERE cell_id = ? AND domain = ?', [$cellId, $r['domain']]);
        if ($ex) dbRun('UPDATE cell_votes SET yea = ?, nay = ?, total = ? WHERE cell_id = ? AND domain = ?', [$r['yea'], $r['nay'], $r['yea'] + $r['nay'], $cellId, $r['domain']]);
        else dbRun('INSERT INTO cell_votes (cell_id, domain, yea, nay, total) VALUES (?,?,?,?,?)', [$cellId, $r['domain'], $r['yea'], $r['nay'], $r['yea'] + $r['nay']]);
    } unset($r);
    $summary = ['yea' => $tY, 'nay' => $tN, 'abstain' => $tA];
    $ex = dbGet('SELECT cell_id FROM cell_vote_summary WHERE cell_id = ?', [$cellId]);
    if ($ex) dbRun('UPDATE cell_vote_summary SET summary = ? WHERE cell_id = ?', [json_encode($summary), $cellId]);
    else dbRun('INSERT INTO cell_vote_summary (cell_id, summary) VALUES (?,?)', [$cellId, json_encode($summary)]);
    $record = dbGet('SELECT * FROM vote_records WHERE cell_id = ? AND domain = ? AND initials = ?', [$cellId, $body->domain, $initials]);
    send(200, ['record' => $record, 'domains' => array_map(function($r) { return ['name' => $r['domain'], 'yea' => $r['yea'], 'nay' => $r['nay'], 'abstain' => $r['abst'], 'total' => $r['yea'] + $r['nay']]; }, $rows), 'summary' => $summary]);
}

// ═════════════════════════════════════════════════════════
// GOVERNANCE ROUTES (submit + debate close)
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/cells\/([^\/]+)\/draft-resolutions\/([^\/]+)\/submit$/', $cleanPath, $m) && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $sc = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($sc['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $cellId = urldecode($m[1]); $draftId = urldecode($m[2]);
    $draft = dbGet('SELECT * FROM draft_resolutions WHERE id = ? AND cell_id = ?', [strval($draftId), $cellId]);
    if (!$draft) send(404, ['error' => 'Not found']); if ($draft['status'] !== 'draft') send(409, ['error' => 'Resolution already submitted']);
    dbRun("UPDATE draft_resolutions SET status = 'submitted' WHERE id = ?", [strval($draftId)]);
    $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cellId]);
    $rj = ($cell && $cell['resolution']) ? pJson($cell['resolution']) : []; $rj['status'] = 'Submitted';
    dbRun('UPDATE cells SET resolution = ? WHERE id = ?', [json_encode($rj), $cellId]);
    $astfId = 'astf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $os = $cell ? pJson($cell['source'] ?? '{}') : []; $cn = $os['circleName'] ?? $cell['circle'] ?? '';
    $as = ['type' => 'motion-audit', 'originCellId' => $cellId, 'originTitle' => $cell['title'] ?? '', 'draftId' => strval($draftId), 'draftTitle' => $draft['title'] ?? $cell['title'] ?? '', 'circleName' => $cn, 'submittedBy' => $user['name'] ?? $user['initials'], 'submittedAt' => date('Y-m-d\TH:i:s.000\Z')];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, blind, commissioned_by, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [$astfId, 'aSTF Cell', 'aSTF · ' . ($draft['title'] ?? $cell['title'] ?? ''), 'Blind Review', 'motion-audit', $cell['participants'] ?? 0, $cn, 1, $cellId, json_encode($as), json_encode(['status' => 'Pending']), json_encode(['assessors' => 3, 'rubric' => ['jurisdiction' => 0, 'depth' => 0, 'alignment' => 0, 'competence' => 0]])]);
    dbRun('UPDATE cells SET resolution_ref = ? WHERE id = ?', [$astfId, $cellId]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $astfId, 'aSTF', $draft['title'] ?? $cell['title'] ?? '', $cn, 'active', 'Blind Review', $draft['title'] ?? $cell['title'] ?? '', date('Y-m-d', time() + astfDurationDays() * 86400)]);
    send(200, ['ok' => true, 'status' => 'submitted', 'astfId' => $astfId]);
}
if (preg_match('/^\/cells\/([^\/]+)\/debate\/close$/', $cleanPath, $m) && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $sc = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($sc['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $cellId = urldecode($m[1]); $body = readBody(); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cellId]);
    if (!$cell) send(404, ['error' => 'Not found']);
    $sr = dbGet('SELECT summary FROM cell_vote_summary WHERE cell_id = ?', [$cellId]);
    $s = $sr ? pJson($sr['summary']) : []; $yea = (int)($s['yea'] ?? 0); $nay = (int)($s['nay'] ?? 0);
    $outcome = $nay > $yea ? 'failed' : 'passed';
    $evtStem = 'evt-crystal-' . preg_replace('/[^A-Za-z0-9_-]/', '_', $cellId);
    if ($cell['status'] === 'crystallised') { $ex = dbGet('SELECT id FROM governance_events WHERE id LIKE ?', [$evtStem . '%']); if ($ex) send(200, ['ok' => true, 'status' => 'crystallised', 'already' => true, 'outcome' => $outcome, 'yea' => $yea, 'nay' => $nay]); }
    $r = pJson($cell['resolution'] ?? '{}') ?: []; if (($r['status'] ?? '') === 'Draft' || ($r['status'] ?? '') === 'Submitted') $r['status'] = 'Crystallised'; $r['outcome'] = $outcome;
    dbRun("UPDATE cells SET status = 'crystallised', resolution = ? WHERE id = ?", [json_encode($r), $cellId]);
    dbRun("UPDATE draft_resolutions SET status = ? WHERE cell_id = ? AND status = 'submitted'", [$outcome === 'failed' ? 'failed' : 'passed', $cellId]);
    dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', [$evtStem . '-' . time(), 'cell-crystallisation', (string)($cell['circle'] ?? ''), date('Y-m-d'), '"' . ($cell['title'] ?? $cellId) . '" crystallised — resolution ' . $outcome . ' (yea ' . $yea . ' Ws / nay ' . $nay . ' Ws)', (string)($body->participant ?? '')]);
    send(200, ['ok' => true, 'status' => 'crystallised', 'outcome' => $outcome, 'yea' => $yea, 'nay' => $nay]);
}

// ═════════════════════════════════════════════════════════
// aSTF VERDICT
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/cells\/([^\/]+)\/astf-verdict$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $cellId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cellId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'aSTF Cell') send(400, ['error' => 'Not an aSTF cell']);
    if ($cell['status'] === 'Verdict Filed') send(409, ['error' => 'Verdict already filed']);
    $body = readBody(); $verdict = trim((string)($body->verdict ?? ''));
    if (!in_array($verdict, ['approved', 'rejected', 'revision'])) send(400, ['error' => 'verdict must be approved, rejected, or revision']);
    $rubric = $body->rubric ?? new \stdClass();
    $src = pJson($cell['source'] ?? '{}') ?: [];
    // Judicial audits are scored on justice, not motioncraft.
    $judicial = (($src['type'] ?? '') === 'judicial-audit');
    if ($judicial) {
        $dd = min(9, max(0, (int)($rubric->dueDiligence ?? 0))); $ju = min(9, max(0, (int)($rubric->justice ?? 0)));
        $pr = min(6, max(0, (int)($rubric->proportionality ?? 0))); $in = min(6, max(0, (int)($rubric->integrity ?? 0)));
        $total = $dd + $ju + $pr + $in;
        $rubOut = ['dueDiligence' => $dd, 'justice' => $ju, 'proportionality' => $pr, 'integrity' => $in, 'total' => $total];
    } else {
        $jur = min(9, max(0, (int)($rubric->jurisdiction ?? 0))); $dep = min(5, max(0, (int)($rubric->depth ?? 0)));
        $ali = min(10, max(0, (int)($rubric->alignment ?? 0))); $com = min(6, max(0, (int)($rubric->competence ?? 0)));
        $total = $jur + $dep + $ali + $com;
        $rubOut = ['jurisdiction' => $jur, 'depth' => $dep, 'alignment' => $ali, 'competence' => $com, 'total' => $total];
    }
    $rationale = trim((string)($body->rationale ?? '')); $flags = is_array($body->flags ?? null) ? $body->flags : [];
    $ar = ['verdict' => $verdict, 'rationale' => $rationale, 'flags' => $flags, 'rubric' => $rubOut, 'rubricKind' => $judicial ? 'judicial' : 'motion', 'adjudicator' => $user['name'] ?? $user['initials'], 'filedAt' => date('Y-m-d\TH:i:s.000\Z')];
    dbRun("UPDATE cells SET status = 'Verdict Filed', resolution = ? WHERE id = ?", [json_encode($ar), $cellId]);
    if (!$judicial) dbRun('UPDATE cells SET blind = 0 WHERE id = ?', [$cellId]);
    dbRun("UPDATE stfs SET status = 'Verdict Filed', bucket = 'completed' WHERE id = ?", ['stf-' . $cellId]);
    if ($flags) {
        foreach ($flags as $fn) {
            $fu = jstfResolveUser($fn);
            if (!$fu) continue;
            jstfRouteIntake('user:' . $fu['id'], 'Anonymous Report — ' . ($fu['name'] ?? $fu['initials']), 'Flagged during aSTF adjudication of "' . ($cell['title'] ?? $cellId) . '" by ' . ($user['name'] ?? $user['initials']) . '.');
        }
    }
    // jSTF judicial audit path
    if (($src['type'] ?? '') === 'judicial-audit' && !empty($src['sourceCellId'])) {
        $jstf = dbGet('SELECT * FROM cells WHERE id = ?', [$src['sourceCellId']]);
        if ($jstf) {
            $jm = pJson($jstf['meta'] ?? '{}') ?: []; $jr = pJson($jstf['resolution'] ?? '{}') ?: []; $jr['audit'] = $ar;
            if ($verdict === 'approved') {
                $jr['status'] = 'Applied'; $vi = $src['verdict'] ?? $jm['verdict'] ?? [];
                $targetId = $jm['targetId'] ?? null; $targetName = $jm['targetName'] ?? '';
                $actions = [];
                $hasPolicy = !empty($vi['policyRefs']);
                $sysActs = $vi['systemActions'] ?? [];
                $appealDir = $vi['appealDirection'] ?? null;
                $appealOf = $jm['appealOf'] ?? null;
                $revOf = $jm['revisionOf'] ?? null;
                if ($hasPolicy) $actions[] = 'applied per cited policy resolutions: ' . implode(', ', $vi['policyRefs']);
                if (!empty($vi['executingCircles'])) $actions[] = 'execution appointed to: ' . implode(', ', $vi['executingCircles']);
                if (($vi['type'] ?? '') === 'system-bound' && empty($sysActs)) $actions = array_merge($actions, ['target role/privileges updated per system settings', 'Ws recalculated', 'fresh vSTF composition triggered']);
                // citeable judicial resolution
                $jrRef = jstfMintPolicyRef();
                // Exoneration records no policy: there is nothing to cite and
                // nothing to execute — the closeout below lifts restriction.
                $isExon = (($vi['type'] ?? '') === 'exonerating');
                if (!$isExon) {
                $jrTitle = 'jSTF verdict — ' . ($targetName ?: $src['sourceCellId']);
                $jrText = ($vi['description'] ?? '') . ($actions ? "\n\nImplementation: " . implode('; ', $actions) : '');
                dbRun("INSERT INTO policies (id, ref, title, text, status, circle, passed, category, supersedes, upholds) VALUES (?,?,?,?,?,?,?,?,?,?)", [$jrRef, $jrRef, $jrTitle, $jrText, 'Enacted', 'Judicial', date('Y-m-d'), 'Judicial', ($appealDir === 'overturn' ? $appealOf : null), ($appealDir === 'uphold' ? $appealOf : null)]);
                $actions[] = 'recorded as ' . $jrRef;
                } else { $jrRef = null; }
                // system actions execute for real
                $guestApplied = false;
                foreach ($sysActs as $act) {
                    jstfExecuteSystemAction($src['sourceCellId'], $targetId, $targetName, $act, $actions);
                    if (($act['kind'] ?? '') === 'guest_until' && $targetId) $guestApplied = true;
                }
                // appeal direction: overturn supersedes, uphold supports
                if ($appealDir === 'overturn') {
                    if ($appealOf) $actions[] = 'supersedes ' . $appealOf;
                    if ($revOf) {
                        $orig = dbGet('SELECT * FROM cells WHERE id = ?', [$revOf]);
                        if ($orig) { $or = pJson($orig['resolution'] ?? '{}') ?: []; $or['status'] = 'Superseded'; $or['supersededBy'] = $src['sourceCellId']; dbRun('UPDATE cells SET resolution = ? WHERE id = ?', [json_encode($or), $revOf]); $actions[] = 'supersedes case ' . $revOf; }
                    }
                } elseif ($appealDir === 'uphold') {
                    if ($revOf) {
                        $orig = dbGet('SELECT * FROM cells WHERE id = ?', [$revOf]);
                        if ($orig) { $or = pJson($orig['resolution'] ?? '{}') ?: []; $sup = $or['supportedBy'] ?? []; $sup[] = $src['sourceCellId']; $or['supportedBy'] = array_values(array_unique($sup)); dbRun('UPDATE cells SET resolution = ? WHERE id = ?', [json_encode($or), $revOf]); $actions[] = 'upholds case ' . $revOf; }
                    }
                    if ($appealOf) $actions[] = 'upholds ' . $appealOf;
                }
                $jr['implementation'] = ['type' => $vi['type'] ?? 'policy-cited', 'executingCircles' => $vi['executingCircles'] ?? [], 'actions' => $actions, 'jrRef' => $jrRef];
                // An approved exonerating verdict closes the case as Exonerated:
                // claims found insignificant, no action attaches, and any
                // restriction in force is lifted automatically.
                $caseStatus = (($vi['type'] ?? '') === 'exonerating') ? 'Exonerated' : 'Resolution Applied';
                dbRun("UPDATE cells SET status = ?, resolution = ? WHERE id = ?", [$caseStatus, json_encode($jr), $src['sourceCellId']]);
                if (!$guestApplied) syncTargetRestriction($targetId, false, null, $src['sourceCellId']);
                if (!empty($jm['threadId'])) jstfAppendReply($jm['threadId'], 'Verdict recorded: ' . $caseStatus . ' — ' . substr((string)($vi['description'] ?? ''), 0, 300));
                dbRun("UPDATE stfs SET status = ?, bucket = 'completed' WHERE id = ?", [$caseStatus, 'stf-' . $src['sourceCellId']]);
                // The case is closed: no restriction survives on the record either.
                $jmClose = pJson(dbGet('SELECT meta FROM cells WHERE id = ?', [$src['sourceCellId']])['meta'] ?? '{}') ?: [];
                if (!empty($jmClose['restriction'])) { $was = $jmClose['restriction']['state'] ?? 'relaxed'; $jmClose['restriction']['state'] = 'relaxed'; $jmClose['restriction']['severity'] = null; $jmClose['restriction']['history'] = $jmClose['restriction']['history'] ?? []; $jmClose['restriction']['history'][] = ['prev' => $was, 'next' => 'relaxed', 'at' => date('Y-m-d\TH:i:s.000\Z'), 'by' => 'case-closed']; }
                dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($jmClose), $src['sourceCellId']]);
            } elseif ($verdict === 'rejected') {
                // Rejected: the verdict dies with this team — a fresh
                // composition reinvestigates from the sealed record.
                $jr['status'] = 'Rejected — new composition'; $jr['revisionNotes'] = $rationale;
                dbRun("UPDATE cells SET status = 'Under Investigation', resolution = ? WHERE id = ?", [json_encode($jr), $src['sourceCellId']]);
                jstfRefreshComposition($src['sourceCellId'], $user['name'] ?? $user['initials'], 'aSTF rejected');
            } else {
                // Revision: the same team redrafts — no reseat.
                $jr['status'] = 'Revision Ordered'; $jr['revisionNotes'] = $rationale;
                dbRun("UPDATE cells SET status = 'Under Investigation', resolution = ? WHERE id = ?", [json_encode($jr), $src['sourceCellId']]);
            }
            dbRun('INSERT INTO integrity_records (id, type, subject, purpose, circle, date, verdict, text) VALUES (?,?,?,?,?,?,?,?)', ['ir-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4) . '-' . preg_replace('/[^A-Za-z0-9_-]/', '_', $src['sourceCellId']), 'jSTF', (string)($jm['targetName'] ?? ''), 'Judicial investigation concluded', (string)($jstf['circle'] ?? ''), date('Y-m-d'), $verdict === 'approved' ? ((($vi['type'] ?? '') === 'exonerating') ? 'Exonerated' : 'Resolution Applied') : ($verdict === 'rejected' ? 'Rejected' : 'Revision Ordered'), 'aSTF audit ' . $verdict . ' — ' . substr((string)$rationale, 0, 500)]);
            dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'jstf-audit', '', date('Y-m-d'), 'aSTF audit on ' . $src['sourceCellId'] . ': ' . $verdict . ' (rubric ' . $total . '/30)', (string)($user['name'] ?? $user['initials'])]);
        }
        $asStf = dbGet("SELECT id FROM stfs WHERE type = 'aSTF' AND title = ?", ['aSTF Audit — ' . ($src['targetName'] ?? '')]);
        if ($asStf) dbRun("UPDATE stfs SET status = 'Verdict Filed', bucket = 'completed' WHERE id = ?", [$asStf['id']]);
        send(200, ['ok' => true, 'verdict' => $verdict, 'astfId' => $cellId, 'sourceCellId' => $src['sourceCellId'], 'rubricTotal' => $total]);
    }
    // update origin cell
    if (!empty($src['originCellId'])) {
        $origin = dbGet('SELECT * FROM cells WHERE id = ?', [$src['originCellId']]);
        if ($origin) { $or = pJson($origin['resolution'] ?? '{}') ?: [];
            if ($verdict === 'approved') { $or['status'] = 'Approved'; dbRun('UPDATE cells SET resolution = ? WHERE id = ?', [json_encode($or), $src['originCellId']]); dbRun("UPDATE draft_resolutions SET status = 'passed' WHERE cell_id = ? AND status = 'submitted'", [$src['originCellId']]); }
            elseif ($verdict === 'rejected') { $or['status'] = 'Rejected'; dbRun('UPDATE cells SET resolution = ? WHERE id = ?', [json_encode($or), $src['originCellId']]); dbRun("UPDATE draft_resolutions SET status = 'failed' WHERE cell_id = ? AND status = 'submitted'", [$src['originCellId']]); }
            else { $or['status'] = 'Revision Requested'; dbRun('UPDATE cells SET resolution = ? WHERE id = ?', [json_encode($or), $src['originCellId']]); dbRun("UPDATE draft_resolutions SET status = 'draft' WHERE cell_id = ? AND status = 'submitted'", [$src['originCellId']]); }
        }
        dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-astf-' . preg_replace('/[^A-Za-z0-9_-]/', '_', $cellId) . '-' . time(), 'astf-verdict', (string)($src['circleName'] ?? ''), date('Y-m-d'), '"' . ($cell['title'] ?? $cellId) . '" — aSTF verdict: ' . $verdict . ' (rubric ' . $total . '/30)', (string)($user['name'] ?? $user['initials'])]);
    }
    send(200, ['ok' => true, 'verdict' => $verdict, 'astfId' => $cellId, 'originCellId' => $src['originCellId'] ?? null, 'rubricTotal' => $total]);
}

// ═════════════════════════════════════════════════════════
// xSTF ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/cells\/([^\/]+)\/spawn-xstf$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $sc = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($sc['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $afId = urldecode($m[1]); $af = dbGet('SELECT * FROM cells WHERE id = ?', [$afId]);
    if (!$af) send(404, ['error' => 'Not found']); if ($af['type'] !== 'aSTF Cell') send(400, ['error' => 'Not an aSTF cell']);
    $afRes = pJson($af['resolution'] ?? '{}') ?: []; if (($afRes['verdict'] ?? '') !== 'approved') send(400, ['error' => 'aSTF verdict not approved']);
    $ex = dbGet("SELECT id FROM cells WHERE type = 'xSTF Cell' AND commissioned_by = ?", [$afId]); if ($ex) send(409, ['error' => 'xSTF already spawned']);
    $body = readBody(); $as2 = pJson($af['source'] ?? '{}') ?: [];
    $title = preg_replace('/^aSTF · /', '', (string)($body->title ?? $as2['draftTitle'] ?? $af['title'] ?? ''));
    $team = is_array($body->team ?? null) ? $body->team : []; $specs = $body->deliverableSpecs ?? new \stdClass();
    $xId = 'xstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4); $blind = isset($body->blind) ? ($body->blind ? 1 : 0) : 1;
    $deadline = trim((string)($body->deadline ?? '')) ?: date('Y-m-d', time() + 30 * 86400);
    // Authority is explicit and visible: the approved aSTF resolution that
    // permits this execution, plus any additional cited refs.
    $authorityRefs = array_values(array_filter(array_map('strval', is_array($body->authorityRefs ?? null) ? $body->authorityRefs : [])));
    $mandateRefs = array_values(array_filter(array_map('strval', is_array($body->mandateRefs ?? null) ? $body->mandateRefs : [])));
    $citedContent = trim((string)($body->citedContent ?? ''));
    $dSpecs = ['name' => (string)($specs->name ?? $title), 'description' => (string)($specs->description ?? ''), 'sections' => (int)($specs->sections ?? 4), 'wordCount' => (string)($specs->wordCount ?? 'TBD'), 'language' => (string)($specs->language ?? 'Plain English'), 'reviewProcess' => (string)($specs->reviewProcess ?? 'draft-circle-final')];
    $defTasks = [['id'=>'t0','label'=>'STF formulation','status'=>'pending','locked'=>true],['id'=>'t1','label'=>'Mandate comprehension','status'=>'pending','locked'=>false],['id'=>'t2','label'=>'Research & drafting','status'=>'pending','locked'=>false],['id'=>'t3','label'=>'Internal review','status'=>'pending','locked'=>false],['id'=>'t4','label'=>'Circle review cycle','status'=>'pending','locked'=>false],['id'=>'t5','label'=>'Finalisation','status'=>'pending','locked'=>false],['id'=>'t6','label'=>'Dissolve STF','status'=>'pending','locked'=>true]];
    $xs = ['type' => 'xstf-execution', 'astfId' => $afId, 'originCellId' => $as2['originCellId'] ?? null, 'circleName' => $as2['circleName'] ?? $af['circle'] ?? '', 'authority' => ['basis' => 'astf-resolution', 'ref' => $afId, 'extraRefs' => $authorityRefs], 'mandateRefs' => $mandateRefs, 'citedContent' => $citedContent, 'commissionedBy' => $user['name'] ?? $user['initials'], 'commissionedAt' => date('Y-m-d\TH:i:s.000\Z')];
    dbRun('INSERT INTO cells (id, type, title, status, participants, circle, blind, commissioned_by, source, resolution, meta, deliverable_specs, progress, deadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$xId, 'xSTF Cell', $title, 'Active', count($team) ?: 3, $xs['circleName'], $blind, $afId, json_encode($xs), json_encode(['status' => 'In Progress']), json_encode(['tasks' => $defTasks, 'objectives' => []]), json_encode($dSpecs), 0, $deadline]);
    foreach ($team as $t) dbRun('INSERT INTO cell_team (cell_id, name, initials, role) VALUES (?,?,?,?)', [$xId, (string)($t->name ?? ''), (string)($t->initials ?? ''), (string)($t->role ?? 'Team Member')]);
    foreach ($defTasks as $dt) dbRun('INSERT INTO cell_tasks (cell_id, task_id, label, status, locked, assignee) VALUES (?,?,?,?,?,?)', [$xId, $dt['id'], $dt['label'], $dt['status'], $dt['locked'] ? 1 : 0, null]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $xId, 'xSTF', $title, $xs['circleName'], 'active', 'Active', $title, $deadline]);
    send(201, ['ok' => true, 'xstfId' => $xId]);
}
if (preg_match('/^\/cells\/([^\/]+)\/submit-deliverable$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'xSTF Cell') send(400, ['error' => 'Not an xSTF cell']);
    if (($cell['status'] ?? '') === 'Completed') send(400, ['error' => 'Probe is completed — findings recorded']);
    $csrc = pJson($cell['source'] ?? '{}') ?: [];
    // Isolated investigator paths: only the assigned investigator files here.
    if (($csrc['type'] ?? '') === 'jstf-investigation' && !jstfTeamMember($cId, $user)) send(403, ['error' => 'Only the assigned investigator may file on this path']);
    $body = readBody(); $title = trim((string)($body->title ?? '')); if (!$title) send(400, ['error' => 'title required']);
    $content = trim((string)($body->content ?? '')); $meta = pJson($cell['meta'] ?? '{}') ?: [];
    $dels = $meta['deliverables'] ?? [];
    $dels[] = ['id' => 'del-' . time() . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'title' => $title, 'content' => $content, 'submittedBy' => $user['name'] ?? $user['initials'], 'submittedAt' => date('Y-m-d\TH:i:s.000\Z'), 'status' => 'submitted'];
    $meta['deliverables'] = $dels; dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(201, ['ok' => true, 'deliverableId' => end($dels)['id']]);
}
if (preg_match('/^\/cells\/([^\/]+)\/review-deliverable$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $sc = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($sc['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'xSTF Cell') send(400, ['error' => 'Not an xSTF cell']);
    $body = readBody(); $dId = trim((string)($body->deliverableId ?? '')); $decision = trim((string)($body->decision ?? ''));
    if (!in_array($decision, ['approved', 'revision'])) send(400, ['error' => 'decision must be approved or revision']);
    $meta = pJson($cell['meta'] ?? '{}') ?: []; $dels = $meta['deliverables'] ?? []; $del = null;
    foreach ($dels as &$d) { if ($d['id'] === $dId) { $del = &$d; break; } } unset($d);
    if (!$del) send(404, ['error' => 'Deliverable not found']); if ($del['status'] !== 'submitted') send(409, ['error' => 'Deliverable already reviewed']);
    $del['status'] = $decision; $del['reviewedBy'] = $user['name'] ?? $user['initials']; $del['reviewedAt'] = date('Y-m-d\TH:i:s.000\Z'); $del['reviewComment'] = trim((string)($body->comment ?? ''));
    $meta['deliverables'] = $dels;
    if ($decision === 'approved') {
        dbRun("UPDATE cells SET status = 'Completed', meta = ?, resolution = ? WHERE id = ?", [json_encode($meta), json_encode(['status' => 'Delivered']), $cId]);
        $sr = dbGet("SELECT id FROM stfs WHERE type = 'xSTF' AND title = ? AND status = 'Active'", [$cell['title'] ?? '']);
        if ($sr) dbRun("UPDATE stfs SET status = 'Completed', bucket = 'completed' WHERE id = ?", [$sr['id']]);
    } else dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(200, ['ok' => true, 'decision' => $decision, 'deliverableId' => $dId]);
}

// ═════════════════════════════════════════════════════════
// vSTF ROUTES
// ═════════════════════════════════════════════════════════
// ── Integrity engine ─────────────────────────────────────────────
// jSTF never commissions a vSTF. It only sets conditions (unverified
// competences, recorded vacancies). This lazy poll — run on bootstrap,
// capped per run — notices the conditions and commissions what they call
// for. Idempotent: every action re-checks before writing.
function engineSpawnVstf($type, $candName, $candIni, $circleName, $domains, $extraSrc = []) {
    $vId = 'vstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $src = array_merge(['type' => $type, 'candidateName' => $candName, 'candidateInitials' => $candIni, 'circleName' => $circleName, 'commissionedBy' => 'integrity-engine', 'commissionedAt' => date('Y-m-d\TH:i:s.000\Z')], $extraSrc);
    $title = ($type === 'steward-candidacy' ? 'vSTF · Steward Candidacy · ' : 'vSTF · Competence · ') . $candName;
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, blind, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [$vId, 'vSTF Cell', $title, 'Pending Assessment', $type, 3, $circleName, 'system', 1, json_encode($src), json_encode(['status' => 'Pending', 'score' => null]), json_encode(['candidateName' => $candName, 'candidateInitials' => $candIni, 'domains' => $domains, 'assessments' => []])]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $vId, 'vSTF', $type === 'steward-candidacy' ? 'Steward Candidacy' : 'Competence Claims', $circleName, 'active', 'Pending Assessment', $candName, date('Y-m-d', time() + 14 * 86400)]);
    dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-eng-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'engine-commission', $circleName, date('Y-m-d'), 'Integrity engine commissioned ' . ($type === 'steward-candidacy' ? 'candidacy vetting' : 'competence verification') . ' for ' . $candName . ' [' . $vId . ']', 'integrity-engine']);
    return $vId;
}
function engineOpenClaim($candId, $candIni, $type) {
    foreach (dbAll("SELECT id, source, meta FROM cells WHERE type = 'vSTF Cell' AND delib_type = ? AND status <> 'Assessment Filed'", [$type]) as $oc) {
        $os = pJson($oc['source'] ?? '{}') ?: []; $om = pJson($oc['meta'] ?? '{}') ?: [];
        $on = ($os['candidateName'] ?? $om['candidateName'] ?? ''); $oi = ($os['candidateInitials'] ?? $om['candidateInitials'] ?? '');
        if ($candId && vstfResolveCandidate($on, $oi) && vstfResolveCandidate($on, $oi)['id'] === $candId) return $oc['id'];
        if (!$candId && $candIni && $oi === $candIni) return $oc['id'];
    }
    return null;
}
function engineRecentVetting($candId, $candIni, $months = 12) {
    $cut = date('Y-m-d', time() - $months * 30 * 86400);
    foreach (dbAll("SELECT source, meta FROM cells WHERE type = 'vSTF Cell' AND delib_type = 'steward-candidacy' AND status = 'Assessment Filed'") as $vc) {
        $vs = pJson($vc['source'] ?? '{}') ?: []; $vm = pJson($vc['meta'] ?? '{}') ?: [];
        $vd = $vm['completedAt'] ?? $vs['commissionedAt'] ?? null;
        $cand = vstfResolveCandidate($vs['candidateName'] ?? $vm['candidateName'] ?? '', $vs['candidateInitials'] ?? $vm['candidateInitials'] ?? '');
        $match = ($cand && $candId && $cand['id'] === $candId) || (!$candId && $candIni && ($vs['candidateInitials'] ?? $vm['candidateInitials'] ?? '') === $candIni);
        if ($match && (!$vd || substr((string)$vd, 0, 10) >= $cut)) return true;
    }
    return false;
}
// The poll: ripple A (unverified competence claims get a verification),
// ripple B (circle vacancies vet their succession pool, then seat the top
// approved candidate per open seat). Capped per run; safe to run often.
function integrityEnginePoll($cap = 3) {
    // Capacity is split so a long verification backlog can never starve
    // succession: vetting/seating always get their share of the run.
    $capA = max(1, (int)floor($cap / 2)); $capB = max(1, $cap - $capA);
    $doneA = 0; $doneB = 0;
    // Ripple A: anyone active with unverified claims and no open
    // competence-claim gets one auto-commissioned.
    foreach (dbAll("SELECT DISTINCT uc.user_id AS uid FROM user_competence uc JOIN users u ON u.id = uc.user_id WHERE uc.verified = 0 AND u.status = 'Active' ORDER BY uc.user_id") as $ur) {
        if ($doneA >= $capA) break;
        $uid = $ur['uid']; if (!$uid || engineOpenClaim($uid, null, 'competence-claim')) continue;
        $u = dbGet('SELECT * FROM users WHERE id = ?', [$uid]); if (!$u) continue;
        $doms = array_values(array_filter(array_map(function($d) { return $d['domain']; }, dbAll('SELECT domain FROM user_competence WHERE user_id = ? AND verified = 0', [$uid]))));
        if (!$doms) continue;
        engineSpawnVstf('competence-claim', $u['name'], $u['initials'], '', $doms, ['reason' => 'unverified-claims']);
        $doneA++;
    }
    // Ripple B: vacancies vet their succession pool, then seat.
    foreach (dbAll('SELECT * FROM circles') as $circle) {
        $cm = pJson($circle['meta'] ?? '{}') ?: []; $vacs = $cm['vacancies'] ?? [];
        if (!$vacs) continue;
        $pool = dbAll("SELECT * FROM circle_applications WHERE circle_id = ? AND status = 'pending' ORDER BY queue_position, applied_date", [$circle['id']]);
        foreach ($pool as $ap) {
            if ($doneB >= $capB) break 2;
            $apu = vstfResolveCandidate($ap['applicant'] ?? '', $ap['initials'] ?? '');
            $apid = $apu ? $apu['id'] : null;
            if (engineOpenClaim($apid, $ap['initials'] ?? '', 'steward-candidacy')) continue;
            if (engineRecentVetting($apid, $ap['initials'] ?? '')) continue;
            engineSpawnVstf('steward-candidacy', $ap['applicant'] ?? '', $ap['initials'] ?? '', $circle['name'], [], ['reason' => 'succession-vetting', 'vacancyFor' => $circle['id'], 'proposalId' => $ap['id'] ?? null]);
            $doneB++;
        }
        // Seat: top approved-vetted applicant per open seat.
        $seatedAny = false;
        foreach ($vacs as $vi => $vac) {
            $cands = [];
            foreach ($pool as $ap) {
                $apu = vstfResolveCandidate($ap['applicant'] ?? '', $ap['initials'] ?? '');
                if (!$apu) continue;
                if (dbGet("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$circle['id'], $apu['id']])) continue;
                $ok = null;
                foreach (dbAll("SELECT source, meta, resolution FROM cells WHERE type = 'vSTF Cell' AND delib_type = 'steward-candidacy' AND status = 'Assessment Filed'") as $vc) {
                    $vs = pJson($vc['source'] ?? '{}') ?: []; $vm = pJson($vc['meta'] ?? '{}') ?: []; $vr = pJson($vc['resolution'] ?? '{}') ?: [];
                    if (empty($vr['approved'])) continue;
                    $vcand = vstfResolveCandidate($vs['candidateName'] ?? $vm['candidateName'] ?? '', $vs['candidateInitials'] ?? $vm['candidateInitials'] ?? '');
                    if ($vcand && $vcand['id'] === $apu['id']) { $ok = $vr; break; }
                }
                if ($ok) $cands[] = ['user' => $apu, 'score' => (int)($ok['score'] ?? 0), 'app' => $ap];
            }
            if (!$cands) continue;
            usort($cands, function($a, $b) { return $b['score'] - $a['score']; });
            $win = $cands[0]; $wu = $win['user'];
            dbRun("INSERT INTO circle_roster (circle_id, member_id, name, initials, color, ws, status, joined, last_active, `left`, left_reason, top_domain) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [$circle['id'], $wu['id'], $wu['name'], $wu['initials'], 'var(--navy-light)', 0, 'active', date('M Y'), 'just now', null, null, null]);
            dbRun("INSERT INTO user_circles (user_id, circle, status, since, kind) VALUES (?,?,?,?,?)", [$wu['id'], $circle['name'], 'Active', date('M Y'), 'roster']);
            dbRun("UPDATE circle_applications SET status = 'accepted' WHERE id = ?", [$win['app']['id']]);
            unset($vacs[$vi]); $seatedAny = true;
            dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-eng-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'engine-seating', $circle['name'], date('Y-m-d'), $wu['name'] . ' seated as steward of ' . $circle['name'] . ' (vetted ' . $win['score'] . '/100, succession)', 'integrity-engine']);
        }
        if ($seatedAny) { $cm['vacancies'] = array_values($vacs); dbRun('UPDATE circles SET meta = ? WHERE id = ?', [json_encode($cm), $circle['id']]); }
    }
    return $doneA + $doneB;
}
// Resolve a vSTF candidate to a user (initials first — unique per member).
function vstfResolveCandidate($name, $initials) {
    if ($initials) { $u = dbGet('SELECT * FROM users WHERE initials = ?', [$initials]); if ($u) return $u; }
    if ($name) { $u = dbGet('SELECT * FROM users WHERE name = ?', [$name]); if ($u) return $u; }
    return null;
}
if (preg_match('/^\/cells\/([^\/]+)\/spawn-vstf$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $sc = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($sc['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']);
    $body = readBody(); $vt = trim((string)($body->vstfType ?? 'steward-candidacy'));
    if (!in_array($vt, ['steward-candidacy', 'competence-claim'])) send(400, ['error' => 'vstfType must be steward-candidacy or competence-claim']);
    // One open claim per candidate per host: completed claims never block a
    // re-verification, and different candidates never block each other.
    $candName0 = trim((string)($body->candidateName ?? '')); $candIni0 = trim((string)($body->candidateInitials ?? ''));
    foreach (dbAll("SELECT id, status, source FROM cells WHERE type = 'vSTF Cell' AND commissioned_by = ? AND delib_type = ?", [$cId, $vt]) as $exRow) {
        if (($exRow['status'] ?? '') === 'Assessment Filed') continue;
        $exSrc = pJson($exRow['source'] ?? '{}') ?: [];
        $sameName = $candName0 !== '' && ($exSrc['candidateName'] ?? '') === $candName0;
        $sameIni = $candIni0 !== '' && ($exSrc['candidateInitials'] ?? '') === $candIni0;
        if ($sameName || $sameIni || ($candName0 === '' && $candIni0 === '')) send(409, ['error' => 'An open vSTF claim for this candidate already exists', 'vstfId' => $exRow['id']]);
    }
    $cn = trim((string)($body->circleName ?? $cell['circle'] ?? '')); $ma = (int)($body->minAssessors ?? 3);
    $vId = 'vstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $src = ['type' => $vt, 'candidateName' => trim((string)($body->candidateName ?? '')), 'candidateInitials' => trim((string)($body->candidateInitials ?? '')), 'circleName' => $cn, 'sourceCellId' => $cId, 'sourceTitle' => $cell['title'] ?? '', 'spawnedBy' => $user['name'] ?? $user['initials'], 'spawnedAt' => date('Y-m-d\TH:i:s.000\Z')];
    $domains = is_array($body->domains ?? null) ? $body->domains : [];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, blind, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [$vId, 'vSTF Cell', ($vt === 'steward-candidacy' ? 'vSTF · Steward Candidacy · ' : 'vSTF · Competence · ') . $src['candidateName'], 'Pending Assessment', $vt, $ma, $cn, $cId, 1, json_encode($src), json_encode(['status' => 'Pending', 'score' => null]), json_encode(['candidateName' => $src['candidateName'], 'candidateInitials' => $src['candidateInitials'], 'domains' => $domains, 'assessments' => []])]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $vId, 'vSTF', $vt === 'steward-candidacy' ? 'Steward Candidacy' : 'Competence Claims', $cn, 'active', 'Pending Assessment', $src['candidateName'] ?: $cell['title'] ?? '', date('Y-m-d', time() + 14 * 86400)]);
    send(201, ['ok' => true, 'vstfId' => $vId]);
}
if (preg_match('/^\/cells\/([^\/]+)\/vstf-assessment$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'vSTF Cell') send(400, ['error' => 'Not a vSTF cell']);
    if ($cell['status'] === 'Assessment Filed') send(409, ['error' => 'Assessment already filed']);
    $body = readBody(); $meta = pJson($cell['meta'] ?? '{}') ?: []; $assessments = $meta['assessments'] ?? [];
    // One member one assessment: keyed on user id, legacy name fallback.
    foreach ($assessments as $a) { if ((!empty($a['assessorId']) && $a['assessorId'] === $user['id']) || (empty($a['assessorId']) && ($a['assessor'] ?? '') === ($user['name'] ?? $user['initials']))) send(409, ['error' => 'You have already filed an assessment']); }
    $vt2 = $meta['type'] ?? (pJson($cell['source'] ?? '{}')['type'] ?? 'steward-candidacy');
    // Candidates cannot assess their own claim.
    $srcC0 = pJson($cell['source'] ?? '{}') ?: [];
    $cand0 = vstfResolveCandidate($srcC0['candidateName'] ?? $meta['candidateName'] ?? '', $srcC0['candidateInitials'] ?? $meta['candidateInitials'] ?? '');
    if ($cand0 && $cand0['id'] === $user['id']) send(403, ['error' => 'Candidates cannot assess their own claim']);
    $ass = ['assessor' => $user['name'] ?? $user['initials'], 'assessorId' => $user['id'], 'filedAt' => date('Y-m-d\TH:i:s.000\Z')];
    if ($vt2 === 'steward-candidacy') { $score = min(100, max(0, (int)($body->score ?? 0))); $rat = trim((string)($body->rationale ?? '')); if (!$rat) send(400, ['error' => 'rationale required']); $ass['score'] = $score; $ass['rationale'] = $rat; }
    else { $ass['domainEvals'] = is_array($body->domainEvals ?? null) ? $body->domainEvals : []; $ass['comment'] = trim((string)($body->comment ?? '')); }
    $assessments[] = $ass; $meta['assessments'] = $assessments; $minA = $cell['participants'] ?? 3;
    if (count($assessments) >= $minA) {
        $fs = $vt2 === 'steward-candidacy' ? round(array_reduce($assessments, function($s, $a) { return $s + ($a['score'] ?? 0); }, 0) / count($assessments)) : count($assessments);
        $res = ['status' => 'Complete', 'score' => $fs];
        $srcC = pJson($cell['source'] ?? '{}') ?: [];
        $cand = vstfResolveCandidate($srcC['candidateName'] ?? $meta['candidateName'] ?? '', $srcC['candidateInitials'] ?? $meta['candidateInitials'] ?? '');
        $candLabel = $cand ? ($cand['name'] ?? $cId) : ($srcC['candidateName'] ?? $cId);
        if ($vt2 === 'steward-candidacy') {
            // Average score of 60+ carries the candidacy (recorded, not seated:
            // seating remains a governed act of its own).
            $approved = $fs >= 60;
            $res['approved'] = $approved;
            dbRun("UPDATE cells SET status = 'Assessment Filed', meta = ?, resolution = ? WHERE id = ?", [json_encode($meta), json_encode($res), $cId]);
            dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-vstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'vstf-candidacy', '', date('Y-m-d'), 'Steward candidacy for ' . $candLabel . ' ' . ($approved ? 'approved' : 'not approved') . ' (avg ' . $fs . '/100 over ' . count($assessments) . ' assessments)', 'vSTF']);
        } else {
            // Competence claims verify for real: the candidate's claimed
            // domains flip to verified on completion.
            $marked = [];
            if ($cand) foreach (($meta['domains'] ?? []) as $dmn) { $dn = is_array($dmn) ? ($dmn['name'] ?? '') : (string)$dmn; if ($dn === '') continue; dbRun('UPDATE user_competence SET verified = 1 WHERE user_id = ? AND domain = ?', [$cand['id'], $dn]); $marked[] = $dn; }
            $res['verifiedDomains'] = $marked;
            dbRun("UPDATE cells SET status = 'Assessment Filed', meta = ?, resolution = ? WHERE id = ?", [json_encode($meta), json_encode($res), $cId]);
            dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-vstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'vstf-competence', '', date('Y-m-d'), 'Competence verified for ' . $candLabel . ': ' . (implode(', ', $marked) ?: 'no matching domains') . ' (' . count($assessments) . ' assessments)', 'vSTF']);
        }
        dbRun("UPDATE stfs SET status = 'Completed', bucket = 'completed' WHERE id = ?", ['stf-' . $cId]);
    } else dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(200, ['ok' => true, 'filed' => count($assessments), 'required' => $minA, 'complete' => count($assessments) >= $minA]);
}

// ═════════════════════════════════════════════════════════
// EVIDENCE ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/cells\/([^\/]+)\/evidence$/', $cleanPath, $m)) {
    $cId = urldecode($m[1]);
    if ($method === 'GET') {
        $evCell = dbGet('SELECT type, blind FROM cells WHERE id = ?', [$cId]);
        if ($evCell && !empty($evCell['blind']) && in_array($evCell['type'] ?? '', ['jSTF Cell', 'xSTF Cell', 'vSTF Cell'])) {
            $evUser = authUser(); $evOk = false;
            if (($evCell['type'] ?? '') === 'vSTF Cell') $evOk = vstfReader($cId, $evUser);
            elseif (($evCell['type'] ?? '') === 'xSTF Cell') $evOk = jstfProbeReader($cId, $evUser);
            else $evOk = jstfTeamMember($cId, $evUser);
            if (!$evOk) send(404, ['error' => 'Not found']);
        }
        send(200, ['ok' => true, 'evidence' => dbAll('SELECT * FROM stf_evidence WHERE cell_id = ? ORDER BY id', [$cId])]);
    }
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    if (!dbGet('SELECT id FROM cells WHERE id = ?', [$cId])) send(404, ['error' => 'Cell not found']);
    $body = readBody(); $title = trim((string)($body->title ?? '')); if (!$title) send(400, ['error' => 'title required']);
    $status = in_array($body->status ?? '', ['pending', 'under-review', 'verified']) ? $body->status : 'pending';
    $res = dbRun('INSERT INTO stf_evidence (cell_id, candidate, title, detail, link, status, submitted_by, submitted_at) VALUES (?,?,?,?,?,?,?,?)', [$cId, trim((string)($body->candidate ?? '')) ?: null, $title, trim((string)($body->detail ?? '')) ?: null, trim((string)($body->link ?? '')) ?: null, $status, $user['name'] ?? $user['initials'], date('Y-m-d\TH:i:s.000\Z')]);
    send(201, ['ok' => true, 'id' => $res->insertId]);
}

// ═════════════════════════════════════════════════════════
// p-aSTF ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/cells\/([^\/]+)\/spawn-pastf$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $sc = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($sc['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']);
    $ex = dbGet("SELECT id FROM cells WHERE type = 'p-aSTF Cell' AND commissioned_by = ?", [$cId]); if ($ex) send(409, ['error' => 'p-aSTF already spawned']);
    $body = readBody(); $cn = trim((string)($body->circleName ?? $cell['circle'] ?? '')); $mr = (int)($body->minReviewers ?? 3);
    $pId = 'pastf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $src = ['type' => 'periodic-review', 'sourceCellId' => $cId, 'sourceTitle' => $cell['title'] ?? '', 'circleName' => $cn, 'spawnedBy' => $user['name'] ?? $user['initials'], 'spawnedAt' => date('Y-m-d\TH:i:s.000\Z')];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [$pId, 'p-aSTF Cell', 'p-aSTF · ' . $cn . ' Health Review', 'Pending Review', 'periodic-review', $mr, $cn, $cId, json_encode($src), json_encode(['status' => 'Pending']), json_encode(['circleName' => $cn, 'minReviewers' => $mr, 'reviews' => []])]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $pId, 'p-aSTF', 'Periodic Circle Health Review', $cn, 'active', 'Pending Review', $cn . ' Health', date('Y-m-d', time() + 30 * 86400)]);
    send(201, ['ok' => true, 'pastfId' => $pId]);
}
if (preg_match('/^\/cells\/([^\/]+)\/pastf-review$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'p-aSTF Cell') send(400, ['error' => 'Not a p-aSTF cell']);
    $meta = pJson($cell['meta'] ?? '{}') ?: []; $reviews = $meta['reviews'] ?? [];
    foreach ($reviews as $r) { if (($r['reviewer'] ?? '') === ($user['name'] ?? $user['initials'])) send(409, ['error' => 'You have already filed a review']); }
    $body = readBody(); $cr = $body->circleRubric ?? new \stdClass();
    $act = min(6, max(0, (int)($cr->activity ?? 0))); $cf = min(7, max(0, (int)($cr->competenceFit ?? 0)));
    $disc = min(6, max(0, (int)($cr->discipline ?? 0))); $coh = min(5, max(0, (int)($cr->cohesion ?? 0)));
    $del = min(6, max(0, (int)($cr->delivery ?? 0))); $cTotal = $act + $cf + $disc + $coh + $del;
    $mrs = is_array($body->memberReviews ?? null) ? $body->memberReviews : [];
    $pm = array_map(function($mr) {
        $ef = min(5, max(0, (int)($mr->effectiveness ?? 0))); $st = min(7, max(0, (int)($mr->stewardship ?? 0)));
        $pa = min(5, max(0, (int)($mr->participation ?? 0))); $inv = min(8, max(0, (int)($mr->investment ?? 0)));
        $pr = min(6, max(0, (int)($mr->productivity ?? 0))); $rf = min(4, max(0, (int)($mr->roleFit ?? 0)));
        $rep = min(5, max(0, (int)($mr->replaceability ?? 0))); $ind = min(5, max(0, (int)($mr->indispensable ?? 0)));
        return ['name' => $mr->name ?? '', 'initials' => $mr->initials ?? '', 'effectiveness' => $ef, 'stewardship' => $st, 'participation' => $pa, 'investment' => $inv, 'productivity' => $pr, 'roleFit' => $rf, 'memberTotal' => $ef + $st + $pa + $inv + $pr + $rf, 'replaceability' => $rep, 'indispensable' => $ind, 'knowledgeTransfer' => $rep > 3, 'jstfReferral' => $ind > 3];
    }, $mrs);
    $ht = trim((string)($body->healthTier ?? 'healthy'));
    if (!in_array($ht, ['healthy', 'watch', 'concern'])) send(400, ['error' => 'healthTier must be healthy, watch, or concern']);
    $notes = trim((string)($body->notes ?? ''));
    $reviews[] = ['reviewer' => $user['name'] ?? $user['initials'], 'filedAt' => date('Y-m-d\TH:i:s.000\Z'), 'circleRubric' => ['activity' => $act, 'competenceFit' => $cf, 'discipline' => $disc, 'cohesion' => $coh, 'delivery' => $del, 'total' => $cTotal], 'memberReviews' => $pm, 'healthTier' => $ht, 'notes' => $notes];
    $meta['reviews'] = $reviews; $minR = $meta['minReviewers'] ?? 3;
    if (count($reviews) >= $minR) {
        $avgC = round(array_reduce($reviews, function($s, $r) { return $s + $r['circleRubric']['total']; }, 0) / count($reviews));
        $tc = ['healthy' => 0, 'watch' => 0, 'concern' => 0]; foreach ($reviews as $r) $tc[$r['healthTier']] = ($tc[$r['healthTier']] ?? 0) + 1;
        $ft = 'healthy'; if ($tc['concern'] > $tc['healthy'] && $tc['concern'] > $tc['watch']) $ft = 'concern'; elseif ($tc['watch'] >= $tc['healthy']) $ft = 'watch';
        dbRun("UPDATE cells SET status = 'Review Complete', meta = ?, resolution = ? WHERE id = ?", [json_encode($meta), json_encode(['status' => 'Complete', 'avgCircle' => $avgC, 'healthTier' => $ft]), $cId]);
        $sr = dbGet("SELECT id FROM stfs WHERE type = 'p-aSTF' AND status = 'Pending Review'");
        if ($sr) dbRun("UPDATE stfs SET status = 'Completed', bucket = 'completed' WHERE id = ?", [$sr['id']]);
    } else dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    foreach ($pm as $member) {
        if (empty($member['jstfReferral']) || empty($member['name'])) continue;
        $fu = jstfResolveUser($member['name']);
        if (!$fu) continue;
        jstfRouteIntake('user:' . $fu['id'], 'Anonymous Report — ' . ($fu['name'] ?? $fu['initials']), 'Referred for jSTF review during p-aSTF periodic review (' . ($member['indispensable'] ?? '?') . '/5 indispensable) by ' . ($user['name'] ?? $user['initials']) . '.');
    }
    send(200, ['ok' => true, 'filed' => count($reviews), 'required' => $minR, 'complete' => count($reviews) >= $minR, 'circleTotal' => $cTotal]);
}

// ═════════════════════════════════════════════════════════
// jSTF ROUTES
// ═════════════════════════════════════════════════════════
function jstfTerminalStatuses() { return ['Resolution Applied', 'Exonerated', 'Closed', 'Archived']; }
function jstfAppendReply($threadId, $desc) {
    $rid = 'jstf-reply-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
    dbRun('INSERT INTO thread_replies (id, thread_id, author, initials, time, body, likes) VALUES (?,?,?,?,?,?,0)', [$rid, $threadId, 'Anonymous', '?', date('Y-m-d'), $desc]);
    dbRun('UPDATE threads SET replies = replies + 1 WHERE id = ?', [$threadId]);
    $rr = dbGet('SELECT replies FROM threads WHERE id = ?', [$threadId]);
    return (int)($rr['replies'] ?? 0);
}
function jstfCreateIntakeThread($link, $title, $desc, $user = null, $named = false) {
    $prefix = (str_starts_with($link, 'case:') || str_starts_with($link, 'resolution:')) ? 'thread-appeal-' : 'thread-jstf-';
    $thrId = $prefix . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $author = 'Anonymous'; $ini = '?';
    if ($named && $user) { $author = $user['name'] ?? $user['initials']; $ini = $user['initials'] ?? '?'; }
    dbRun('INSERT INTO threads (id, title, body, author, initials, badge, badge_class, replies, likes, shares, time, visibility, proposal_cell_id, submitter_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$thrId, $title, $desc, $author, $ini, 'b-judicial', 'b-judicial', 1, 0, 0, date('Y-m-d'), 'stewards-only', $link, $user['id'] ?? null]);
    return $thrId;
}
function jstfOpenCaseForLink($link) {
    $term = jstfTerminalStatuses();
    $cells = dbAll("SELECT * FROM cells WHERE type = 'jSTF Cell'");
    foreach ($cells as $c) {
        if (in_array($c['status'] ?? '', $term, true)) continue;
        $meta = pJson($c['meta'] ?? '{}') ?: []; $src = pJson($c['source'] ?? '{}') ?: [];
        $tid = $meta['threadId'] ?? $src['threadId'] ?? null;
        if (str_starts_with($link, 'user:')) {
            if (($meta['targetId'] ?? null) === substr($link, 5)) return ['cell' => $c, 'threadId' => $tid];
        } elseif (str_starts_with($link, 'case:')) {
            if ($c['id'] === substr($link, 5)) return ['cell' => $c, 'threadId' => $tid];
        } elseif (str_starts_with($link, 'resolution:')) {
            if (($meta['appealOf'] ?? null) === substr($link, 11)) return ['cell' => $c, 'threadId' => $tid];
        }
    }
    return null;
}
// Route intake: pending thread -> accumulate; open case -> attach to case thread;
// terminal/enacted (or nothing) -> fresh thread. Returns [threadId, accumulated, attachedCaseId].
function jstfRouteIntake($link, $title, $desc, $user = null, $named = false) {
    $pend = dbGet("SELECT * FROM threads WHERE proposal_cell_id = ? AND badge = 'b-judicial' AND (jstf_cell_id IS NULL OR jstf_cell_id = '') ORDER BY id DESC", [$link]);
    if ($pend) {
        jstfAppendReply($pend['id'], $desc);
        return [$pend['id'], true, null];
    }
    $open = jstfOpenCaseForLink($link);
    if ($open && !empty($open['threadId'])) {
        jstfAppendReply($open['threadId'], $desc);
        return [$open['threadId'], true, $open['cell']['id']];
    }
    return [jstfCreateIntakeThread($link, $title, $desc, $user, $named), false, null];
}
function jstfResolveUser($name) {
    $name = trim((string)$name);
    if ($name === '') return null;
    $u = dbGet('SELECT * FROM users WHERE name = ?', [$name]);
    if ($u) return $u;
    $up = strtoupper($name);
    foreach (dbAll('SELECT * FROM users') as $cand) {
        if (strtoupper(trim((string)($cand['name'] ?? ''))) === $up) return $cand;
        if (strtoupper(trim((string)($cand['initials'] ?? ''))) === $up) return $cand;
    }
    return null;
}
// Party to a judicial thread: steward sees all; submitter sees own;
// user:/case: targets see threads about them. Everyone else: null.
function jstfThreadParty($user, $t) {
    if (!$user) return null;
    $uid = $user['id'] ?? null;
    if (!$uid) return null;
    $sub = $t['submitter_id'] ?? $t['submitterId'] ?? null;
    if (!empty($sub) && $sub === $uid) return 'submitter';
    $ppc = $t['proposal_cell_id'] ?? $t['proposalCellId'] ?? '';
    if (str_starts_with($ppc, 'user:') && substr($ppc, 5) === $uid) return 'target';
    if (str_starts_with($ppc, 'case:')) {
        $cc = dbGet('SELECT * FROM cells WHERE id = ?', [substr($ppc, 5)]);
        if ($cc) { $cm = pJson($cc['meta'] ?? '{}') ?: []; if (($cm['targetId'] ?? null) === $uid) return 'target'; }
    }
    $lj = $t['jstf_cell_id'] ?? $t['jstfCellId'] ?? null;
    if ($lj) {
        $lc = dbGet('SELECT source FROM cells WHERE id = ?', [$lj]);
        if ($lc) { $ls = pJson($lc['source'] ?? '{}') ?: []; $esc = $ls['escalatedBy'] ?? null; }
        if (!empty($esc)) { $eu = dbGet('SELECT id FROM users WHERE name = ?', [$esc]); if ($eu && $eu['id'] === $uid) return 'sponsor'; }
    }
    if (isSteward($uid)) return 'steward';
    return null;
}
function jstfCanSeeThread($user, $t) {
    if (($t['visibility'] ?? 'public') !== 'stewards-only') return true;
    if (!$user) return false;
    $lj2 = $t['jstf_cell_id'] ?? $t['jstfCellId'] ?? null;
    if ($lj2) {
        // Escalated: the case owns the thread now — seated team, the parties
        // and the sponsoring steward. Other stewards get the sealed case view.
        $party = jstfThreadParty($user, $t);
        if ($party && $party !== 'steward') return true;
        return jstfTeamMember($lj2, $user);
    }
    if (isSteward($user['id'] ?? null)) return true;
    return jstfThreadParty($user, $t) !== null;
}
// Active sanction of a kind for a user (respects until-expiry). Returns row or null.
function jstfActiveSanction($userId, $kind) {
    if (!$userId) return null;
    $today = date('Y-m-d');
    foreach (dbAll('SELECT * FROM sanctions WHERE user_id = ? AND kind = ? ORDER BY id DESC', [$userId, $kind]) as $s) {
        if (empty($s['until']) || $s['until'] > $today) return $s;
    }
    return null;
}
function jstfSanction($userId, $kind, $scope, $until, $reason, $caseId, $prior = null) {
    dbRun('INSERT INTO sanctions (user_id, kind, scope, until, prior_status, reason, case_id, created_at) VALUES (?,?,?,?,?,?,?,?)', [$userId, $kind, $scope, $until, $prior, $reason, $caseId, date('Y-m-d')]);
}
function jstfMintPolicyRef() {
    $max = 0;
    foreach (dbAll('SELECT ref FROM policies') as $pr) {
        if (preg_match('/(\d+)\s*$/', (string)($pr['ref'] ?? ''), $m)) $max = max($max, (int)$m[1]);
    }
    return 'JR-' . str_pad($max + 1, 3, '0', STR_PAD_LEFT);
}
function jstfDurationDays() {
    $ss = dbGet('SELECT jstf_duration_days FROM system_settings WHERE id = 1');
    $d = (int)($ss['jstf_duration_days'] ?? 0);
    return $d > 0 ? $d : 30;
}
function astfDurationDays() {
    $ss = dbGet('SELECT astf_duration_days FROM system_settings WHERE id = 1');
    $d = (int)($ss['astf_duration_days'] ?? 0);
    return $d > 0 ? $d : 10;
}
function jstfQuorum() {
    $ss = dbGet('SELECT jstf_adjudicators FROM system_settings WHERE id = 1');
    $q = (int)($ss['jstf_adjudicators'] ?? 0);
    return $q > 0 ? $q : 3;
}
function jstfPoolMode() {
    $ss = dbGet('SELECT jstf_pool_mode FROM system_settings WHERE id = 1');
    $m = $ss['jstf_pool_mode'] ?? '';
    return in_array($m, ['stewards', 'competence']) ? $m : 'competence';
}
function jstfPoolDomains() {
    $ss = dbGet('SELECT jstf_domains FROM system_settings WHERE id = 1');
    $raw = $ss['jstf_domains'] ?? '[]';
    $d = pJson(is_string($raw) ? $raw : json_encode($raw)) ?: [];
    return is_array($d) ? array_values(array_filter(array_map('strval', $d))) : [];
}
// Eligible adjudicator pool, ranked: stewards first, then the rest ordered
// by summed domain competence. Stewards mode = entrusted pool only.
// Competence mode = every member in good standing; stewards preferred,
// then everyone else at the top of the competence requirements.
function jstfEligiblePool($excludeIds, $domains = null, $mode = null) {
    if ($domains === null) $domains = jstfPoolDomains();
    if ($mode === null) $mode = jstfPoolMode();
    $ex = array_values(array_filter(array_map('strval', (array)$excludeIds)));
    $ph = $domains ? implode(',', array_fill(0, count($domains), '?')) : null;
    $rows = dbAll(
        "SELECT u.id AS id, u.name AS name, u.initials AS initials, " .
        ($ph ? "(SELECT COALESCE(SUM(uc.ws),0) FROM user_competence uc WHERE uc.user_id = u.id AND uc.domain IN ($ph))" : "(SELECT COALESCE(SUM(uc.ws),0) FROM user_competence uc WHERE uc.user_id = u.id)") . " AS score, " .
        "CASE WHEN EXISTS (SELECT 1 FROM circle_roster r WHERE r.member_id = u.id AND r.status = 'active') THEN 0 ELSE 1 END AS nonsteward " .
        "FROM users u WHERE (u.status IS NULL OR u.status NOT IN ('Restricted','Suspended','Former','Guest'))",
        $domains ?: []
    );
    $pool = [];
    foreach ($rows as $s) {
        if (in_array((string)$s['id'], $ex, true)) continue;
        if (empty($s['initials'])) continue;
        if ($mode === 'stewards' && (int)$s['nonsteward'] === 1) continue;
        if ($mode === 'competence' && $domains && (int)($s['score'] ?? 0) <= 0) continue;
        $pool[] = ['id' => $s['id'], 'name' => $s['name'], 'initials' => $s['initials'], 'score' => (int)($s['score'] ?? 0), 'nonsteward' => (int)$s['nonsteward']];
    }
    usort($pool, function($a, $b) {
        if ($a['nonsteward'] !== $b['nonsteward']) return $a['nonsteward'] - $b['nonsteward'];
        return $b['score'] - $a['score'];
    });
    return array_values($pool);
}
// Invitation batch: top half of the qualifying pool, randomly sampled.
function jstfInviteBatch($jId, $excludeIds, $count) {
    $invitedIds = array_map(function($r) { return (string)($r['user_id'] ?? ''); }, dbAll("SELECT user_id FROM stf_candidates WHERE stf_id = ?", ['stf-' . $jId]));
    $ranked = array_values(array_filter(jstfEligiblePool($excludeIds), function($s) use ($invitedIds) { return !in_array((string)$s['id'], $invitedIds, true); }));
    $topHalf = array_slice($ranked, 0, max(1, (int)ceil(count($ranked) / 2)));
    shuffle($topHalf);
    $batch = array_slice($topHalf, 0, max(0, (int)$count));
    $now = date('Y-m-d\TH:i:s.000\Z');
    foreach ($batch as $s) {
        if (!$s['initials']) continue;
        $cid = 'cand-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4) . '-' . strtolower(preg_replace('/[^A-Za-z0-9]/', '', $s['initials'] ?: 'x'));
        dbRun('INSERT INTO stf_candidates (id, stf_id, name, initials, status, invited_date, user_id) VALUES (?,?,?,?,?,?,?)', [$cid, 'stf-' . $jId, $s['name'], $s['initials'], 'invited', $now, $s['id']]);
    }
    return $batch;
}
// Seat accepted members; when quorum is reached the vacancy closes:
// participants/majority recompute from the real team and the deliberation
// deadline starts. Returns seated count.
function jstfSeatAccepted($cId) {
    $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) return 0;
    $meta = pJson($cell['meta'] ?? '{}') ?: [];
    if (($meta['formation']['state'] ?? '') !== 'inviting') return (int)(dbGet('SELECT COUNT(*) AS n FROM cell_team WHERE cell_id = ?', [$cId])['n'] ?? 0);
    $quorum = max(1, (int)($meta['formation']['quorum'] ?? jstfQuorum()));
    $acc = dbAll("SELECT * FROM stf_candidates WHERE stf_id = ? AND status = 'accepted' ORDER BY invited_date", ['stf-' . $cId]);
    $seated = dbAll('SELECT initials FROM cell_team WHERE cell_id = ?', [$cId]);
    $seatedIni = array_map(function($t) { return $t['initials']; }, $seated);
    foreach ($acc as $a) {
        if (count($seatedIni) >= $quorum) break;
        if (in_array($a['initials'], $seatedIni)) continue;
        dbRun('INSERT INTO cell_team (cell_id, name, initials, role, focus, user_id) VALUES (?,?,?,?,?,?)', [$cId, $a['name'], $a['initials'], 'jSTF adjudicator', 'Judicial review', $a['user_id'] ?? null]);
        $seatedIni[] = $a['initials'];
    }
    $n = count($seatedIni);
    if ($n >= $quorum) {
        $maj = (int)floor($n / 2) + 1;
        $meta['formation']['state'] = 'seated';
        $meta['formation']['seated'] = $n;
        dbRun("UPDATE stf_candidates SET status = 'expired' WHERE stf_id = ? AND status = 'invited'", ['stf-' . $cId]);
        $meta['restriction'] = $meta['restriction'] ?? [];
        $meta['restriction']['teamSize'] = $n; $meta['restriction']['majority'] = $maj;
        $teamRows = dbAll('SELECT * FROM cell_team WHERE cell_id = ?', [$cId]);
        $uidByIni = []; foreach ($acc as $a) { $uidByIni[$a['initials']] = $a['user_id'] ?? null; }
        $js = pJson($cell['source'] ?? '{}') ?: [];
        $js['team'] = array_map(function($t) use ($uidByIni) { return ['id' => $uidByIni[$t['initials']] ?? null, 'name' => $t['name'], 'initials' => $t['initials']]; }, $teamRows);
        $newDl = date('Y-m-d', time() + jstfDurationDays() * 86400);
        dbRun('UPDATE cells SET participants = ?, source = ?, meta = ?, deadline = ? WHERE id = ?', [$n, json_encode($js), json_encode($meta), $newDl, $cId]);
        dbRun("UPDATE stfs SET status = 'Under Investigation', bucket = 'active', deadline = ? WHERE id = ?", [$newDl, 'stf-' . $cId]);
        dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'jstf-seated', '', date('Y-m-d'), 'jSTF team seated on ' . $cId . ' — ' . $n . ' adjudicators, deadline ' . $newDl, 'system']);
    } else {
        dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    }
    return $n;
}
// Reader check for a blind vSTF verification: the candidate and the members
// who filed assessments. Anyone else gets the sealed view.
function vstfReader($vstfId, $user) {
    if (!$user) return false;
    $uid = $user['id'] ?? null; if (!$uid) return false;
    $vc = dbGet('SELECT source, meta FROM cells WHERE id = ?', [$vstfId]);
    if (!$vc) return false;
    $vs = pJson($vc['source'] ?? '{}') ?: []; $vm = pJson($vc['meta'] ?? '{}') ?: [];
    $cand = vstfResolveCandidate($vs['candidateName'] ?? $vm['candidateName'] ?? '', $vs['candidateInitials'] ?? $vm['candidateInitials'] ?? '');
    if ($cand && ($cand['id'] ?? null) === $uid) return true;
    foreach (($vm['assessments'] ?? []) as $a) {
        if (!empty($a['assessorId']) && $a['assessorId'] === $uid) return true;
        if (empty($a['assessorId']) && ($a['assessor'] ?? '') === ($user['name'] ?? $user['initials'])) return true;
    }
    return false;
}
// Reader check for a blind xSTF probe: the probe team or the commissioning
// jSTF team. Anyone else sees nothing while the probe is blind.
function jstfProbeReader($probeId, $user) {
    if (!$user) return false;
    if (jstfTeamMember($probeId, $user)) return true;
    $pc = dbGet('SELECT commissioned_by, source FROM cells WHERE id = ?', [$probeId]);
    if (!$pc) return false;
    $ps = pJson($pc['source'] ?? '{}') ?: [];
    foreach (array_filter([$pc['commissioned_by'] ?? null, $ps['jstfId'] ?? null]) as $jid) {
        if (jstfTeamMember($jid, $user)) return true;
    }
    return false;
}
// user_id for all seated teams; the fallback covers stale/placeholder rows.
// A row whose user_id is set to someone else never matches on initials alone.
function jstfTeamMember($cId, $user) {
    if (!$user) return false;
    $uid = $user['id'] ?? null; $ini = $user['initials'] ?? null;
    if ($uid && dbGet('SELECT 1 FROM cell_team WHERE cell_id = ? AND user_id = ?', [$cId, $uid])) return true;
    if ($ini && dbGet('SELECT 1 FROM cell_team WHERE cell_id = ? AND initials = ? AND (user_id IS NULL OR user_id = ?)', [$cId, $ini, $uid])) return true;
    return false;
}
// One vote per user per domain: delete the voter's prior row (user_id first,
// legacy initials row for stale data) then insert stamped with user_id.
function jstfCastVote($cId, $domain, $user, $vote) {
    $uid = $user['id'] ?? null; $ini = $user['initials'] ?? null;
    dbRun("DELETE FROM vote_records WHERE cell_id = ? AND domain = ? AND (user_id = ? OR (user_id IS NULL AND initials = ?))", [$cId, $domain, $uid, $ini]);
    dbRun("INSERT INTO vote_records (cell_id, domain, name, initials, vote, user_id) VALUES (?,?,?,?,?,?)", [$cId, $domain, $user['name'] ?? $ini, $ini, $vote, $uid]);
}
// Refresh a jSTF composition: seat a fresh team (excluding the previous
// members where the steward pool allows), clear the verdict, reset the
// deliberation deadline to a full allowance, drop departed members' votes
// from both domains, and recompute the restriction tally. Unlimited:
// a team that cannot reach a verdict is replaced until one does.
function jstfRefreshComposition($cId, $actorName, $reason) {
    $jstf = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$jstf || $jstf['type'] !== 'jSTF Cell') return false;
    if (($jstf['status'] ?? '') !== 'Under Investigation') return false;
    $jm = pJson($jstf['meta'] ?? '{}') ?: [];
    $js = pJson($jstf['source'] ?? '{}') ?: [];
    $prevTeam = $js['team'] ?? []; $prevIds = array_map(function($t) { return $t['id']; }, $prevTeam);
    $neverSeat = $prevIds;
    if (!empty($jm['targetId'])) $neverSeat[] = $jm['targetId'];
    if (!empty($jm['threadId'])) { $pth = dbGet('SELECT submitter_id FROM threads WHERE id = ?', [$jm['threadId']]); if ($pth && !empty($pth['submitter_id'])) $neverSeat[] = $pth['submitter_id']; }
    $stewards = dbAll("SELECT DISTINCT r.member_id AS id, r.name, r.initials FROM circle_roster r JOIN users u ON u.id = r.member_id WHERE r.status = 'active' ORDER BY r.name LIMIT 3");
    $fresh = array_values(array_filter($stewards, function($s) use ($neverSeat) { return !in_array($s['id'], $neverSeat); }));
    if (count($fresh) < 2) $fresh = array_merge(array_slice($stewards, 1), array_slice($stewards, 0, 1));
    $team = $fresh;
    $js['team'] = array_map(function($t) { return ['id' => $t['id'], 'name' => $t['name'], 'initials' => $t['initials']]; }, $team);
    $revisions = $jm['revisions'] ?? []; $revisions[] = ['at' => date('Y-m-d\TH:i:s.000\Z'), 'by' => $actorName, 'notes' => $reason, 'supersededVerdict' => $jm['verdict'] ?? null];
    $jm['revisions'] = $revisions;
    $jm['verdict'] = null;
    dbRun('DELETE FROM cell_team WHERE cell_id = ?', [$cId]);
    foreach ($team as $t) dbRun('INSERT INTO cell_team (cell_id, name, initials, role, focus, user_id) VALUES (?,?,?,?,?,?)', [$cId, $t['name'], $t['initials'], 'jSTF adjudicator', 'Judicial review', $t['id'] ?? null]);
    $ts2 = count($team); $maj = max(2, (int)floor($ts2 / 2) + 1);
    $ti = array_map(function($t) { return $t['initials']; }, $team);
    if ($ti) { $ph = implode(',', array_fill(0, count($ti), '?')); dbRun("DELETE FROM vote_records WHERE cell_id = ? AND domain IN ('restriction','resolution') AND initials NOT IN ($ph)", array_merge([$cId], $ti)); }
    $rc = (int)(dbGet("SELECT COUNT(*) AS n FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND vote = 'restrict'", [$cId])['n'] ?? 0);
    $cur = $jm['restriction'] ?? ['state' => 'relaxed', 'restrictCount' => 0, 'teamSize' => $ts2, 'majority' => $maj, 'severity' => null, 'history' => []];
    $prevState = $cur['state'] ?? 'relaxed';
    $cur['restrictCount'] = $rc; $cur['teamSize'] = $ts2; $cur['majority'] = $maj;
    $cur['state'] = $rc >= $maj ? 'restricted' : 'relaxed';
    $cur['severity'] = $cur['state'] === 'restricted' ? ((!empty($jm['targetIsSteward']) && $rc < $ts2) ? 'frozen' : 'readonly') : null;
    $cur['history'] = $cur['history'] ?? []; $cur['history'][] = ['prev' => $prevState, 'next' => $cur['state'], 'at' => date('Y-m-d\TH:i:s.000\Z'), 'by' => $actorName];
    $jm['restriction'] = $cur;
    $newDl = date('Y-m-d', time() + jstfDurationDays() * 86400);
    dbRun('UPDATE cells SET participants = ?, source = ?, meta = ?, deadline = ? WHERE id = ?', [$ts2, json_encode($js), json_encode($jm), $newDl, $cId]);
    dbRun("UPDATE stfs SET status = 'Under Investigation', bucket = 'active', deadline = ? WHERE id = ?", [$newDl, 'stf-' . $cId]);
    syncTargetRestriction($jm['targetId'] ?? null, $cur['state'] === 'restricted', $cur['severity'], $cId);
    dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'jstf-refresh', '', date('Y-m-d'), 'jSTF composition refreshed (' . $reason . ') on ' . $cId . ' — ' . count($team) . ' jSTF adjudicators, deadline ' . $newDl, (string)$actorName]);
    return true;
}
// Lazy deadline enforcement (no cron): refresh an expired open case before
// processing a team write. Silent by design — the refresh is recorded in
// governance events and the write then proceeds under the new composition.
function jstfEnsureFresh($cId) {
    $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell || $cell['type'] !== 'jSTF Cell') return;
    if (($cell['status'] ?? '') !== 'Under Investigation') return;
    $jm = pJson($cell['meta'] ?? '{}') ?: [];
    if (($jm['formation']['state'] ?? '') === 'inviting') return;
    $dl = $cell['deadline'] ?? null;
    if (!$dl || $dl >= date('Y-m-d')) return;
    jstfRefreshComposition($cId, 'system', 'deadline');
}
function jstfFilterRemovalCircles($circles, $targetId) {
    if (!$targetId || !$circles) return $targetId ? $circles : [];
    $tgtRows = dbAll("SELECT c.name FROM circle_roster r JOIN circles c ON c.id = r.circle_id WHERE r.member_id = ? AND r.status = 'active'", [$targetId]);
    $allowed = array_map(function($r) { return strtolower($r['name']); }, $tgtRows);
    return array_values(array_filter($circles, function($cn) use ($allowed) { return in_array(strtolower($cn), $allowed); }));
}
function jstfExecuteSystemAction($caseId, $targetId, $targetName, $act, &$notes) {
    $kind = $act['kind'] ?? '';
    if ($kind === 'remove_from_circle') {
        foreach (($act['circles'] ?? []) as $cname) {
            $circle = dbGet('SELECT * FROM circles WHERE LOWER(name) = LOWER(?)', [$cname]);
            if (!$circle) $circle = dbGet('SELECT * FROM circles WHERE id = ?', [$cname]);
            if (!$circle) { $notes[] = 'circle not found: ' . $cname; continue; }
            $row = $targetId ? dbGet("SELECT * FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$circle['id'], $targetId]) : null;
            if (!$row && $targetName) $row = dbGet("SELECT * FROM circle_roster WHERE circle_id = ? AND name = ? AND status = 'active'", [$circle['id'], $targetName]);
            if (!$row) { $notes[] = 'not an active member of ' . $circle['name']; continue; }
            markFormer($row['id'], 'jstf-removal');
            $notes[] = 'removed from ' . $circle['name'];
            // The removal is the whole of jSTF's act. Succession is a
            // condition, not a commission: the vacancy is recorded and the
            // integrity engine vets and seats successors on its own poll.
            $cm = pJson($circle['meta'] ?? '{}') ?: [];
            $vac = $cm['vacancies'] ?? [];
            $vac[] = ['caseId' => $caseId, 'since' => date('Y-m-d'), 'reason' => 'jstf-removal'];
            $cm['vacancies'] = $vac;
            dbRun('UPDATE circles SET meta = ? WHERE id = ?', [json_encode($cm), $circle['id']]);
            $notes[] = 'vacancy recorded in ' . $circle['name'] . ' — succession runs through the integrity engine';
        }
    } elseif (in_array($kind, ['freeze_ws_until', 'candidacy_freeze_until'])) {
        if (!$targetId) { $notes[] = ($kind === 'freeze_ws_until' ? 'Ws freeze' : 'Candidacy freeze') . ' skipped (no member target)'; }
        else {
            $sk = $kind === 'freeze_ws_until' ? 'ws_freeze' : 'candidacy_freeze';
            jstfSanction($targetId, $sk, null, $act['until'] ?? null, 'jSTF resolution', $caseId);
            $notes[] = ($kind === 'freeze_ws_until' ? 'Ws frozen' : 'Steward candidacy frozen') . (!empty($act['until']) ? ' until ' . $act['until'] : ' indefinitely');
        }
    } elseif ($kind === 'reverify_competences') {
        // The verdict sets the condition and walks away: every competence
        // claim of the target goes unverified. The integrity engine's poll
        // will notice and commission the reverification on its own.
        if (!$targetId) { $notes[] = 'competence reverification skipped (no member target)'; }
        else {
            dbRun('UPDATE user_competence SET verified = 0 WHERE user_id = ?', [$targetId]);
            $notes[] = 'all competence claims flagged unverified — reverification runs through the integrity engine';
        }
    } elseif ($kind === 'guest_until') {
        if (!$targetId) { $notes[] = 'Guest level skipped (no member target)'; }
        else {
            $until = $act['until'] ?? null;
            if ($until && $until <= date('Y-m-d')) { $notes[] = 'Guest level already expired, not applied'; }
            else {
                $cur = dbGet('SELECT status FROM users WHERE id = ?', [$targetId]);
                $prior = $cur['status'] ?? 'Active';
                dbRun("UPDATE users SET status = 'Guest' WHERE id = ?", [$targetId]);
                jstfSanction($targetId, 'guest', null, $until, 'jSTF resolution', $caseId, $prior);
                $notes[] = 'guest privilege level' . ($until ? ' until ' . $until : ' indefinitely') . ' (appeals still allowed)';
            }
        }
    }
}
// Restore Guest users whose guest sanction expired. Called on auth.
function maybeLiftSanctions($userId) {
    if (!$userId) return;
    $today = date('Y-m-d');
    foreach (dbAll("SELECT * FROM sanctions WHERE user_id = ? AND kind = 'guest' AND until IS NOT NULL AND until <= ?", [$userId, $today]) as $s) {
        if (jstfActiveSanction($userId, 'guest')) continue;
        $prior = $s['prior_status'] ?: 'Active';
        dbRun("UPDATE users SET status = ? WHERE id = ? AND status = 'Guest'", [$prior, $userId]);
    }
}
if (preg_match('/^\/jstf\/report$/', $cleanPath)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $body = readBody(); $tid = trim((string)($body->targetId ?? '')); $desc = trim((string)($body->description ?? ''));
    if (!$tid) send(400, ['error' => 'targetId required']); if (!$desc) send(400, ['error' => 'description required']);
    $target = dbGet('SELECT * FROM users WHERE id = ?', [$tid]); if (!$target) send(404, ['error' => 'Target member not found']);
    if ($tid === $user['id']) send(400, ['error' => 'Cannot report yourself']);
    $link = 'user:' . $tid;
    list($thrId, $accumulated, $attached) = jstfRouteIntake($link, 'Anonymous Report — ' . ($target['name'] ?? $target['initials']), $desc, $user, false);
    $rr = dbGet('SELECT replies FROM threads WHERE id = ?', [$thrId]);
    send($accumulated ? 200 : 201, ['ok' => true, 'threadId' => $thrId, 'replies' => (int)($rr['replies'] ?? 0), 'accumulated' => $accumulated, 'attachedCase' => $attached]);
}
if (preg_match('/^\/jstf\/appeal$/', $cleanPath)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $body = readBody(); $cid = trim((string)($body->caseId ?? '')); $desc = trim((string)($body->description ?? ''));
    $rRef = trim((string)($body->resolutionRef ?? '')); $rTitle = trim((string)($body->resolutionTitle ?? ''));
    if (!$desc) send(400, ['error' => 'description required']);
    if ($rRef) {
        if (!$rTitle) { $rTitle = $rRef; }
        $link = 'resolution:' . $rRef;
        list($thrId, $accumulated, $attached) = jstfRouteIntake($link, 'Appeal — ' . $rTitle, $desc, $user, true);
        $rr = dbGet('SELECT replies FROM threads WHERE id = ?', [$thrId]);
        send($accumulated ? 200 : 201, ['ok' => true, 'threadId' => $thrId, 'replies' => (int)($rr['replies'] ?? 0), 'accumulated' => $accumulated, 'attachedCase' => $attached]);
    }
    if (!$cid) send(400, ['error' => 'caseId or resolutionRef required']);
    $cc = dbGet('SELECT * FROM cells WHERE id = ?', [$cid]); if (!$cc || $cc['type'] !== 'jSTF Cell') send(404, ['error' => 'Case not found']);
    $link = 'case:' . $cid;
    list($thrId, $accumulated, $attached) = jstfRouteIntake($link, 'Appeal — ' . ($cc['title'] ?? $cid), $desc, $user, true);
    $rr = dbGet('SELECT replies FROM threads WHERE id = ?', [$thrId]);
    send($accumulated ? 200 : 201, ['ok' => true, 'threadId' => $thrId, 'replies' => (int)($rr['replies'] ?? 0), 'accumulated' => $accumulated, 'attachedCase' => $attached]);
}
if (preg_match('/^\/jstf\/escalate$/', $cleanPath)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $thrId = trim((string)($body->threadId ?? '')); if (!$thrId) send(400, ['error' => 'threadId required']);
    $thread = dbGet('SELECT * FROM threads WHERE id = ?', [$thrId]); if (!$thread) send(404, ['error' => 'Thread not found']);
    if ($thread['jstf_cell_id']) send(409, ['error' => 'Thread already escalated']);
    $ppc = $thread['proposal_cell_id'] ?? '';
    if (!$ppc || (!str_starts_with($ppc, 'user:') && !str_starts_with($ppc, 'case:') && !str_starts_with($ppc, 'resolution:'))) send(400, ['error' => 'Thread is not a judicial thread']);
    $isAppeal = str_starts_with($ppc, 'case:') || str_starts_with($ppc, 'resolution:'); $link2 = $ppc; $targetId = null;
    $targetName = preg_replace('/^(?:Anonymous Report|Appeal) — /', '', $thread['title']);
    $revisionOf = null; $appealOf = null;
    if (str_starts_with($ppc, 'resolution:')) {
        $appealOf = substr($link2, 11);
    } elseif ($isAppeal) {
        $oid = substr($link2, 5); $orig = dbGet('SELECT * FROM cells WHERE id = ?', [$oid]);
        if (!$orig) send(404, ['error' => 'Original case not found']);
        $om = pJson($orig['meta'] ?? '{}') ?: []; $targetId = $om['targetId'] ?? null; $targetName = $om['targetName'] ?? $orig['title'] ?? $targetName;
        $revisionOf = substr($link2, 5);
    } else { $targetId = substr($link2, 5); $tgt = dbGet('SELECT * FROM users WHERE id = ?', [$targetId]); if ($tgt) $targetName = $tgt['name'] ?? $tgt['initials']; }
    if ($targetId && !$isAppeal) {
        $openDup = dbAll("SELECT id, meta FROM cells WHERE type = 'jSTF Cell' AND status = 'Under Investigation'");
        foreach ($openDup as $od) { $omd = pJson($od['meta'] ?? '{}') ?: []; if (($omd['targetId'] ?? null) === $targetId && empty($omd['isAppeal'])) send(409, ['error' => 'An open case against this member already exists', 'caseId' => $od['id']]); }
    }
    $jId = 'jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $tIs = $targetId ? !!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$targetId]) : false;
    $quorum = jstfQuorum();
    $poolMode = jstfPoolMode();
    $poolDomains = jstfPoolDomains();
    $petitioner = $thread['submitter_id'] ?? null;
    $exclude = array_values(array_filter([$targetId, $petitioner]));
    $src = ['type' => 'judicial-investigation', 'threadId' => $thrId, 'isAppeal' => $isAppeal, 'targetId' => $targetId, 'targetName' => $targetName, 'escalatedBy' => $user['name'] ?? $user['initials'], 'escalatedAt' => date('Y-m-d\TH:i:s.000\Z'), 'revisionOf' => $revisionOf, 'appealOf' => $appealOf, 'team' => []];
    $meta = ['targetId' => $targetId, 'targetName' => $targetName, 'threadId' => $thrId, 'isAppeal' => $isAppeal, 'targetIsSteward' => $tIs, 'revisionOf' => $src['revisionOf'], 'appealOf' => $src['appealOf'], 'threadRepliesAtEscalation' => (int)($thread['replies'] ?? 1), 'restriction' => ['state' => 'relaxed', 'restrictCount' => 0, 'teamSize' => 0, 'majority' => max(2, (int)floor($quorum / 2) + 1), 'severity' => null, 'history' => []], 'verdict' => null, 'formation' => ['state' => 'inviting', 'quorum' => $quorum, 'poolMode' => $poolMode, 'domains' => $poolDomains, 'seated' => 0]];
    $caseDl = date('Y-m-d', time() + jstfDurationDays() * 86400);
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, blind, source, resolution, meta, deadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [$jId, 'jSTF Cell', 'jSTF — ' . $targetName, 'Under Investigation', 'judicial-investigation', 0, '', $user['id'], 1, json_encode($src), json_encode(['status' => 'Under Investigation']), json_encode($meta), $caseDl]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $jId, 'jSTF', 'Judicial Investigation', $targetName ?: '', 'active', 'Under Investigation', 'jSTF — ' . $targetName, $caseDl]);
    dbRun('UPDATE threads SET jstf_cell_id = ? WHERE id = ?', [$jId, $thrId]);
    $invited = jstfInviteBatch($jId, $exclude, $quorum + 2);
    $invNames = implode(', ', array_map(function($s) { return $s['name']; }, $invited));
    dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'jstf-escalation', '', date('Y-m-d'), 'jSTF opened (' . ($isAppeal ? 'appeal' : 'report') . ') — vacancy open, ' . count($invited) . ' invited, quorum ' . $quorum . ' [' . $jId . ']', (string)($user['name'] ?? $user['initials'])]);
    send(201, ['ok' => true, 'jstfId' => $jId]);
}
// ---- jSTF vacancy: invited member accepts or declines ----
if (preg_match('/^\/cells\/([^\/]+)\/jstf-membership$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if (($cell['status'] ?? '') !== 'Under Investigation') send(400, ['error' => 'Case is closed']);
    $meta = pJson($cell['meta'] ?? '{}') ?: [];
    if (($meta['formation']['state'] ?? '') !== 'inviting') send(409, ['error' => 'Team already seated']);
    $body = readBody(); $decision = trim((string)($body->decision ?? ''));
    if (!in_array($decision, ['accept', 'decline'])) send(400, ['error' => 'decision must be accept or decline']);
    $cand = dbGet("SELECT * FROM stf_candidates WHERE stf_id = ? AND user_id = ? AND status = 'invited'", ['stf-' . $cId, $user['id']]);
    if (!$cand) $cand = dbGet("SELECT * FROM stf_candidates WHERE stf_id = ? AND initials = ? AND status = 'invited'", ['stf-' . $cId, $user['initials']]);
    if (!$cand) send(404, ['error' => 'No pending invitation for you on this case']);
    dbRun('UPDATE stf_candidates SET status = ? WHERE id = ?', [$decision === 'accept' ? 'accepted' : 'declined', $cand['id']]);
    $seated = 0;
    if ($decision === 'accept') $seated = jstfSeatAccepted($cId);
    else {
        $cell2 = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
        $meta2 = pJson($cell2['meta'] ?? '{}') ?: [];
        $quorum = max(1, (int)($meta2['formation']['quorum'] ?? jstfQuorum()));
        $seated = (int)(dbGet('SELECT COUNT(*) AS n FROM cell_team WHERE cell_id = ?', [$cId])['n'] ?? 0);
        $pending = (int)(dbGet("SELECT COUNT(*) AS n FROM stf_candidates WHERE stf_id = ? AND status = 'invited'", ['stf-' . $cId])['n'] ?? 0);
        if ($pending < 2 && ($meta2['formation']['state'] ?? '') === 'inviting') {
            $tgt = $meta2['targetId'] ?? null;
            $sub = dbGet('SELECT submitter_id FROM threads WHERE id = ?', [$meta2['threadId'] ?? null]);
            jstfInviteBatch($cId, array_values(array_filter([$tgt, $sub['submitter_id'] ?? null])), 2 - $pending);
        }
    }
    $cell3 = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    $meta3 = pJson($cell3['meta'] ?? '{}') ?: [];
    send(200, ['ok' => true, 'decision' => $decision, 'seated' => $seated, 'quorum' => $meta3['formation']['quorum'] ?? jstfQuorum(), 'state' => $meta3['formation']['state'] ?? 'inviting']);
}
if (preg_match('/^\/cells\/([^\/]+)\/jstf-vote$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    jstfEnsureFresh($cId); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if ($cell['status'] !== 'Under Investigation') send(400, ['error' => 'Not under investigation']);
    if (!jstfTeamMember($cId, $user)) send(403, ['error' => 'Only the jSTF team may vote']);
    $metaVote = pJson($cell['meta'] ?? '{}') ?: [];
    if (($metaVote['formation']['state'] ?? '') === 'inviting') send(403, ['error' => 'Team still forming — votes open once quorum is seated']);
    $body = readBody(); $stance = trim((string)($body->stance ?? ''));
    if (!in_array($stance, ['restrict', 'lift'])) send(400, ['error' => 'stance must be restrict or lift']);
    $ts = (int)(dbGet('SELECT COUNT(*) AS n FROM cell_team WHERE cell_id = ?', [$cId])['n'] ?? 0);
    $maj = max(2, (int)floor($ts / 2) + 1);
    jstfCastVote($cId, 'restriction', $user, $stance);
    $rc = (int)(dbGet("SELECT COUNT(*) AS n FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND vote = 'restrict'", [$cId])['n'] ?? 0);
    $restricted = $rc >= $maj;
    $meta = pJson($cell['meta'] ?? '{}') ?: [];
    $cur = $meta['restriction'] ?? ['state' => 'relaxed', 'restrictCount' => 0, 'teamSize' => $ts, 'majority' => $maj, 'severity' => null, 'history' => []];
    $sev = $restricted ? ((!empty($meta['targetIsSteward']) && $rc < $ts) ? 'frozen' : 'readonly') : null;
    $newState = $restricted ? 'restricted' : 'relaxed'; $changed = ($cur['state'] !== $newState);
    $votes = dbAll("SELECT name, initials, vote FROM vote_records WHERE cell_id = ? AND domain = 'restriction'", [$cId]);
    if ($changed) { $cur['history'] = $cur['history'] ?? []; $cur['history'][] = ['prev' => $cur['state'], 'next' => $newState, 'at' => date('Y-m-d\TH:i:s.000\Z'), 'votedBy' => $user['name'] ?? $user['initials']]; }
    $cur['state'] = $newState; $cur['restrictCount'] = $rc; $cur['teamSize'] = $ts; $cur['majority'] = $maj;
    if ($sev) $cur['severity'] = $sev; else $cur['severity'] = null; $cur['votes'] = $votes; $meta['restriction'] = $cur;
    if ($changed) dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'jstf-restriction', '', date('Y-m-d'), $cId . ' activity ' . $cur['state'] . ' (' . $rc . '/' . $ts . ')', (string)($user['name'] ?? $user['initials'])]);
    syncTargetRestriction($meta['targetId'] ?? null, $restricted, $sev, $cId);
    dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(200, ['ok' => true, 'state' => $cur['state'], 'restrictCount' => $rc, 'teamSize' => $ts, 'majority' => $maj, 'severity' => $cur['severity'], 'changed' => $changed]);
}
if (preg_match('/^\/cells\/([^\/]+)\/jstf-verdict$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    jstfEnsureFresh($cId); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if (!jstfTeamMember($cId, $user)) send(403, ['error' => 'Only a seated adjudicator may file the verdict']);
    $meta = pJson($cell['meta'] ?? '{}') ?: []; if ($meta['verdict']) send(409, ['error' => 'Verdict already filed']);
    if ($cell['status'] !== 'Under Investigation') send(400, ['error' => 'Not under investigation']);
    $body = readBody(); $desc = trim((string)($body->description ?? ''));
    $pRefs = is_array($body->policyRefs ?? null) ? $body->policyRefs : []; $findings = trim((string)($body->findings ?? ''));
    $execs = array_values(array_filter(array_map('strval', is_array($body->executingCircles ?? null) ? $body->executingCircles : [])));
    $sysActs = []; $dropWarn = [];
    foreach (is_array($body->systemActions ?? null) ? $body->systemActions : [] as $a) {
        $a = (array)$a; $kind = trim((string)($a['kind'] ?? ''));
        if (!in_array($kind, ['remove_from_circle', 'freeze_ws_until', 'candidacy_freeze_until', 'guest_until', 'reverify_competences'])) continue;
        $act = ['kind' => $kind];
        if ($kind === 'remove_from_circle') {
            $circles = array_values(array_filter(array_map('strval', is_array($a['circles'] ?? null) ? $a['circles'] : [])));
            $kept = jstfFilterRemovalCircles($circles, $meta['targetId'] ?? null);
            $dropped = array_values(array_diff(array_map('strtolower', $circles), array_map('strtolower', $kept)));
            if ($dropped) $dropWarn[] = 'target is not an active member of: ' . implode(', ', $dropped) . ' — dropped from the sanction';
            if (!$kept) continue;
            $act['circles'] = $kept;
        } else {
            $until = trim((string)($a['until'] ?? ''));
            if ($until !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $until)) continue;
            $act['until'] = $until !== '' ? $until : null;
        }
        $sysActs[] = $act;
    }
    $appealDir = trim((string)($body->appealDirection ?? ''));
    $isAppealCase = !empty($meta['isAppeal']) || !empty($meta['appealOf']);
    if ($isAppealCase && !in_array($appealDir, ['uphold', 'overturn'])) send(400, ['error' => 'appealDirection must be uphold or overturn']);
    if (!$desc) send(400, ['error' => 'description required']);
    $hasPolicy = !empty($pRefs);
    $hasSystem = !empty($sysActs);
    if ($pRefs) {
        $polMap = []; foreach (dbAll('SELECT ref, status FROM policies') as $pr) $polMap[strtolower($pr['ref'])] = $pr['status'];
        $badRefs = [];
        foreach ($pRefs as $prf) { $pk = strtolower(strval($prf)); if (!isset($polMap[$pk])) $badRefs[] = strval($prf) . ' (unknown)'; elseif (!in_array($polMap[$pk], ['Enacted', 'Passed'])) $badRefs[] = strval($prf) . ' (' . $polMap[$pk] . ')'; }
        if ($badRefs) send(400, ['error' => 'Policy references must cite enacted resolutions: ' . implode(', ', $badRefs)]);
    }
    // Verdict kinds: combined, system-bound, policy-cited — or exonerating
    // when the team agrees the claims are insignificant (no directive,
    // no actions, no executing circles).
    $type = (!$hasPolicy && !$hasSystem) ? 'exonerating' : ($hasPolicy && $hasSystem ? 'combined' : ($hasSystem ? 'system-bound' : 'policy-cited'));
    if ($type === 'exonerating' && $execs) send(400, ['error' => 'Exonerating verdicts carry no executing circles — cite an enacted policy or drop the circles']);
    $vts = (int)(dbGet('SELECT COUNT(*) AS n FROM cell_team WHERE cell_id = ?', [$cId])['n'] ?? 0);
    $vmaj = (int)floor($vts / 2) + 1;
    $ven = (int)(dbGet("SELECT COUNT(*) AS n FROM vote_records WHERE cell_id = ? AND domain = 'resolution' AND vote = 'endorse'", [$cId])['n'] ?? 0);
    if ($ven < $vmaj) send(403, ['error' => 'Resolution needs team endorsement (' . $ven . '/' . $vmaj . ') before filing']);
    $meta['verdict'] = ['type' => $type, 'description' => $desc, 'policyRefs' => array_map('strval', $pRefs), 'findings' => $findings, 'executingCircles' => $execs, 'systemActions' => $sysActs, 'warnings' => $dropWarn, 'appealDirection' => $appealDir ?: null, 'filedBy' => $user['name'] ?? $user['initials'], 'filedAt' => date('Y-m-d\TH:i:s.000\Z')];
    $src = pJson($cell['source'] ?? '{}') ?: []; $src['verdict'] = $meta['verdict'];
    dbRun("UPDATE cells SET status = 'Finalised', meta = ?, source = ? WHERE id = ?", [json_encode($meta), json_encode($src), $cId]);
    $aId = 'astf-audit-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    $aSrc = ['type' => 'judicial-audit', 'sourceCellId' => $cId, 'sourceTitle' => 'jSTF Disciplinary Verdict', 'targetId' => $meta['targetId'], 'targetName' => $meta['targetName'], 'verdict' => ['type' => $type, 'description' => $desc, 'policyRefs' => $meta['verdict']['policyRefs'], 'findings' => $findings, 'executingCircles' => $execs, 'systemActions' => $sysActs, 'appealDirection' => $appealDir ?: null]];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, blind, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [$aId, 'aSTF Cell', 'aSTF Audit — ' . ($meta['targetName'] ?? ''), 'Blind Review', 'judicial-audit', 1, '', $cId, 1, json_encode($aSrc), json_encode(['status' => 'Pending']), json_encode(['blind' => 1, 'targetName' => $meta['targetName'], 'verdict' => $meta['verdict']])]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $aId, 'aSTF', 'Judicial Audit', $meta['targetName'] ?? '', 'active', 'Blind Review', 'aSTF Audit — ' . ($meta['targetName'] ?? ''), date('Y-m-d', time() + astfDurationDays() * 86400)]);
    dbRun('UPDATE cells SET resolution_ref = ? WHERE id = ?', [$aId, $cId]);
    dbRun("UPDATE stfs SET status = 'Finalised', bucket = 'completed' WHERE id = ?", ['stf-' . $cId]);
    dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4), 'jstf-verdict', '', date('Y-m-d'), 'jSTF verdict filed on ' . $cId . ' — ' . $type . ' (' . count($pRefs) . ' policies cited)', (string)($user['name'] ?? $user['initials'])]);
    send(200, ['ok' => true, 'jstfId' => $cId, 'astfId' => $aId, 'type' => $type, 'warnings' => $dropWarn]);
}

// ---- jSTF investigation: questions (team-managed) ----
if (preg_match('/^\/cells\/([^\/]+)\/questions$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    jstfEnsureFresh($cId); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if (($cell['status'] ?? '') !== 'Under Investigation') send(400, ['error' => 'Case is closed']);
    if (!jstfTeamMember($cId, $user)) send(403, ['error' => 'Only the jSTF team may manage questions']);
    $body = readBody(); $label = trim((string)($body->label ?? ''));
    if (!$label) send(400, ['error' => 'label required']);
    $assessors = isset($body->assessors) ? max(1, (int)$body->assessors) : 1;
    $due = trim((string)($body->deadline ?? ''));
    if ($due !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $due)) send(400, ['error' => 'deadline must be YYYY-MM-DD']);
    if ($due === '') $due = $cell['deadline'] ?? date('Y-m-d', time() + 30 * 86400);
    $objId = 'q-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    dbRun('INSERT INTO cell_objectives (cell_id, obj_id, label, status, assessors, deadline) VALUES (?,?,?,?,?,?)', [$cId, $objId, $label, 'open', $assessors, $due]);
    send(201, ['ok' => true, 'objId' => $objId]);
}
if (preg_match('/^\/cells\/([^\/]+)\/questions\/([^\/]+)$/', $cleanPath, $m)) {
    if ($method !== 'PATCH' && $method !== 'PUT' && $method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); $qId = urldecode($m[2]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    jstfEnsureFresh($cId); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if (($cell['status'] ?? '') !== 'Under Investigation') send(400, ['error' => 'Case is closed']);
    if (!dbGet('SELECT 1 FROM cell_team WHERE cell_id = ? AND initials = ?', [$cId, $user['initials']])) send(403, ['error' => 'Only the jSTF team may manage questions']);
    $body = readBody(); $status = trim((string)($body->status ?? ''));
    if ($status !== '' && !in_array($status, ['open', 'met', 'at-risk'])) send(400, ['error' => 'status must be open, met or at-risk']);
    $sets = []; $args = [];
    if ($status !== '') { $sets[] = 'status = ?'; $args[] = $status; }
    if (isset($body->assessors)) { $sets[] = 'assessors = ?'; $args[] = max(1, (int)$body->assessors); }
    if (isset($body->deadline)) { $dd = trim((string)$body->deadline); if ($dd !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dd)) send(400, ['error' => 'deadline must be YYYY-MM-DD']); $sets[] = 'deadline = ?'; $args[] = $dd !== '' ? $dd : null; }
    if (!$sets) send(400, ['error' => 'nothing to update']);
    $args[] = $cId; $args[] = $qId;
    dbRun('UPDATE cell_objectives SET ' . implode(', ', $sets) . ' WHERE cell_id = ? AND obj_id = ?', $args);
    send(200, ['ok' => true, 'objId' => $qId, 'status' => $status]);
}

// ---- jSTF investigation: commission an xSTF probe ----
if (preg_match('/^\/cells\/([^\/]+)\/commission-xstf$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    jstfEnsureFresh($cId); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if ($cell['status'] !== 'Under Investigation') send(400, ['error' => 'Case is not under investigation']);
    if (!jstfTeamMember($cId, $user)) {
        $sc = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
        if (!($sc['n'] ?? 0)) send(403, ['error' => 'Only the jSTF team or stewards may commission']);
    }
    $open = dbAll("SELECT * FROM cells WHERE type = 'xSTF Cell' AND commissioned_by = ? AND status <> 'Completed'", [$cId]);
    $body = readBody(); $qId = trim((string)($body->questionId ?? ''));
    if (!$qId) send(400, ['error' => 'questionId required']);
    $qrow = dbGet('SELECT * FROM cell_objectives WHERE cell_id = ? AND obj_id = ?', [$cId, $qId]);
    if (!$qrow) send(404, ['error' => 'Question not found on this case']);
    if (($qrow['status'] ?? '') === 'met') send(409, ['error' => 'Question already answered — accepted findings cover the mandate']);
    // The question mandates how many eyes and when: one isolated probe per
    // investigator, each due on the question deadline.
    $mandate = max(1, (int)($qrow['assessors'] ?? 1));
    $qDue = $qrow['deadline'] ?? $cell['deadline'] ?? date('Y-m-d', time() + 30 * 86400);
    $team = is_array($body->team ?? null) ? $body->team : [];
    $inv = dbAll('SELECT name, initials FROM cell_team WHERE cell_id = ?', [$cId]);
    if (!$team) $team = array_slice(array_map(function($t) { return ['name' => $t['name'], 'initials' => $t['initials']]; }, $inv), 0, $mandate);
    else {
        $team = array_values(array_filter(array_map(function($t) { $a = (array)$t; $n = trim((string)($a['name'] ?? '')); $i = trim((string)($a['initials'] ?? '')); return ($n !== '' && $i !== '') ? ['name' => $n, 'initials' => $i] : null; }, $team)));
        if (!$team) send(400, ['error' => 'team must list investigators']);
    }
    if (count($team) !== $mandate) send(400, ['error' => 'This question mandates ' . $mandate . ' investigator' . ($mandate === 1 ? '' : 's') . ' (' . count($team) . ' selected)']);
    // One xSTF, two settings: siloed (one isolated probe per investigator)
    // or collaborative (one shared probe, whole team, optionally blind).
    // Every probe carries its authority package and only operates on it.
    $mode = trim((string)($body->mode ?? 'siloed'));
    if (!in_array($mode, ['siloed', 'collaborative'])) send(400, ['error' => 'mode must be siloed or collaborative']);
    $blind = isset($body->blind) ? (!empty($body->blind) ? 1 : 0) : 1;
    $meta = pJson($cell['meta'] ?? '{}') ?: [];
    $brief = trim((string)($body->brief ?? ''));
    if ($brief === '') send(400, ['error' => 'mandate brief required: the team must state what is to be delivered']);
    $qlabel = $qrow['label'] ?? '';
    $authorityRefs = array_values(array_filter(array_map('strval', is_array($body->authorityRefs ?? null) ? $body->authorityRefs : [])));
    $mandateRefs = array_values(array_filter(array_map('strval', is_array($body->mandateRefs ?? null) ? $body->mandateRefs : [])));
    $citedContent = trim((string)($body->citedContent ?? ''));
    // Commissioning authority: a jSTF commission is itself the authority.
    $authority = ['basis' => 'jstf-case', 'ref' => $cId, 'extraRefs' => $authorityRefs];
    $objectives = array_values(array_filter(array_map(function($o) { $s = trim((string)(is_array($o) ? ($o['label'] ?? '') : $o)); return $s !== '' ? $s : null; }, is_array($body->objectives ?? null) ? $body->objectives : [])));
    $tasks = array_values(array_filter(array_map(function($o) { $s = trim((string)(is_array($o) ? ($o['label'] ?? '') : $o)); return $s !== '' ? $s : null; }, is_array($body->tasks ?? null) ? $body->tasks : [])));
    $compDomains = array_values(array_filter(array_map(function($d) { $s = trim((string)$d); return $s !== '' ? $s : null; }, is_array($body->competenceDomains ?? null) ? $body->competenceDomains : [])));
    $made = [];
    $spawnProbe = function($members) use (&$made, $cId, $cell, $meta, $qId, $qlabel, $qDue, $brief, $authority, $authorityRefs, $mandateRefs, $citedContent, $blind, $objectives, $tasks, $compDomains, $user) {
        $names = implode(', ', array_map(function($t) { return $t['name']; }, $members));
        $xId = 'xstf-jstf-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4) . '-' . strtolower(preg_replace('/[^A-Za-z0-9]/', '', ($members[0]['initials'] ?? 'x') . count($members)));
        $xs = ['type' => 'jstf-investigation', 'jstfId' => $cId, 'questionId' => $qId, 'questionLabel' => $qlabel, 'mode' => count($members) > 1 ? 'collaborative' : 'siloed', 'investigators' => array_map(function($t) { return ['name' => $t['name'], 'initials' => $t['initials']]; }, $members), 'investigator' => $members[0]['name'], 'investigatorInitials' => $members[0]['initials'], 'authority' => $authority, 'mandateRefs' => $mandateRefs, 'citedContent' => $citedContent, 'competenceDomains' => $compDomains, 'targetName' => $meta['targetName'] ?? null, 'commissionedBy' => $user['name'] ?? $user['initials'], 'commissionedAt' => date('Y-m-d\TH:i:s.000\Z')];
        $dSpecs = ['name' => 'Answer the mandate question', 'description' => $brief . "\n\nMandate (question):\n" . $qlabel . ($citedContent !== '' ? "\n\nCited content:\n" . $citedContent : ''), 'sections' => 3, 'wordCount' => 'TBD', 'language' => 'Plain English', 'reviewProcess' => 'jstf-accept'];
        dbRun('INSERT INTO cells (id, type, title, status, participants, circle, blind, commissioned_by, source, resolution, meta, deliverable_specs, progress, deadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$xId, 'xSTF Cell', 'xSTF investigation — ' . ($meta['targetName'] ?? $cell['title'] ?? $cId) . ' — ' . $names, 'Active', count($members), $cell['circle'] ?? '', $blind, $cId, json_encode($xs), json_encode(['status' => 'In Progress']), json_encode(['tasks' => [], 'objectives' => []]), json_encode($dSpecs), 0, $qDue]);
        foreach ($members as $t) { $pu = dbGet('SELECT user_id FROM cell_team WHERE cell_id = ? AND initials = ? AND user_id IS NOT NULL', [$cId, $t['initials']]); $puid = $pu['user_id'] ?? null; if (!$puid) { $uu = dbGet('SELECT id FROM users WHERE name = ?', [$t['name']]); $puid = $uu['id'] ?? null; } dbRun('INSERT INTO cell_team (cell_id, name, initials, role, user_id) VALUES (?,?,?,?,?)', [$xId, $t['name'], $t['initials'], 'jSTF-xSTF investigator', $puid]); }
        foreach ($objectives as $oi => $ol) dbRun('INSERT INTO cell_objectives (cell_id, obj_id, label, status) VALUES (?,?,?,?)', [$xId, 'qo-' . $oi . '-' . substr($xId, -4), $ol, 'open']);
        foreach ($tasks as $ti => $tl) dbRun('INSERT INTO cell_tasks (cell_id, task_id, label, status, locked, assignee) VALUES (?,?,?,?,?,?)', [$xId, 'qt-' . $ti . '-' . substr($xId, -4), $tl, 'pending', 0, null]);
        dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $xId, 'xSTF', 'jSTF investigation probe', $cell['circle'] ?? '', 'active', 'Active', 'xSTF investigation — ' . ($meta['targetName'] ?? '') . ' — ' . $names, $qDue]);
        $made[] = $xId;
    };
    if ($mode === 'collaborative') {
        foreach ($open as $cc2) { $cs2 = pJson($cc2['source'] ?? '{}') ?: []; if (($cs2['questionId'] ?? null) === $qId) send(409, ['error' => 'This question already has an open probe']); }
        $spawnProbe($team);
    } else {
        // Investigator identity resolves to user_id (case team first, then
        // users by name) so same-initials collisions never share a probe.
        $resolveProbeUid = function($t) use ($cId) {
            $ctr = dbGet('SELECT user_id FROM cell_team WHERE cell_id = ? AND initials = ? AND user_id IS NOT NULL', [$cId, $t['initials']]);
            if (!empty($ctr['user_id'])) return $ctr['user_id'];
            $uu = dbGet('SELECT id FROM users WHERE name = ?', [$t['name']]);
            return $uu['id'] ?? null;
        };
        $probeHasUid = function($probeId, $uid, $ini) {
            if ($uid && dbGet('SELECT 1 FROM cell_team WHERE cell_id = ? AND user_id = ?', [$probeId, $uid])) return true;
            return (bool)dbGet('SELECT 1 FROM cell_team WHERE cell_id = ? AND initials = ? AND user_id IS NULL', [$probeId, $ini]);
        };
        foreach ($team as $t) {
            $tUid = $resolveProbeUid($t);
            foreach ($open as $cc2) { $cs2 = pJson($cc2['source'] ?? '{}') ?: []; if (($cs2['questionId'] ?? null) === $qId && $probeHasUid($cc2['id'], $tUid, $t['initials'])) send(409, ['error' => $t['name'] . ' already has an open probe on this question']); }
            $t['_uid'] = $tUid;
            $spawnProbe([$t]);
        }
    }
    $byQ = $meta['xstfByQuestion'] ?? []; $prevQ = isset($byQ[$qId]) ? (is_array($byQ[$qId]) ? $byQ[$qId] : [$byQ[$qId]]) : []; $byQ[$qId] = array_values(array_unique(array_merge($prevQ, $made)));
    $meta['xstfByQuestion'] = $byQ;
    dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(201, ['ok' => true, 'xstfId' => $made[0], 'xstfIds' => $made]);
}

// ---- jSTF investigation: accept xSTF findings into the case ----
if (preg_match('/^\/cells\/([^\/]+)\/accept-findings$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    jstfEnsureFresh($cId); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if (($cell['status'] ?? '') !== 'Under Investigation') send(400, ['error' => 'Case is closed']);
    if (!jstfTeamMember($cId, $user)) send(403, ['error' => 'Only the jSTF team may accept findings']);
    $body = readBody(); $xId = trim((string)($body->xstfId ?? '')); $dId = trim((string)($body->deliverableId ?? ''));
    if (!$xId || !$dId) send(400, ['error' => 'xstfId and deliverableId required']);
    $xc = dbGet('SELECT * FROM cells WHERE id = ?', [$xId]);
    if (!$xc || $xc['type'] !== 'xSTF Cell') send(404, ['error' => 'xSTF not found']);
    if (($xc['commissioned_by'] ?? '') !== $cId) send(400, ['error' => 'xSTF was not commissioned by this case']);
    $xm = pJson($xc['meta'] ?? '{}') ?: []; $found = null;
    foreach ($xm['deliverables'] ?? [] as $d) { if (($d['id'] ?? '') === $dId) { $found = $d; break; } }
    if (!$found) send(404, ['error' => 'Deliverable not found']);
    if (($found['status'] ?? '') !== 'approved') send(409, ['error' => 'Only review-approved deliverables may be accepted into findings']);
    $meta = pJson($cell['meta'] ?? '{}') ?: []; $acc = $meta['findings'] ?? [];
    foreach ($acc as $a) { if (($a['deliverableId'] ?? '') === $dId) send(409, ['error' => 'Findings already accepted']); }
    $acc[] = ['deliverableId' => $dId, 'xstfId' => $xId, 'title' => $found['title'] ?? '', 'content' => $found['content'] ?? '', 'submittedBy' => $found['submittedBy'] ?? '', 'acceptedBy' => $user['name'] ?? $user['initials'], 'acceptedAt' => date('Y-m-d\TH:i:s.000\Z')];
    $meta['findings'] = $acc;
    // Question auto-advance: mandate met once accepted findings cover the
    // mandated eyes across this question's probes.
    $qMet = null;
    $xsrc = pJson($xc['source'] ?? '{}') ?: []; $accQ = $xsrc['questionId'] ?? null;
    if ($accQ) {
        $byQ = $meta['xstfByQuestion'] ?? []; $qProbes = is_array($byQ[$accQ] ?? null) ? $byQ[$accQ] : [];
        $nAcc = 0; foreach ($acc as $a) { if (in_array($a['xstfId'] ?? '', $qProbes, true)) $nAcc++; }
        $qq = dbGet('SELECT assessors FROM cell_objectives WHERE cell_id = ? AND obj_id = ?', [$cId, $accQ]);
        if ($qq && $nAcc >= max(1, (int)($qq['assessors'] ?? 1))) { dbRun("UPDATE cell_objectives SET status = 'met' WHERE cell_id = ? AND obj_id = ?", [$cId, $accQ]); $qMet = $accQ; }
    }
    dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(200, ['ok' => true, 'accepted' => count($acc), 'questionMet' => $qMet]);
}

// ---- jSTF resolution draft (team-editable working draft, survives reload) ----
if (preg_match('/^\/cells\/([^\/]+)\/resolution-draft$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    jstfEnsureFresh($cId); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if (($cell['status'] ?? '') !== 'Under Investigation') send(400, ['error' => 'Case is closed']);
    if (!jstfTeamMember($cId, $user)) send(403, ['error' => 'Only the jSTF team may draft']);
    $body = readBody();
    $draftSys = []; $draftDropWarn = [];
    foreach (is_array($body->systemActions ?? null) ? $body->systemActions : [] as $a) {
        $a = (array)$a; $kind = trim((string)($a['kind'] ?? ''));
        if (!in_array($kind, ['remove_from_circle', 'freeze_ws_until', 'candidacy_freeze_until', 'guest_until', 'reverify_competences'])) continue;
        $act = ['kind' => $kind];
        if ($kind === 'remove_from_circle') {
            $circles = array_values(array_filter(array_map('strval', is_array($a['circles'] ?? null) ? $a['circles'] : [])));
            $cellMeta = pJson($cell['meta'] ?? '{}') ?: [];
            $kept = jstfFilterRemovalCircles($circles, $cellMeta['targetId'] ?? null);
            $dropped = array_values(array_diff(array_map('strtolower', $circles), array_map('strtolower', $kept)));
            if ($dropped) $draftDropWarn[] = 'target is not an active member of: ' . implode(', ', $dropped) . ' — dropped from the sanction';
            if (!$kept) continue;
            $act['circles'] = $kept;
        } else {
            $until = trim((string)($a['until'] ?? ''));
            $act['until'] = ($until !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $until)) ? $until : null;
        }
        $draftSys[] = $act;
    }
    $draftExecs = array_values(array_filter(array_map('strval', is_array($body->executingCircles ?? null) ? $body->executingCircles : [])));
    $draftRefs = array_values(array_filter(array_map('strval', is_array($body->policyRefs ?? null) ? $body->policyRefs : [])));
    $draftType = in_array(trim((string)($body->type ?? '')), ['system-bound', 'policy-cited', 'exonerating']) ? trim((string)$body->type) : 'policy-cited';
    if ($draftType === 'exonerating' && ($draftRefs || $draftSys || $draftExecs)) send(400, ['error' => 'Exonerating drafts carry no policy references, system actions or executing circles']);
    $draft = [
        'type' => $draftType,
        'description' => trim((string)($body->description ?? '')),
        'policyRefs' => $draftRefs,
        'executingCircles' => $draftExecs,
        'systemActions' => $draftSys,
        'warnings' => $draftDropWarn,
        'appealDirection' => in_array(trim((string)($body->appealDirection ?? '')), ['uphold', 'overturn']) ? trim((string)$body->appealDirection) : null,
        'findings' => trim((string)($body->findings ?? '')),
        'updatedBy' => $user['name'] ?? $user['initials'],
        'updatedAt' => date('Y-m-d\TH:i:s.000\Z'),
    ];
    $meta = pJson($cell['meta'] ?? '{}') ?: []; $meta['resolutionDraft'] = $draft;
    dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    // A saved draft is a new agreement question: prior endorsements were
    // cast on older wording and no longer count.
    dbRun("DELETE FROM vote_records WHERE cell_id = ? AND domain = 'resolution'", [$cId]);
    send(200, ['ok' => true, 'draft' => $draft]);
}

// ---- jSTF resolution endorsement poll (one member one vote, majority carries) ----
if (preg_match('/^\/cells\/([^\/]+)\/draft-vote$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']); assertActiveMember($user);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    jstfEnsureFresh($cId); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if (($cell['status'] ?? '') !== 'Under Investigation') send(400, ['error' => 'Case is closed']);
    if (!jstfTeamMember($cId, $user)) send(403, ['error' => 'Only the seated team may vote']);
    $body = readBody(); $stance = trim((string)($body->stance ?? ''));
    if (!in_array($stance, ['endorse', 'object'])) send(400, ['error' => 'stance must be endorse or object']);
    jstfCastVote($cId, 'resolution', $user, $stance);
    $ts = (int)(dbGet('SELECT COUNT(*) AS n FROM cell_team WHERE cell_id = ?', [$cId])['n'] ?? 0);
    $maj = max(2, (int)floor($ts / 2) + 1);
    $en = (int)(dbGet("SELECT COUNT(*) AS n FROM vote_records WHERE cell_id = ? AND domain = 'resolution' AND vote = 'endorse'", [$cId])['n'] ?? 0);
    $ob = (int)(dbGet("SELECT COUNT(*) AS n FROM vote_records WHERE cell_id = ? AND domain = 'resolution' AND vote = 'object'", [$cId])['n'] ?? 0);
    $votes = dbAll("SELECT name, initials, vote FROM vote_records WHERE cell_id = ? AND domain = 'resolution'", [$cId]);
    send(200, ['ok' => true, 'endorse' => $en, 'object' => $ob, 'teamSize' => $ts, 'majority' => $maj, 'approved' => $en >= $maj, 'votes' => $votes]);
}

// ═════════════════════════════════════════════════════════
// MEMBERSHIP ROUTES
// ═════════════════════════════════════════════════════════
function markFormer($rosterId, $reason) {
    dbRun("UPDATE circle_roster SET status = 'former', `left` = ?, `left_reason` = ? WHERE id = ?", [date('Y-m-d'), $reason, $rosterId]);
}
if (preg_match('/^\/circles\/([^\/]+)\/resign$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); $row = dbGet("SELECT * FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$cId, $user['id']]);
    if (!$row) send(400, ['error' => 'Not an active member of this circle']);
    markFormer($row['id'], 'resignation'); send(200, ['ok' => true, 'reason' => 'resignation']);
}
if (preg_match('/^\/circles\/([^\/]+)\/remove-member$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); if (!dbGet("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$cId, $user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $tid = trim((string)($body->memberId ?? '')); if (!$tid) send(400, ['error' => 'memberId required']);
    if ($tid === $user['id']) send(400, ['error' => 'Cannot remove yourself']);
    $tgt = dbGet("SELECT * FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$cId, $tid]);
    if (!$tgt) send(404, ['error' => 'Target not an active member']);
    markFormer($tgt['id'], 'jstf-removal'); send(200, ['ok' => true, 'reason' => 'jstf-removal', 'memberId' => $tid]);
}
if (preg_match('/^\/circles\/([^\/]+)\/flush$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); if (!dbGet("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$cId, $user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $keepId = trim((string)($body->keepMemberId ?? $user['id']));
    $rows = dbAll("SELECT * FROM circle_roster WHERE circle_id = ? AND status = 'active'", [$cId]); $removed = 0;
    foreach ($rows as $r) { if ($r['member_id'] !== $keepId) { markFormer($r['id'], 'jstf-circle-flush'); $removed++; } }
    send(200, ['ok' => true, 'reason' => 'jstf-circle-flush', 'removed' => $removed]);
}
if (preg_match('/^\/circles\/([^\/]+)\/disband$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); if (!dbGet("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$cId, $user['id']])) send(403, ['error' => 'Steward access required']);
    $rows = dbAll("SELECT * FROM circle_roster WHERE circle_id = ? AND status = 'active'", [$cId]); $removed = 0;
    foreach ($rows as $r) { markFormer($r['id'], 'circle-disbandment'); $removed++; }
    dbRun("UPDATE circles SET status = 'Archived' WHERE id = ?", [$cId]); send(200, ['ok' => true, 'reason' => 'circle-disbandment', 'removed' => $removed]);
}
if (preg_match('/^\/circles\/([^\/]+)\/drift-check$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); if (!dbGet("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$cId, $user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $threshold = (int)($body->threshold ?? 50);
    $md = array_map(function($d) { return $d['domain']; }, dbAll("SELECT domain FROM circle_domains WHERE circle_id = ? AND mandate = 'primary'", [$cId]));
    if (!$md) send(400, ['error' => 'Circle has no primary mandate domains']);
    $rows = dbAll("SELECT * FROM circle_roster WHERE circle_id = ? AND status = 'active'", [$cId]); $drifted = 0;
    foreach ($rows as $r) { $ws = $r['ws'] ?? 0; if ($ws < $threshold && !in_array($r['top_domain'] ?? '', $md)) { markFormer($r['id'], 'competence-drift'); $drifted++; } }
    send(200, ['ok' => true, 'reason' => 'competence-drift', 'drifted' => $drifted, 'threshold' => $threshold, 'mandateDomains' => $md]);
}
if (preg_match('/^\/circles\/([^\/]+)\/check-expiry$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); if (!dbGet("SELECT 1 FROM circle_roster WHERE circle_id = ? AND member_id = ? AND status = 'active'", [$cId, $user['id']])) send(403, ['error' => 'Steward access required']);
    $ss = dbGet('SELECT * FROM system_settings WHERE id = 1') ?: []; $termMonths = $ss['steward_term_months'] ?? 12;
    $now = time(); $rows = dbAll("SELECT * FROM circle_roster WHERE circle_id = ? AND status = 'active'", [$cId]); $expired = 0;
    foreach ($rows as $r) { if (!$r['joined']) continue; $jm = strtotime($r['joined']); if ($now - $jm > $termMonths * 30.44 * 86400) { markFormer($r['id'], 'term-expiry'); $expired++; } }
    send(200, ['ok' => true, 'reason' => 'term-expiry', 'expired' => $expired, 'termMonths' => $termMonths]);
}

// ═════════════════════════════════════════════════════════
// COMPETENCE ROUTES
// ═════════════════════════════════════════════════════════
if ($cleanPath === '/competence/ws-drift' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $now = time() * 1000; $DAY = 86400000;
    $rows = dbAll("SELECT * FROM user_competence WHERE kind = 'roster'"); $changes = []; $updated = 0;
    foreach ($rows as $r) {
        if (jstfActiveSanction($r['user_id'] ?? null, 'ws_freeze')) continue;
        $last = dbGet('SELECT MAX(time) AS t FROM user_activity WHERE user_id = ?', [$r['user_id']]); $delta = 0;
        if ($last && $last['t']) { $days = ($now - strtotime($last['t']) * 1000) / $DAY; if ($days <= 30) $delta = 10; elseif ($days > 90) $delta = -10; } else $delta = -10;
        if ($delta === 0) continue;
        $prev = $r['ws'] ?? 0; $next = max(0, min(3000, $prev + $delta)); if ($next === $prev) continue;
        dbRun('UPDATE user_competence SET ws = ? WHERE id = ?', [$next, $r['id']]); $updated++;
        $changes[] = ['userId' => $r['user_id'], 'domain' => $r['domain'], 'prev' => $prev, 'next' => $next, 'delta' => $delta];
    }
    send(200, ['ok' => true, 'updated' => $updated, 'changes' => $changes]);
}
if ($cleanPath === '/competence/endorse' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $tid = trim((string)($body->targetId ?? '')); $domain = trim((string)($body->domain ?? ''));
    if (!$tid || !$domain) send(400, ['error' => 'targetId and domain required']);
    $target = dbGet('SELECT * FROM users WHERE id = ?', [$tid]); if (!$target) send(404, ['error' => 'Target member not found']);
    if (jstfActiveSanction($tid, 'ws_freeze')) send(403, ['error' => 'Ws frozen by jSTF sanction']);
    $row = dbGet('SELECT * FROM user_competence WHERE user_id = ? AND domain = ?', [$tid, $domain]);
    if (!$row) send(404, ['error' => 'Member has no competence in that domain']);
    $prev = $row['ws'] ?? 0; $next = min(3000, $prev + 50);
    dbRun('UPDATE user_competence SET ws = ? WHERE id = ?', [$next, $row['id']]);
    send(200, ['ok' => true, 'targetId' => $tid, 'domain' => $domain, 'prev' => $prev, 'next' => $next, 'delta' => $next - $prev]);
}
if ($cleanPath === '/competence/declare-wh' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $body = readBody(); $domain = trim((string)($body->domain ?? '')); $wh = (int)($body->wh ?? 0); $evidence = trim((string)($body->evidence ?? ''));
    if (!$domain) send(400, ['error' => 'domain required']); if ($wh < 0 || $wh > 3000) send(400, ['error' => 'wh must be between 0 and 3000']); if (!$evidence) send(400, ['error' => 'evidence required']);
    if (jstfActiveSanction($user['id'], 'ws_freeze')) send(403, ['error' => 'Ws frozen by jSTF sanction']);
    $ex = dbGet('SELECT id FROM user_competence WHERE user_id = ? AND domain = ?', [$user['id'], $domain]);
    if ($ex) dbRun('UPDATE user_competence SET wh = ?, evidence = ?, verified = 0, kind = ?, ws = ? WHERE id = ?', [$wh, $evidence, 'self', $wh, $ex['id']]);
    else dbRun('INSERT INTO user_competence (user_id, domain, wh, evidence, verified, kind, ws) VALUES (?,?,?,?,0,?,?)', [$user['id'], $domain, $wh, $evidence, 'self', $wh]);
    send(200, ['ok' => true, 'domain' => $domain, 'wh' => $wh, 'verified' => 0]);
}
if ($cleanPath === '/competence/verify-wh' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $tid = trim((string)($body->targetId ?? '')); $domain = trim((string)($body->domain ?? '')); $verified = !empty($body->verified) ? 1 : 0;
    if (!$tid || !$domain) send(400, ['error' => 'targetId and domain required']);
    if (jstfActiveSanction($tid, 'ws_freeze')) send(403, ['error' => 'Ws frozen by jSTF sanction']);
    $row = dbGet('SELECT * FROM user_competence WHERE user_id = ? AND domain = ?', [$tid, $domain]);
    if (!$row) send(404, ['error' => 'No competence row for target domain']);
    dbRun('UPDATE user_competence SET verified = ? WHERE id = ?', [$verified, $row['id']]);
    send(200, ['ok' => true, 'targetId' => $tid, 'domain' => $domain, 'verified' => $verified === 1]);
}
if ($cleanPath === '/competence/interest' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $body = readBody(); $ranks = is_array($body->ranks ?? null) ? $body->ranks : [];
    if (!$ranks) send(400, ['error' => 'ranks required']); if (count($ranks) > 10) send(400, ['error' => 'Max 10 ranked domains']);
    $seen = []; $score = 0;
    foreach ($ranks as $entry) {
        $domain = trim((string)($entry->domain ?? '')); $rank = (int)($entry->rank ?? 0);
        if (!$domain) send(400, ['error' => 'domain required per rank']); if ($rank < 1 || $rank > 10) send(400, ['error' => 'rank must be an integer 1-10']); if (in_array($domain, $seen)) send(400, ['error' => 'Duplicate domain ranked']);
        $seen[] = $domain; $pts = 11 - $rank; $score += $pts;
        $ex = dbGet('SELECT id FROM user_competence WHERE user_id = ? AND domain = ?', [$user['id'], $domain]);
        if ($ex) dbRun('UPDATE user_competence SET interest = ?, rank = ?, kind = ? WHERE id = ?', [$pts, $rank, 'self', $ex['id']]);
        else dbRun('INSERT INTO user_competence (user_id, domain, interest, rank, kind) VALUES (?,?,?,?,?)', [$user['id'], $domain, $pts, $rank, 'self']);
    }
    dbRun("UPDATE users SET interest_score = ?, interest_drift = ? WHERE id = ?", [$score, 'ranked', $user['id']]);
    send(200, ['ok' => true, 'scored' => count($ranks), 'interestScore' => $score]);
}
if ($cleanPath === '/competence/standing' && $method === 'GET') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $allComp = dbAll('SELECT * FROM user_competence ORDER BY user_id, domain');
    $byUser = []; foreach ($allComp as $r) { $byUser[$r['user_id']][] = $r; }
    $users = dbAll('SELECT id, name, initials, standing, interest_score FROM users');
    $standings = array_map(function($u) use ($byUser) {
        $comps = $byUser[$u['id']] ?? []; $total = array_reduce($comps, function($s, $c) { return $s + ($c['ws'] ?? 0); }, 0);
        return ['id' => $u['id'], 'name' => $u['name'], 'initials' => $u['initials'], 'standing' => $total, 'storedStanding' => $u['standing'] ?? null, 'interestScore' => $u['interest_score'] ?? null, 'domains' => array_map(function($c) { return ['domain' => $c['domain'], 'ws' => $c['ws'] ?? 0, 'wh' => $c['wh'] ?? null, 'interest' => $c['interest'] ?? null, 'evidence' => $c['evidence'] ?? null, 'verified' => !empty($c['verified'])]; }, $comps)];
    }, $users);
    usort($standings, function($a, $b) { return $b['standing'] - $a['standing']; });
    send(200, ['ok' => true, 'standings' => $standings]);
}

// ═════════════════════════════════════════════════════════
// OBSERVATORY ROUTES
// ═════════════════════════════════════════════════════════
if ($cleanPath === '/observatory/news' && $method === 'GET') { send(200, ['ok' => true, 'news' => dbAll('SELECT * FROM news ORDER BY time DESC')]); }
if ($cleanPath === '/observatory/news' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $title = trim((string)($body->title ?? '')); $bt = trim((string)($body->body ?? ''));
    if (!$title || !$bt) send(400, ['error' => 'title and body required']);
    $res = dbRun('INSERT INTO news (title, time, source, domain, body, curated_by) VALUES (?,?,?,?,?,?)', [$title, date('Y-m-d'), trim((string)($body->source ?? '')) ?: null, trim((string)($body->domain ?? '')) ?: null, $bt, $user['name'] ?? $user['initials']]);
    send(201, ['ok' => true, 'id' => $res->insertId]);
}
if ($cleanPath === '/observatory/events' && $method === 'GET') { send(200, ['ok' => true, 'events' => dbAll('SELECT * FROM events ORDER BY date DESC')]); }
if ($cleanPath === '/observatory/events' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $title = trim((string)($body->title ?? '')); $date = trim((string)($body->date ?? ''));
    if (!$title || !$date) send(400, ['error' => 'title and date required']);
    $res = dbRun('INSERT INTO events (title, date, location, domain, type) VALUES (?,?,?,?,?)', [$title, $date, trim((string)($body->location ?? '')), trim((string)($body->domain ?? '')), trim((string)($body->type ?? ''))]);
    send(201, ['ok' => true, 'id' => $res->insertId]);
}
if ($cleanPath === '/observatory/events/import' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $items = is_array($body->events ?? null) ? $body->events : []; if (!$items) send(400, ['error' => 'events array required']);
    $imported = 0; foreach ($items as $e) { if (!$e->title ?? '' || !($e->date ?? '')) continue; dbRun('INSERT INTO events (title, date, location, domain, type) VALUES (?,?,?,?,?)', [(string)$e->title, (string)$e->date, (string)($e->location ?? ''), (string)($e->domain ?? ''), (string)($e->type ?? '')]); $imported++; }
    send(201, ['ok' => true, 'imported' => $imported]);
}
if ($cleanPath === '/observatory/library' && $method === 'GET') { send(200, ['ok' => true, 'library' => dbAll('SELECT * FROM library_items ORDER BY id DESC')]); }
if ($cleanPath === '/observatory/library' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $title = trim((string)($body->title ?? '')); $link = trim((string)($body->link ?? ''));
    if (!$title || !$link) send(400, ['error' => 'title and link required']);
    $res = dbRun('INSERT INTO library_items (title, category, item_type, domain, link, curated_by) VALUES (?,?,?,?,?,?)', [$title, trim((string)($body->category ?? '')), trim((string)($body->itemType ?? 'book')), trim((string)($body->domain ?? '')), $link, $user['name'] ?? $user['initials']]);
    send(201, ['ok' => true, 'id' => $res->insertId]);
}
if (preg_match('/^\/observatory\/publications\/(\d+)\/(approve|reject)$/', $cleanPath, $pm)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $id = (int)$pm[1]; $pub = dbGet('SELECT * FROM publications WHERE id = ?', [$id]); if (!$pub) send(404, ['error' => 'Publication not found']);
    $status = $pm[2] === 'approve' ? 'approved' : 'rejected';
    dbRun('UPDATE publications SET status = ? WHERE id = ?', [$status, $id]); send(200, ['ok' => true, 'id' => $id, 'status' => $status]);
}
if ($cleanPath === '/observatory/publications/pending' && $method === 'GET') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    send(200, ['ok' => true, 'pending' => dbAll("SELECT * FROM publications WHERE status = 'pending' ORDER BY created_at DESC")]);
}
if ($cleanPath === '/observatory/publications' && $method === 'GET') { send(200, ['ok' => true, 'publications' => dbAll("SELECT * FROM publications WHERE status = 'approved' ORDER BY date DESC")]); }
if ($cleanPath === '/observatory/publications' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $body = readBody(); $title = trim((string)($body->title ?? '')); $abstract = trim((string)($body->abstract ?? ''));
    if (!$title || !$abstract) send(400, ['error' => 'title and abstract required']);
    $res = dbRun('INSERT INTO publications (title, journal, date, type, abstract, tags, domain, status, author, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [$title, trim((string)($body->journal ?? '')), date('Y-m-d'), trim((string)($body->type ?? 'essay')), $abstract, json_encode(is_array($body->tags ?? null) ? $body->tags : []), trim((string)($body->domain ?? '')), 'pending', $user['name'] ?? $user['initials'], date('Y-m-d\TH:i:s.000\Z')]);
    send(201, ['ok' => true, 'id' => $res->insertId, 'status' => 'pending']);
}
if ($cleanPath === '/observatory/organisations' && $method === 'GET') { send(200, ['ok' => true, 'organisations' => dbAll('SELECT * FROM organisations ORDER BY name')]); }
// Public org cards for the marketing site (no auth): orgs + knowledge-domain labels joined
if ($cleanPath === '/public/organisations' && $method === 'GET') {
    $kd = groupBy(dbAll('SELECT * FROM org_knowledge_domains'), 'org_id');
    $labels = [];
    foreach (dbAll('SELECT id, label FROM domains') as $d) $labels[$d['id']] = $d['label'];
    $orgs = array_map(function($o) use ($kd, $labels) {
        return [
            'id' => $o['id'], 'name' => $o['name'], 'memberCount' => $o['member_count'],
            'location' => $o['location'], 'summary' => $o['summary'], 'status' => $o['status'],
            'knowledgeDomains' => array_values(array_map(function($d) use ($labels) { return $labels[$d['domain']] ?? $d['domain']; }, $kd[$o['id']] ?? [])),
        ];
    }, dbAll('SELECT * FROM organisations ORDER BY name'));
    send(200, ['ok' => true, 'organisations' => $orgs]);
}
if ($cleanPath === '/observatory/organisations' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $name = trim((string)($body->name ?? '')); if (!$name) send(400, ['error' => 'name required']);
    $id = 'org-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
    dbRun('INSERT INTO organisations (id, name, acronym, location, summary, status, website) VALUES (?,?,?,?,?,?,?)', [$id, $name, trim((string)($body->acronym ?? '')), trim((string)($body->location ?? '')), trim((string)($body->summary ?? '')), 'Active', trim((string)($body->website ?? ''))]);
    send(201, ['ok' => true, 'id' => $id]);
}

// ═════════════════════════════════════════════════════════
// CONFIG ROUTES
// ═════════════════════════════════════════════════════════
if ($cleanPath === '/system-settings' && $method === 'GET') { send(200, dbGet('SELECT * FROM system_settings WHERE id = 1') ?: []); }
if ($cleanPath === '/system-settings' && ($method === 'PATCH' || $method === 'PUT')) {
    $body = readBody(); $cols = array_map(function($c) { return $c['Field']; }, dbAll('SHOW COLUMNS FROM system_settings'));
    $entries = []; foreach ((array)$body as $k => $v) { if (in_array($k, $cols) && $k !== 'id') $entries[] = [$k, $v]; }
    if (!$entries) send(200, dbGet('SELECT * FROM system_settings WHERE id = 1'));
    $sets = array_map(function($e) { return $e[0] . ' = ?'; }, $entries);
    dbRun('UPDATE system_settings SET ' . implode(', ', $sets) . ' WHERE id = 1', array_map(function($e) { return $e[1]; }, $entries));
    send(200, dbGet('SELECT * FROM system_settings WHERE id = 1'));
}
if ($cleanPath === '/stats' && $method === 'GET') { $r = dbGet('SELECT stats FROM stats WHERE id = 1'); send(200, $r ? pJson($r['stats']) ?: [] : []); }
if ($cleanPath === '/registration' && $method === 'GET') {
    $reg = dbAll('SELECT * FROM registration_domains'); $meta = dbGet('SELECT * FROM registration_meta WHERE id = 1');
    send(200, ['domains' => $reg, 'eloMap' => $meta ? pJson($meta['elo_map']) ?: [] : [], 'knowledgeLevels' => $meta ? pJson($meta['knowledge_levels']) ?: [] : [], 'experientialLevels' => $meta ? pJson($meta['experiential_levels']) ?: [] : [], 'defaultInterests' => $meta ? pJson($meta['default_interests']) ?: [] : []]);
}
if ($cleanPath === '/current-user' && $method === 'GET') { $u = dbGet('SELECT * FROM users WHERE is_current = 1'); if (!$u) send(404, ['error' => 'No current user']); unset($u['password_hash']); send(200, $u); }

send(404, ['error' => 'Not found']);
