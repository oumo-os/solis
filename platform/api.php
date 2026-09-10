<?php
// api.php — Solis Commons database prototype server (PHP port of server.mjs)
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 86400');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$db = new mysqli('localhost', 'root', '', 'solis', 3306);
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
function authUser() { $h = getAuthHeader(); if (!preg_match('/^Bearer\s+(.+)$/i', $h, $m)) return null; return dbGet('SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ? AND t.expires_at > NOW()', [$m[1]]); }

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
    $compByUser = groupBy(dbAll('SELECT * FROM user_competence'), 'user_id');
    $cirByUser = groupBy(dbAll('SELECT * FROM user_circles'), 'user_id');
    $orgByUser = groupBy(dbAll('SELECT * FROM user_orgs'), 'user_id');
    $dirByUser = groupBy(dbAll('SELECT * FROM participants'), 'user_id');
    $actByUser = groupBy(dbAll('SELECT * FROM user_activity'), 'user_id');

    $participants = [];
    foreach ($users as $u) {
        $dir = $dirByUser[$u['id']][0] ?? [];
        $participants[] = [
            'id' => $u['id'], 'name' => $u['name'], 'initials' => $u['initials'],
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
    $vsumByCell = groupBy(dbAll('SELECT * FROM cell_vote_summary'), 'cell_id');
    $cells = [];
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
        $cell['objectives'] = array_map(function($o) { return ['id' => $o['obj_id'] ?: 'o' . $o['id'], 'label' => $o['label'], 'status' => $o['status']]; }, $objByCell[$c['id']] ?? []);
        $cell['team'] = array_map(function($t) { return ['name' => $t['name'], 'initials' => $t['initials'], 'role' => $t['role'], 'focus' => $t['focus']]; }, $teamByCell[$c['id']] ?? []);
        $cell['draftResolutions'] = [];
        foreach (($draftByCell[$c['id']] ?? []) as $d) {
            $cell['draftResolutions'][] = ['id' => $d['res_id'] ?? $d['id'], 'rowId' => $d['id'], 'status' => $d['status'] ?: 'draft', 'title' => $d['title'], 'text' => $d['text'], 'action' => $d['action'], 'votesNullified' => (bool)$d['votes_nullified'], 'versions' => array_map(function($v) { return ['title' => $v['title'], 'text' => $v['text'], 'action' => $v['action'], 'author' => $v['author'], 'ts' => $v['ts']]; }, $verByDraft[$d['id']] ?? []), 'implementingCircles' => array_map(function($i) { return $i['circle_name']; }, $impByDraft[$d['id']] ?? [])];
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
        if ($s['bucket'] === 'pending') $obj['candidate'] = $s['title']; else $obj['title'] = $s['title'];
        $stfShape[$s['bucket']][] = $obj;
    }
    $cdByCand = groupBy(dbAll('SELECT * FROM stf_candidate_domains'), 'candidate_id');
    $stfCandidates = array_map(function($c) use ($cdByCand) { return ['id' => $c['id'], 'stfId' => $c['stf_id'], 'name' => $c['name'], 'initials' => $c['initials'], 'matchScore' => $c['match_score'], 'matchedDomains' => array_values(array_map(function($d) { return $d['domain']; }, $cdByCand[$c['id']] ?? [])), 'interestScore' => $c['interest_score'], 'competenceScore' => $c['competence_score'], 'status' => $c['status'], 'invitedDate' => $c['invited_date']]; }, dbAll('SELECT * FROM stf_candidates'));
    $replyByThread = groupBy(dbAll('SELECT * FROM thread_replies'), 'thread_id');
    $threads = array_map(function($t) use ($replyByThread) { return ['id' => $t['id'], 'title' => $t['title'], 'body' => $t['body'], 'author' => $t['author'], 'initials' => $t['initials'], 'avatar' => pJson($t['avatar'] ?? null) ?: [], 'domain' => $t['domain'], 'domainColor' => $t['domain_color'], 'badge' => $t['badge'], 'badgeClass' => $t['badge_class'], 'replies' => $t['replies'], 'likes' => $t['likes'], 'shares' => $t['shares'], 'time' => $t['time'], 'pinned' => (bool)$t['pinned'], 'endorsements' => $t['endorsements'] ?? 0, 'proposalCellId' => $t['proposal_cell_id'] ?? null, 'visibility' => $t['visibility'] ?: 'public', 'jstfCellId' => $t['jstf_cell_id'] ?? null, 'repliesList' => array_map(function($r) { return ['id' => $r['id'], 'author' => $r['author'], 'initials' => $r['initials'], 'avatar' => pJson($r['avatar'] ?? null) ?: [], 'time' => $r['time'], 'body' => $r['body'], 'likes' => $r['likes']]; }, $replyByThread[$t['id']] ?? [])]; }, dbAll('SELECT * FROM threads'));
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
    $systemSettings = ['stewardTermMonths' => $ss['steward_term_months'] ?? null, 'maxConsecutiveTerms' => $ss['max_consecutive_terms'] ?? null, 'cooloffMonths' => $ss['cooloff_months'] ?? null, 'pAstfCycleMonths' => $ss['p_astf_cycle_months'] ?? null, 'autoExpireCircles' => (bool)($ss['auto_expire_circles'] ?? false), 'defaultCircleExpiryMonths' => $ss['default_circle_expiry_months'] ?? null];
    $sr = dbGet('SELECT stats FROM stats WHERE id = 1');
    $stats = $sr ? pJson($sr['stats']) ?: [] : [];
    $regRows = dbAll('SELECT * FROM registration_domains'); $regMeta = dbGet('SELECT * FROM registration_meta WHERE id = 1');
    $registration = ['domains' => array_map(function($r) { return ['name' => $r['name'], 'type' => $r['type']]; }, $regRows), 'eloMap' => $regMeta ? pJson($regMeta['elo_map']) ?: [] : [], 'knowledgeLevels' => $regMeta ? pJson($regMeta['knowledge_levels']) ?: [] : [], 'experientialLevels' => $regMeta ? pJson($regMeta['experiential_levels']) ?: [] : [], 'defaultInterests' => $regMeta ? pJson($regMeta['default_interests']) ?: [] : []];
    $integrityRecords = dbAll('SELECT * FROM integrity_records');
    $governanceEvents = array_map(function($g) { $o = ['id' => $g['id'], 'type' => $g['type'], 'circle' => $g['circle'], 'date' => $g['date'], 'text' => $g['text']]; if ($g['participant'] !== null) $o['participant'] = $g['participant']; return $o; }, dbAll('SELECT * FROM governance_events'));
    $domByApp = groupBy(dbAll('SELECT * FROM circle_application_domains'), 'app_id');
    $circleApplications = array_map(function($a) use ($domByApp) { return ['id' => $a['id'], 'circleId' => $a['circle_id'], 'circleName' => $a['circle_name'], 'applicant' => $a['applicant'], 'initials' => $a['initials'], 'motivation' => $a['motivation'], 'relevantDomains' => array_values(array_map(function($d) { return $d['domain']; }, $domByApp[$a['id']] ?? [])), 'status' => $a['status'], 'appliedDate' => $a['applied_date'], 'queuePosition' => $a['queue_position']]; }, dbAll('SELECT * FROM circle_applications'));
    $projectApplications = array_map(function($p) { return ['id' => $p['id'], 'cellId' => $p['cell_id'], 'projectName' => $p['project_name'], 'applicant' => $p['applicant'], 'initials' => $p['initials'], 'motivation' => $p['motivation'], 'status' => $p['status'], 'appliedDate' => $p['applied_date'], 'proposedRole' => $p['proposed_role']]; }, dbAll('SELECT * FROM project_applications'));
    $governanceLedger = array_map(function($l) { return ['id' => $l['id'], 'type' => $l['type'], 'target' => $l['target'], 'settings' => pJson($l['settings']), 'appliedBy' => $l['applied_by'], 'appliedAt' => $l['applied_at'], 'status' => $l['status']]; }, dbAll('SELECT * FROM governance_ledger'));
    $myEngagements = [];
    if ($currentRow) { foreach (dbAll('SELECT t.id, (SELECT COUNT(*) FROM thread_endorsements e WHERE e.thread_id = t.id AND e.user_id = ?) AS endorsed, (SELECT COUNT(*) FROM thread_bookmarks b WHERE b.thread_id = t.id AND b.user_id = ?) AS bookmarked FROM threads t', [strval($cuid), strval($cuid)]) as $r) $myEngagements[] = ['threadId' => $r['id'], 'endorsed' => $r['endorsed'] > 0, 'bookmarked' => $r['bookmarked'] > 0]; }
    $payload = ['currentUser' => $currentUser, 'participants' => $participants, 'organisations' => $organisations, 'domains' => $domains, 'domainLayout' => $domainLayout, 'circles' => $circles, 'cells' => $cells, 'stfs' => $stfShape, 'stfCandidates' => $stfCandidates, 'threads' => $threads, 'inbox' => $inbox, 'publications' => $publications, 'news' => $news, 'events' => $events, 'opportunities' => $opportunities, 'projects' => $projects, 'library' => $library, 'exitReasonLabels' => $exitReasonLabels, 'systemSettings' => $systemSettings, 'stats' => $stats, 'registration' => $registration, 'integrityRecords' => $integrityRecords, 'governanceEvents' => $governanceEvents, 'circleApplications' => $circleApplications, 'projectApplications' => $projectApplications, 'governanceLedger' => $governanceLedger, 'myEngagements' => $myEngagements];
    if ($empty) { foreach (['participants','organisations','circles','cells','threads','inbox','publications','news','events','opportunities','projects','library','integrityRecords','governanceEvents','circleApplications','projectApplications','governanceLedger','stfCandidates','myEngagements'] as $k) $payload[$k] = []; $payload['stfs'] = ['pending' => [], 'active' => [], 'completed' => []]; $payload['domains'] = []; $payload['stats'] = []; }
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
foreach ($routes as $r) {
    $id = parseId($cleanPath, $r['path']);
    if ($cleanPath === $r['path'] || $id !== null) {
        if ($method === 'GET') { if ($id !== null) { $row = dbGet("SELECT * FROM {$r['table']} WHERE id = ?", [$id]); if (!$row) send(404, ['error' => 'Not found']); send(200, $row); } send(200, dbAll("SELECT * FROM {$r['table']}")); }
        if ($method === 'POST' && $cleanPath === $r['path']) { $body = readBody(); if (!isset($body->id)) send(400, ['error' => 'id required']); dbRun("INSERT INTO {$r['table']} (id) VALUES (?) ON DUPLICATE KEY UPDATE id=id", [strval($body->id)]); $ok = updateRow($r['table'], $body); send($ok ? 201 : 409, ['ok' => (bool)$ok, 'id' => $body->id]); }
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
        if ($method === 'GET' && !preg_match($childIdRe, $cleanPath)) { send(200, dbAll("SELECT * FROM {$d['child']} WHERE {$d['parentKey']} = ?", [$parentId])); }
        if ($method !== 'GET') { $wuser = authUser(); if (!$wuser) send(401, ['error' => 'Unauthorized']); }
        if ($method === 'POST' && !preg_match($childIdRe, $cleanPath)) {
            $body = readBody();
            $cols = array_filter(array_map(function($c) { return $c['Field']; }, dbAll("SHOW COLUMNS FROM `{$d['child']}`")), function($c) use ($d) { return $c !== $d['parentKey'] && $c !== 'id'; });
            $entries = []; foreach ((array)$body as $k => $v) { if (in_array($k, $cols)) $entries[] = [$k, $v]; }
            $keys = array_merge([$d['parentKey']], array_map(function($e) { return $e[0]; }, $entries));
            $vals = array_merge([$parentId], array_map(function($e) { return bindVal($e[1]); }, $entries));
            dbRun("INSERT INTO {$d['child']} (" . implode(',', $keys) . ") VALUES (" . implode(',', array_fill(0, count($keys), '?')) . ")", $vals);
            send(201, dbGet("SELECT * FROM {$d['child']} WHERE {$d['parentKey']} = ? ORDER BY id DESC LIMIT 1", [$parentId]));
        }
        if (preg_match($childIdRe, $cleanPath, $cm)) {
            $childId = urldecode($cm[2]);
            if ($method === 'PATCH' || $method === 'PUT') { $body = readBody(); $cols = array_filter(array_map(function($c) { return $c['Field']; }, dbAll("SHOW COLUMNS FROM `{$d['child']}`")), function($c) { return $c !== 'id'; }); $entries = []; foreach ((array)$body as $k => $v) { if (in_array($k, $cols)) $entries[] = [$k, $v]; } if (!$entries) send(200, dbGet("SELECT * FROM {$d['child']} WHERE id = ?", [$childId])); $sets = array_map(function($e) { return $e[0] . ' = ?'; }, $entries); dbRun("UPDATE {$d['child']} SET " . implode(', ', $sets) . " WHERE id = ?", array_merge(array_map(function($e) { return bindVal($e[1]); }, $entries), [$childId])); send(200, dbGet("SELECT * FROM {$d['child']} WHERE id = ?", [$childId])); }
            if ($method === 'DELETE') { $out = dbRun("DELETE FROM {$d['child']} WHERE id = ?", [$childId]); send($out->affectedRows ? 200 : 404, ['ok' => $out->affectedRows > 0]); }
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
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
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
    $cellId = 'delib-' . base_convert(time(), 10, 36);
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
    $cellId = 'delib-' . base_convert(time(), 10, 36);
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
    $cellId = 'delib-' . base_convert(time(), 10, 36);
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
    $astfId = 'astf-' . base_convert(time(), 10, 36);
    $os = $cell ? pJson($cell['source'] ?? '{}') : []; $cn = $os['circleName'] ?? $cell['circle'] ?? '';
    $as = ['type' => 'motion-audit', 'originCellId' => $cellId, 'originTitle' => $cell['title'] ?? '', 'draftId' => strval($draftId), 'draftTitle' => $draft['title'] ?? $cell['title'] ?? '', 'circleName' => $cn, 'submittedBy' => $user['name'] ?? $user['initials'], 'submittedAt' => date('Y-m-d\TH:i:s.000\Z')];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, blind, commissioned_by, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [$astfId, 'aSTF Cell', 'aSTF · ' . ($draft['title'] ?? $cell['title'] ?? ''), 'Blind Review', 'motion-audit', $cell['participants'] ?? 0, $cn, 1, $cellId, json_encode($as), json_encode(['status' => 'Pending']), json_encode(['assessors' => 3, 'rubric' => ['jurisdiction' => 0, 'depth' => 0, 'alignment' => 0, 'competence' => 0]])]);
    dbRun('UPDATE cells SET resolution_ref = ? WHERE id = ?', [$astfId, $cellId]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $astfId, 'aSTF', $draft['title'] ?? $cell['title'] ?? '', $cn, 'active', 'Blind Review', $draft['title'] ?? $cell['title'] ?? '', date('Y-m-d', time() + 10 * 86400)]);
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
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cellId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cellId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'aSTF Cell') send(400, ['error' => 'Not an aSTF cell']);
    if ($cell['status'] === 'Verdict Filed') send(409, ['error' => 'Verdict already filed']);
    $body = readBody(); $verdict = trim((string)($body->verdict ?? ''));
    if (!in_array($verdict, ['approved', 'rejected', 'revision'])) send(400, ['error' => 'verdict must be approved, rejected, or revision']);
    $rubric = $body->rubric ?? new \stdClass();
    $jur = min(9, max(0, (int)($rubric->jurisdiction ?? 0))); $dep = min(5, max(0, (int)($rubric->depth ?? 0)));
    $ali = min(10, max(0, (int)($rubric->alignment ?? 0))); $com = min(6, max(0, (int)($rubric->competence ?? 0)));
    $total = $jur + $dep + $ali + $com;
    $rationale = trim((string)($body->rationale ?? '')); $flags = is_array($body->flags ?? null) ? $body->flags : [];
    $src = pJson($cell['source'] ?? '{}') ?: [];
    $ar = ['verdict' => $verdict, 'rationale' => $rationale, 'flags' => $flags, 'rubric' => ['jurisdiction' => $jur, 'depth' => $dep, 'alignment' => $ali, 'competence' => $com, 'total' => $total], 'adjudicator' => $user['name'] ?? $user['initials'], 'filedAt' => date('Y-m-d\TH:i:s.000\Z')];
    dbRun("UPDATE cells SET status = 'Verdict Filed', resolution = ?, blind = 0 WHERE id = ?", [json_encode($ar), $cellId]);
    $stfRow = dbGet("SELECT id FROM stfs WHERE type = 'aSTF' AND status = 'Blind Review' AND purpose = ?", [$src['draftTitle'] ?? '']);
    if ($stfRow) dbRun("UPDATE stfs SET status = 'Verdict Filed', bucket = 'completed' WHERE id = ?", [$stfRow['id']]);
    // jSTF judicial audit path
    if (($src['type'] ?? '') === 'judicial-audit' && !empty($src['sourceCellId'])) {
        $jstf = dbGet('SELECT * FROM cells WHERE id = ?', [$src['sourceCellId']]);
        if ($jstf) {
            $jm = pJson($jstf['meta'] ?? '{}') ?: []; $jr = pJson($jstf['resolution'] ?? '{}') ?: []; $jr['audit'] = $ar;
            if ($verdict === 'approved') {
                $jr['status'] = 'Applied'; $vi = $src['verdict'] ?? $jm['verdict'] ?? [];
                $jr['implementation'] = ['type' => $vi['type'] ?? 'policy-cited', 'actions' => (($vi['type'] ?? '') === 'system-bound') ? ['target role/privileges updated per system settings', 'Ws recalculated', 'fresh vSTF composition triggered'] : ['applied per cited policy resolutions: ' . implode(', ', $vi['policyRefs'] ?? [])]];
                dbRun("UPDATE cells SET status = 'Resolution Applied', resolution = ? WHERE id = ?", [json_encode($jr), $src['sourceCellId']]);
            } else {
                $jr['status'] = 'Revision Ordered'; $jr['revisionNotes'] = $rationale;
                dbRun("UPDATE cells SET status = 'Under Investigation', resolution = ? WHERE id = ?", [json_encode($jr), $src['sourceCellId']]);
                $prevTeam = $src['team'] ?? []; $prevIds = array_map(function($t) { return $t['id']; }, $prevTeam);
                $stewards = dbAll("SELECT DISTINCT r.member_id AS id, r.name, r.initials FROM circle_roster r JOIN users u ON u.id = r.member_id WHERE r.status = 'active' ORDER BY r.name LIMIT 3");
                $fresh = array_values(array_filter($stewards, function($s) use ($prevIds) { return !in_array($s['id'], $prevIds); }));
                if (count($fresh) < 2) $fresh = array_merge(array_slice($stewards, 1), array_slice($stewards, 0, 1));
                $team = $fresh; $js = pJson($jstf['source'] ?? '{}') ?: [];
                $js['team'] = array_map(function($t) { return ['id' => $t['id'], 'name' => $t['name'], 'initials' => $t['initials']]; }, $team);
                $revisions = $jm['revisions'] ?? []; $revisions[] = ['at' => date('Y-m-d\TH:i:s.000\Z'), 'by' => $user['name'] ?? $user['initials'], 'notes' => $rationale, 'supersededVerdict' => $jm['verdict'] ?? null];
                $jm['verdict'] = null;
                dbRun('DELETE FROM cell_team WHERE cell_id = ?', [$src['sourceCellId']]);
                foreach ($team as $i => $t) dbRun('INSERT INTO cell_team (cell_id, name, initials, role, focus) VALUES (?,?,?,?,?)', [$src['sourceCellId'], $t['name'], $t['initials'], $i === 0 ? 'Lead investigator' : 'Investigator', 'Judicial review']);
                $ts2 = count($team); $maj = (int)floor($ts2 / 2) + 1;
                $ti = array_map(function($t) { return $t['initials']; }, $team);
                if ($ti) { $ph = implode(',', array_fill(0, count($ti), '?')); dbRun("DELETE FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND initials NOT IN ($ph)", array_merge([$src['sourceCellId']], $ti)); }
                $rc = (int)(dbGet("SELECT COUNT(*) AS n FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND vote = 'restrict'", [$src['sourceCellId']])['n'] ?? 0);
                $cur = $jm['restriction'] ?? ['state' => 'relaxed', 'restrictCount' => 0, 'teamSize' => $ts2, 'majority' => $maj, 'severity' => null, 'history' => []];
                $cur['restrictCount'] = $rc; $cur['teamSize'] = $ts2; $cur['majority'] = $maj;
                $cur['state'] = $rc >= $maj ? 'restricted' : 'relaxed';
                $cur['severity'] = $cur['state'] === 'restricted' ? ((!empty($jm['targetIsSteward']) && $rc < $ts2) ? 'frozen' : 'readonly') : null;
                $cur['history'] = $cur['history'] ?? []; $cur['history'][] = ['prev' => 'composition-shuffle', 'next' => $cur['state'], 'at' => date('Y-m-d\TH:i:s.000\Z'), 'by' => $user['name'] ?? $user['initials']];
                $jm['restriction'] = $cur;
                dbRun('UPDATE cells SET participants = ?, source = ?, meta = ? WHERE id = ?', [$ts2, json_encode($js), json_encode($jm), $src['sourceCellId']]);
                dbRun("UPDATE stfs SET status = 'Under Investigation', bucket = 'active' WHERE id = ?", ['stf-' . $src['sourceCellId']]);
            }
            dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36), 'jstf-audit', '', date('Y-m-d'), '"' . ($jstf['title'] ?? $src['sourceCellId']) . '" — aSTF audit: ' . $verdict . ' (rubric ' . $total . '/30)', (string)($user['name'] ?? $user['initials'])]);
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
    $xId = 'xstf-' . base_convert(time(), 10, 36); $blind = isset($body->blind) ? ($body->blind ? 1 : 0) : 1;
    $deadline = trim((string)($body->deadline ?? '')) ?: date('Y-m-d', time() + 30 * 86400);
    $dSpecs = ['name' => (string)($specs->name ?? $title), 'description' => (string)($specs->description ?? ''), 'sections' => (int)($specs->sections ?? 4), 'wordCount' => (string)($specs->wordCount ?? 'TBD'), 'language' => (string)($specs->language ?? 'Plain English'), 'reviewProcess' => (string)($specs->reviewProcess ?? 'draft-circle-final')];
    $defTasks = [['id'=>'t0','label'=>'STF formulation','status'=>'pending','locked'=>true],['id'=>'t1','label'=>'Mandate comprehension','status'=>'pending','locked'=>false],['id'=>'t2','label'=>'Research & drafting','status'=>'pending','locked'=>false],['id'=>'t3','label'=>'Internal review','status'=>'pending','locked'=>false],['id'=>'t4','label'=>'Circle review cycle','status'=>'pending','locked'=>false],['id'=>'t5','label'=>'Finalisation','status'=>'pending','locked'=>false],['id'=>'t6','label'=>'Dissolve STF','status'=>'pending','locked'=>true]];
    $xs = ['type' => 'xstf-execution', 'astfId' => $afId, 'originCellId' => $as2['originCellId'] ?? null, 'circleName' => $as2['circleName'] ?? $af['circle'] ?? '', 'commissionedBy' => $user['name'] ?? $user['initials'], 'commissionedAt' => date('Y-m-d\TH:i:s.000\Z')];
    dbRun('INSERT INTO cells (id, type, title, status, participants, circle, blind, commissioned_by, source, resolution, meta, deliverable_specs, progress, deadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$xId, 'xSTF Cell', $title, 'Active', count($team) ?: 3, $xs['circleName'], $blind, $afId, json_encode($xs), json_encode(['status' => 'In Progress']), json_encode(['tasks' => $defTasks, 'objectives' => []]), json_encode($dSpecs), 0, $deadline]);
    foreach ($team as $t) dbRun('INSERT INTO cell_team (cell_id, name, initials, role) VALUES (?,?,?,?)', [$xId, (string)($t->name ?? ''), (string)($t->initials ?? ''), (string)($t->role ?? 'Team Member')]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $xId, 'xSTF', $title, $xs['circleName'], 'active', 'Active', $title, $deadline]);
    send(201, ['ok' => true, 'xstfId' => $xId]);
}
if (preg_match('/^\/cells\/([^\/]+)\/submit-deliverable$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'xSTF Cell') send(400, ['error' => 'Not an xSTF cell']);
    $body = readBody(); $title = trim((string)($body->title ?? '')); if (!$title) send(400, ['error' => 'title required']);
    $content = trim((string)($body->content ?? '')); $meta = pJson($cell['meta'] ?? '{}') ?: [];
    $dels = $meta['deliverables'] ?? [];
    $dels[] = ['id' => 'del-' . time(), 'title' => $title, 'content' => $content, 'submittedBy' => $user['name'] ?? $user['initials'], 'submittedAt' => date('Y-m-d\TH:i:s.000\Z'), 'status' => 'submitted'];
    $meta['deliverables'] = $dels; dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(201, ['ok' => true, 'deliverableId' => end($dels)['id']]);
}
if (preg_match('/^\/cells\/([^\/]+)\/review-deliverable$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
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
if (preg_match('/^\/cells\/([^\/]+)\/spawn-vstf$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $sc = dbGet("SELECT COUNT(*) AS n FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']]);
    if (!($sc['n'] ?? 0)) send(403, ['error' => 'Steward access required']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]); if (!$cell) send(404, ['error' => 'Not found']);
    $body = readBody(); $vt = trim((string)($body->vstfType ?? 'steward-candidacy'));
    if (!in_array($vt, ['steward-candidacy', 'competence-claim'])) send(400, ['error' => 'vstfType must be steward-candidacy or competence-claim']);
    $ex = dbGet("SELECT id FROM cells WHERE type = 'vSTF Cell' AND commissioned_by = ? AND delib_type = ?", [$cId, $vt]); if ($ex) send(409, ['error' => 'vSTF already spawned']);
    $cn = trim((string)($body->circleName ?? $cell['circle'] ?? '')); $ma = (int)($body->minAssessors ?? 3);
    $vId = 'vstf-' . base_convert(time(), 10, 36);
    $src = ['type' => $vt, 'candidateName' => trim((string)($body->candidateName ?? '')), 'candidateInitials' => trim((string)($body->candidateInitials ?? '')), 'circleName' => $cn, 'sourceCellId' => $cId, 'sourceTitle' => $cell['title'] ?? '', 'spawnedBy' => $user['name'] ?? $user['initials'], 'spawnedAt' => date('Y-m-d\TH:i:s.000\Z')];
    $domains = is_array($body->domains ?? null) ? $body->domains : [];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [$vId, 'vSTF Cell', ($vt === 'steward-candidacy' ? 'vSTF · Steward Candidacy · ' : 'vSTF · Competence · ') . $src['candidateName'], 'Pending Assessment', $vt, $ma, $cn, $cId, json_encode($src), json_encode(['status' => 'Pending', 'score' => null]), json_encode(['candidateName' => $src['candidateName'], 'candidateInitials' => $src['candidateInitials'], 'domains' => $domains, 'assessments' => []])]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $vId, 'vSTF', $vt === 'steward-candidacy' ? 'Steward Candidacy' : 'Competence Claims', $cn, 'active', 'Pending Assessment', $src['candidateName'] ?: $cell['title'] ?? '', date('Y-m-d', time() + 14 * 86400)]);
    send(201, ['ok' => true, 'vstfId' => $vId]);
}
if (preg_match('/^\/cells\/([^\/]+)\/vstf-assessment$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'vSTF Cell') send(400, ['error' => 'Not a vSTF cell']);
    if ($cell['status'] === 'Assessment Filed') send(409, ['error' => 'Assessment already filed']);
    $body = readBody(); $meta = pJson($cell['meta'] ?? '{}') ?: []; $assessments = $meta['assessments'] ?? [];
    foreach ($assessments as $a) { if (($a['assessor'] ?? '') === ($user['name'] ?? $user['initials'])) send(409, ['error' => 'You have already filed an assessment']); }
    $vt2 = $meta['type'] ?? (pJson($cell['source'] ?? '{}')['type'] ?? 'steward-candidacy');
    $ass = ['assessor' => $user['name'] ?? $user['initials'], 'filedAt' => date('Y-m-d\TH:i:s.000\Z')];
    if ($vt2 === 'steward-candidacy') { $score = min(100, max(0, (int)($body->score ?? 0))); $rat = trim((string)($body->rationale ?? '')); if (!$rat) send(400, ['error' => 'rationale required']); $ass['score'] = $score; $ass['rationale'] = $rat; }
    else { $ass['domainEvals'] = is_array($body->domainEvals ?? null) ? $body->domainEvals : []; $ass['comment'] = trim((string)($body->comment ?? '')); }
    $assessments[] = $ass; $meta['assessments'] = $assessments; $minA = $cell['participants'] ?? 3;
    if (count($assessments) >= $minA) {
        $fs = $vt2 === 'steward-candidacy' ? round(array_reduce($assessments, function($s, $a) { return $s + ($a['score'] ?? 0); }, 0) / count($assessments)) : count($assessments);
        dbRun("UPDATE cells SET status = 'Assessment Filed', meta = ?, resolution = ? WHERE id = ?", [json_encode($meta), json_encode(['status' => 'Complete', 'score' => $fs]), $cId]);
        $sr = dbGet("SELECT id FROM stfs WHERE type = 'vSTF' AND status = 'Pending Assessment'");
        if ($sr) dbRun("UPDATE stfs SET status = 'Completed', bucket = 'completed' WHERE id = ?", [$sr['id']]);
    } else dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(200, ['ok' => true, 'filed' => count($assessments), 'required' => $minA, 'complete' => count($assessments) >= $minA]);
}

// ═════════════════════════════════════════════════════════
// EVIDENCE ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/cells\/([^\/]+)\/evidence$/', $cleanPath, $m)) {
    $cId = urldecode($m[1]);
    if ($method === 'GET') { send(200, ['ok' => true, 'evidence' => dbAll('SELECT * FROM stf_evidence WHERE cell_id = ? ORDER BY id', [$cId])]); }
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
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]); if (!$cell) send(404, ['error' => 'Not found']);
    $ex = dbGet("SELECT id FROM cells WHERE type = 'p-aSTF Cell' AND commissioned_by = ?", [$cId]); if ($ex) send(409, ['error' => 'p-aSTF already spawned']);
    $body = readBody(); $cn = trim((string)($body->circleName ?? $cell['circle'] ?? '')); $mr = (int)($body->minReviewers ?? 3);
    $pId = 'pastf-' . base_convert(time(), 10, 36);
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
    send(200, ['ok' => true, 'filed' => count($reviews), 'required' => $minR, 'complete' => count($reviews) >= $minR, 'circleTotal' => $cTotal]);
}

// ═════════════════════════════════════════════════════════
// jSTF ROUTES
// ═════════════════════════════════════════════════════════
if (preg_match('/^\/jstf\/report$/', $cleanPath)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $body = readBody(); $tid = trim((string)($body->targetId ?? '')); $desc = trim((string)($body->description ?? ''));
    if (!$tid) send(400, ['error' => 'targetId required']); if (!$desc) send(400, ['error' => 'description required']);
    $target = dbGet('SELECT * FROM users WHERE id = ?', [$tid]); if (!$target) send(404, ['error' => 'Target member not found']);
    if ($tid === $user['id']) send(400, ['error' => 'Cannot report yourself']);
    $link = 'user:' . $tid;
    $ex = dbGet("SELECT * FROM threads WHERE proposal_cell_id = ? AND badge = 'b-judicial'", [$link]);
    if ($ex) {
        $rid = 'jstf-reply-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
        dbRun('INSERT INTO thread_replies (id, thread_id, author, initials, time, body, likes) VALUES (?,?,?,?,?,?,0)', [$rid, $ex['id'], 'Anonymous', '?', date('Y-m-d'), $desc]);
        dbRun('UPDATE threads SET replies = replies + 1 WHERE id = ?', [$ex['id']]);
        $rr = dbGet('SELECT replies FROM threads WHERE id = ?', [$ex['id']]);
        send(200, ['ok' => true, 'threadId' => $ex['id'], 'replies' => $rr['replies'] ?? 0, 'accumulated' => true]);
    }
    $thrId = 'thread-jstf-' . base_convert(time(), 10, 36);
    dbRun('INSERT INTO threads (id, title, body, author, initials, badge, badge_class, replies, likes, shares, time, visibility, proposal_cell_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [$thrId, 'Anonymous Report — ' . ($target['name'] ?? $target['initials']), $desc, 'Anonymous', '?', 'b-judicial', 'b-judicial', 1, 0, 0, date('Y-m-d'), 'stewards-only', $link]);
    send(201, ['ok' => true, 'threadId' => $thrId, 'replies' => 1, 'accumulated' => false]);
}
if (preg_match('/^\/jstf\/appeal$/', $cleanPath)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $body = readBody(); $cid = trim((string)($body->caseId ?? '')); $desc = trim((string)($body->description ?? ''));
    if (!$cid) send(400, ['error' => 'caseId required']); if (!$desc) send(400, ['error' => 'description required']);
    $cc = dbGet('SELECT * FROM cells WHERE id = ?', [$cid]); if (!$cc || $cc['type'] !== 'jSTF Cell') send(404, ['error' => 'Case not found']);
    $link = 'case:' . $cid;
    $ex = dbGet("SELECT * FROM threads WHERE proposal_cell_id = ? AND badge = 'b-judicial'", [$link]);
    if ($ex) {
        $rid = 'jstf-reply-' . base_convert(time(), 10, 36) . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
        dbRun('INSERT INTO thread_replies (id, thread_id, author, initials, time, body, likes) VALUES (?,?,?,?,?,?,0)', [$rid, $ex['id'], 'Anonymous', '?', date('Y-m-d'), $desc]);
        dbRun('UPDATE threads SET replies = replies + 1 WHERE id = ?', [$ex['id']]);
        $rr = dbGet('SELECT replies FROM threads WHERE id = ?', [$ex['id']]);
        send(200, ['ok' => true, 'threadId' => $ex['id'], 'replies' => $rr['replies'] ?? 0, 'accumulated' => true]);
    }
    $thrId = 'thread-appeal-' . base_convert(time(), 10, 36);
    dbRun('INSERT INTO threads (id, title, body, author, initials, badge, badge_class, replies, likes, shares, time, visibility, proposal_cell_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [$thrId, 'Appeal — ' . ($cc['title'] ?? $cid), $desc, 'Anonymous', '?', 'b-judicial', 'b-judicial', 1, 0, 0, date('Y-m-d'), 'stewards-only', $link]);
    send(201, ['ok' => true, 'threadId' => $thrId, 'replies' => 1, 'accumulated' => false]);
}
if (preg_match('/^\/jstf\/escalate$/', $cleanPath)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $thrId = trim((string)($body->threadId ?? '')); if (!$thrId) send(400, ['error' => 'threadId required']);
    $thread = dbGet('SELECT * FROM threads WHERE id = ?', [$thrId]); if (!$thread) send(404, ['error' => 'Thread not found']);
    if ($thread['jstf_cell_id']) send(409, ['error' => 'Thread already escalated']);
    $ppc = $thread['proposal_cell_id'] ?? '';
    if (!$ppc || (!str_starts_with($ppc, 'user:') && !str_starts_with($ppc, 'case:'))) send(400, ['error' => 'Thread is not a judicial thread']);
    $isAppeal = str_starts_with($ppc, 'case:'); $link2 = $ppc; $targetId = null;
    $targetName = preg_replace('/^(?:Anonymous Report|Appeal) — /', '', $thread['title']);
    if ($isAppeal) {
        $oid = substr($link2, 5); $orig = dbGet('SELECT * FROM cells WHERE id = ?', [$oid]);
        if (!$orig) send(404, ['error' => 'Original case not found']);
        $om = pJson($orig['meta'] ?? '{}') ?: []; $targetId = $om['targetId'] ?? null; $targetName = $om['targetName'] ?? $orig['title'] ?? $targetName;
    } else { $targetId = substr($link2, 5); $tgt = dbGet('SELECT * FROM users WHERE id = ?', [$targetId]); if ($tgt) $targetName = $tgt['name'] ?? $tgt['initials']; }
    $jId = 'jstf-' . base_convert(time(), 10, 36);
    $stewards = dbAll("SELECT DISTINCT r.member_id AS id, r.name, r.initials FROM circle_roster r JOIN users u ON u.id = r.member_id WHERE r.status = 'active' ORDER BY r.name LIMIT 3");
    $team = $stewards;
    if (!array_reduce($team, function($c, $t) use ($user) { return $c || $t['id'] === $user['id']; }, false))
        $team = array_values(array_slice(array_merge([['id' => $user['id'], 'name' => $user['name'], 'initials' => $user['initials']]], $stewards), 0, 3));
    $tIs = $targetId ? !!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$targetId]) : false;
    $src = ['type' => 'judicial-investigation', 'threadId' => $thrId, 'isAppeal' => $isAppeal, 'targetId' => $targetId, 'targetName' => $targetName, 'escalatedBy' => $user['name'] ?? $user['initials'], 'escalatedAt' => date('Y-m-d\TH:i:s.000\Z'), 'revisionOf' => $isAppeal ? substr($link2, 5) : null, 'team' => array_map(function($t) { return ['id' => $t['id'], 'name' => $t['name'], 'initials' => $t['initials']]; }, $team)];
    $meta = ['targetId' => $targetId, 'targetName' => $targetName, 'threadId' => $thrId, 'isAppeal' => $isAppeal, 'targetIsSteward' => $tIs, 'revisionOf' => $src['revisionOf'], 'restriction' => ['state' => 'relaxed', 'restrictCount' => 0, 'teamSize' => count($team), 'majority' => (int)floor(count($team) / 2) + 1, 'severity' => null, 'history' => []], 'verdict' => null];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [$jId, 'jSTF Cell', 'jSTF — ' . $targetName, 'Under Investigation', 'judicial-investigation', count($team), '', $user['id'], json_encode($src), json_encode(['status' => 'Under Investigation']), json_encode($meta)]);
    foreach ($team as $i => $t) dbRun('INSERT INTO cell_team (cell_id, name, initials, role, focus) VALUES (?,?,?,?,?)', [$jId, $t['name'], $t['initials'], $i === 0 ? 'Lead investigator' : 'Investigator', 'Judicial review']);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $jId, 'jSTF', 'Judicial Investigation', $targetName ?: '', 'active', 'Under Investigation', 'jSTF — ' . $targetName, date('Y-m-d', time() + 30 * 86400)]);
    dbRun('UPDATE threads SET jstf_cell_id = ? WHERE id = ?', [$jId, $thrId]);
    dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36), 'jstf-escalation', '', date('Y-m-d'), 'jSTF opened against ' . $targetName . ' (' . ($isAppeal ? 'appeal' : 'report') . ') — ' . count($team) . ' investigators', (string)($user['name'] ?? $user['initials'])]);
    send(201, ['ok' => true, 'jstfId' => $jId]);
}
if (preg_match('/^\/cells\/([^\/]+)\/jstf-vote$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    if ($cell['status'] !== 'Under Investigation') send(400, ['error' => 'Not under investigation']);
    if (!dbGet('SELECT 1 FROM cell_team WHERE cell_id = ? AND initials = ?', [$cId, $user['initials']])) send(403, ['error' => 'Only the jSTF team may vote']);
    $body = readBody(); $stance = trim((string)($body->stance ?? ''));
    if (!in_array($stance, ['restrict', 'lift'])) send(400, ['error' => 'stance must be restrict or lift']);
    $ts = $cell['participants'] ?? (int)(dbGet('SELECT COUNT(*) AS n FROM cell_team WHERE cell_id = ?', [$cId])['n'] ?? 0);
    $maj = (int)floor($ts / 2) + 1;
    dbRun("DELETE FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND initials = ?", [$cId, $user['initials']]);
    dbRun("INSERT INTO vote_records (cell_id, domain, name, initials, vote) VALUES (?,?,?,?,?)", [$cId, 'restriction', $user['name'] ?? $user['initials'], $user['initials'], $stance]);
    $rc = (int)(dbGet("SELECT COUNT(*) AS n FROM vote_records WHERE cell_id = ? AND domain = 'restriction' AND vote = 'restrict'", [$cId])['n'] ?? 0);
    $restricted = $rc >= $maj;
    $meta = pJson($cell['meta'] ?? '{}') ?: [];
    $cur = $meta['restriction'] ?? ['state' => 'relaxed', 'restrictCount' => 0, 'teamSize' => $ts, 'majority' => $maj, 'severity' => null, 'history' => []];
    $sev = $restricted ? ((!empty($meta['targetIsSteward']) && $rc < $ts) ? 'frozen' : 'readonly') : null;
    $newState = $restricted ? 'restricted' : 'relaxed'; $changed = ($cur['state'] !== $newState);
    $votes = dbAll("SELECT name, initials, vote FROM vote_records WHERE cell_id = ? AND domain = 'restriction'", [$cId]);
    if ($changed) { $cur['history'] = $cur['history'] ?? []; $cur['history'][] = ['prev' => $cur['state'], 'next' => $newState, 'at' => date('Y-m-d\TH:i:s.000\Z'), 'votedBy' => $user['name'] ?? $user['initials']]; }
    $cur['state'] = $newState; $cur['restrictCount'] = $rc; $cur['teamSize'] = $ts; $cur['majority'] = $maj;
    if ($sev) $cur['severity'] = $sev; $cur['votes'] = $votes; $meta['restriction'] = $cur;
    if ($changed) dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36), 'jstf-restriction', '', date('Y-m-d'), ($meta['targetName'] ?? 'target') . ' activity ' . $cur['state'] . ' (' . $rc . '/' . $ts . ' → ' . $sev . ')', (string)($user['name'] ?? $user['initials'])]);
    dbRun('UPDATE cells SET meta = ? WHERE id = ?', [json_encode($meta), $cId]);
    send(200, ['ok' => true, 'state' => $cur['state'], 'restrictCount' => $rc, 'teamSize' => $ts, 'majority' => $maj, 'severity' => $cur['severity'], 'changed' => $changed]);
}
if (preg_match('/^\/cells\/([^\/]+)\/jstf-verdict$/', $cleanPath, $m)) {
    if ($method !== 'POST') send(405, ['error' => 'Method not allowed']);
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $cId = urldecode($m[1]); $cell = dbGet('SELECT * FROM cells WHERE id = ?', [$cId]);
    if (!$cell) send(404, ['error' => 'Not found']); if ($cell['type'] !== 'jSTF Cell') send(400, ['error' => 'Not a jSTF cell']);
    $meta = pJson($cell['meta'] ?? '{}') ?: []; if ($meta['verdict']) send(409, ['error' => 'Verdict already filed']);
    if ($cell['status'] !== 'Under Investigation') send(400, ['error' => 'Not under investigation']);
    $body = readBody(); $type = trim((string)($body->type ?? '')); $desc = trim((string)($body->description ?? ''));
    $pRefs = is_array($body->policyRefs ?? null) ? $body->policyRefs : []; $findings = trim((string)($body->findings ?? ''));
    if (!in_array($type, ['system-bound', 'policy-cited'])) send(400, ['error' => 'type must be system-bound or policy-cited']);
    if (!$desc) send(400, ['error' => 'description required']);
    $meta['verdict'] = ['type' => $type, 'description' => $desc, 'policyRefs' => array_map('strval', $pRefs), 'findings' => $findings, 'filedBy' => $user['name'] ?? $user['initials'], 'filedAt' => date('Y-m-d\TH:i:s.000\Z')];
    $src = pJson($cell['source'] ?? '{}') ?: []; $src['verdict'] = $meta['verdict'];
    dbRun("UPDATE cells SET status = 'Finalised', meta = ?, source = ? WHERE id = ?", [json_encode($meta), json_encode($src), $cId]);
    $aId = 'astf-audit-' . base_convert(time(), 10, 36);
    $aSrc = ['type' => 'judicial-audit', 'sourceCellId' => $cId, 'sourceTitle' => 'jSTF Disciplinary Verdict', 'targetId' => $meta['targetId'], 'targetName' => $meta['targetName'], 'verdict' => ['type' => $type, 'description' => $desc, 'policyRefs' => $meta['verdict']['policyRefs'], 'findings' => $findings]];
    dbRun('INSERT INTO cells (id, type, title, status, delib_type, participants, circle, commissioned_by, source, resolution, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [$aId, 'aSTF Cell', 'aSTF Audit — ' . ($meta['targetName'] ?? ''), 'Blind Review', 'judicial-audit', 1, '', $cId, json_encode($aSrc), json_encode(['status' => 'Pending']), json_encode(['blind' => 1, 'targetName' => $meta['targetName'], 'verdict' => $meta['verdict']])]);
    dbRun('INSERT INTO stfs (id, type, purpose, circle, bucket, status, title, deadline) VALUES (?,?,?,?,?,?,?,?)', ['stf-' . $aId, 'aSTF', 'Judicial Audit', $meta['targetName'] ?? '', 'active', 'Blind Review', 'aSTF Audit — ' . ($meta['targetName'] ?? ''), date('Y-m-d', time() + 30 * 86400)]);
    dbRun('UPDATE cells SET resolution_ref = ? WHERE id = ?', [$aId, $cId]);
    dbRun("UPDATE stfs SET status = 'Finalised', bucket = 'completed' WHERE id = ?", ['stf-' . $cId]);
    dbRun('INSERT INTO governance_events (id, type, circle, date, text, participant) VALUES (?,?,?,?,?,?)', ['evt-jstf-' . base_convert(time(), 10, 36), 'jstf-verdict', '', date('Y-m-d'), 'jSTF verdict filed vs ' . ($meta['targetName'] ?? '') . ' — ' . $type . ' (' . count($pRefs) . ' policies cited)', (string)($user['name'] ?? $user['initials'])]);
    send(200, ['ok' => true, 'jstfId' => $cId, 'astfId' => $aId, 'type' => $type]);
}

// ═════════════════════════════════════════════════════════
// MEMBERSHIP ROUTES
// ═════════════════════════════════════════════════════════
function markFormer($rosterId, $reason) {
    dbRun("UPDATE circle_roster SET status = 'former', left = ?, left_reason = ? WHERE id = ?", [date('Y-m-d'), $reason, $rosterId]);
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
if ($cleanPath === '/observatory/organisations' && $method === 'POST') {
    $user = authUser(); if (!$user) send(401, ['error' => 'Unauthorized']);
    if (!dbGet("SELECT 1 FROM circle_roster WHERE member_id = ? AND status = 'active'", [$user['id']])) send(403, ['error' => 'Steward access required']);
    $body = readBody(); $name = trim((string)($body->name ?? '')); if (!$name) send(400, ['error' => 'name required']);
    $id = 'org-' . base_convert(time(), 10, 36);
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
