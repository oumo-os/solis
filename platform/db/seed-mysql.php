<?php
/**
 * seed-mysql.php — Create tables + seed data from mock.json into MySQL/MariaDB.
 *
 * Usage:  php db/seed-mysql.php          (from platform/ directory)
 *         php db/seed-mysql.php --drop   (drop & recreate everything)
 *
 * Requires XAMPP MySQL running on localhost:3306, user root, no password.
 */

$DB_HOST = 'localhost';
$DB_PORT = 3306;
$DB_USER = 'root';
$DB_PASS = '';
$DB_NAME = 'solis';
$MOCK_PATH = __DIR__ . '/../mock.json';

$drop = in_array('--drop', $argv);

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function j($v) {
    return $v === null ? null : json_encode($v);
}

function hashPassword($pw) {
    return password_hash((string)$pw, PASSWORD_BCRYPT);
}

/**
 * Upsert: INSERT ... ON DUPLICATE KEY UPDATE for each row.
 */
function upsert(mysqli $db, string $table, array $rows, array $cols): void {
    if (empty($rows)) return;
    $colList = implode(', ', array_map(fn($c) => "`$c`", $cols));
    $placeholders = implode(',', array_fill(0, count($cols), '?'));
    $updates = [];
    foreach ($cols as $c) {
        if ($c !== 'id') {
            $updates[] = "`$c` = VALUES(`$c`)";
        }
    }
    $updateClause = $updates ? implode(', ', $updates) : '`id` = `id`';
    $sql = "INSERT INTO `$table` ($colList) VALUES ($placeholders) ON DUPLICATE KEY UPDATE $updateClause";
    $stmt = $db->prepare($sql);
    if (!$stmt) return;
    foreach ($rows as $row) {
        $vals = [];
        foreach ($cols as $c) {
            $v = $row[$c] ?? null;
            if (is_bool($v)) $v = $v ? 1 : 0;
            if (is_array($v)) $v = json_encode($v);
            $vals[] = $v;
        }
        $stmt->bind_param(str_repeat('s', count($vals)), ...$vals);
        $stmt->execute();
    }
    $stmt->close();
}

/**
 * Raw insert: INSERT INTO (for auto-increment tables).
 */
function insert(mysqli $db, string $table, array $rows, array $cols): void {
    if (empty($rows)) return;
    $colList = implode(', ', array_map(fn($c) => "`$c`", $cols));
    $placeholders = implode(',', array_fill(0, count($cols), '?'));
    $sql = "INSERT INTO `$table` ($colList) VALUES ($placeholders)";
    $stmt = $db->prepare($sql);
    if (!$stmt) return;
    foreach ($rows as $row) {
        $vals = [];
        foreach ($cols as $c) {
            $v = $row[$c] ?? null;
            if (is_bool($v)) $v = $v ? 1 : 0;
            if (is_array($v)) $v = json_encode($v);
            $vals[] = $v;
        }
        $stmt->bind_param(str_repeat('s', count($vals)), ...$vals);
        $stmt->execute();
    }
    $stmt->close();
}

// ═══════════════════════════════════════════════════════════════
// Table definitions — MariaDB-compatible DDL
// ═══════════════════════════════════════════════════════════════

$TABLES = [
    // ── IDENTITY ──
    "CREATE TABLE IF NOT EXISTS `users` (
        `id` VARCHAR(255) PRIMARY KEY, `name` VARCHAR(255) NOT NULL, `initials` VARCHAR(10),
        `email` VARCHAR(255) UNIQUE, `location` TEXT, `joined` TEXT, `status` TEXT,
        `standing` INT, `standing_drift` TEXT, `competence` INT, `competence_note` TEXT,
        `interest_score` INT, `interest_drift` TEXT, `active_roles` INT, `roles_breakdown` TEXT,
        `bio` TEXT, `essay` TEXT, `avatar` TEXT, `is_current` INT DEFAULT 0,
        `password_hash` TEXT, `failed_attempts` INT DEFAULT 0, `created_at` TEXT DEFAULT (NOW())
    )",

    "CREATE TABLE IF NOT EXISTS `user_competence` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `user_id` VARCHAR(255) NOT NULL, `domain` VARCHAR(255) NOT NULL,
        `ws` INT, `wh` INT, `interest` INT, `bar_ws` INT, `bar_wh` INT, `members` INT, `color` TEXT,
        `rank` INT, `kind` TEXT DEFAULT 'roster', `evidence` TEXT, `verified` INT DEFAULT 0,
        UNIQUE(`user_id`, `domain`)
    )",

    "CREATE TABLE IF NOT EXISTS `user_circles` (
        `user_id` VARCHAR(255) NOT NULL, `circle` VARCHAR(255) NOT NULL, `status` TEXT, `since` TEXT,
        `kind` TEXT DEFAULT 'roster', PRIMARY KEY (`user_id`, `circle`)
    )",

    "CREATE TABLE IF NOT EXISTS `user_orgs` (
        `user_id` VARCHAR(255) NOT NULL, `org_acronym` VARCHAR(255) NOT NULL, PRIMARY KEY (`user_id`, `org_acronym`)
    )",

    "CREATE TABLE IF NOT EXISTS `participants` (
        `user_id` VARCHAR(255) PRIMARY KEY, `location` TEXT, `joined` TEXT, `bio` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `user_activity` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `user_id` VARCHAR(255) NOT NULL,
        `seq` INT NOT NULL DEFAULT 0, `text` TEXT, `time` TEXT, `type` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `domains` (
        `id` VARCHAR(255) PRIMARY KEY, `label` TEXT, `short` TEXT, `color` TEXT,
        `has_circle` INT DEFAULT 0, `type` TEXT, `taxonomy` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `domain_layout` (
        `domain_id` VARCHAR(255) PRIMARY KEY, `x` INT, `y` INT
    )",

    "CREATE TABLE IF NOT EXISTS `organisations` (
        `id` VARCHAR(255) PRIMARY KEY, `name` TEXT, `acronym` TEXT, `shortname` TEXT,
        `location` TEXT, `summary` TEXT, `status` TEXT, `founded` TEXT, `founding_cell` TEXT,
        `member_count` INT, `website` TEXT, `logo` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `org_knowledge_domains` (
        `org_id` VARCHAR(255) NOT NULL, `domain` VARCHAR(255) NOT NULL, PRIMARY KEY (`org_id`, `domain`)
    )",

    // ── CIRCLES ──
    "CREATE TABLE IF NOT EXISTS `circles` (
        `id` VARCHAR(255) PRIMARY KEY, `name` TEXT, `status` TEXT, `members` INT, `motions` INT,
        `description` TEXT, `founded` TEXT, `term_override` TEXT, `expiry_override` TEXT, `meta` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `circle_domains` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `circle_id` VARCHAR(255) NOT NULL, `domain` VARCHAR(255) NOT NULL,
        `mandate` TEXT, `desired_ws` INT, UNIQUE(`circle_id`, `domain`, `mandate`)
    )",

    "CREATE TABLE IF NOT EXISTS `circle_roster` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `circle_id` VARCHAR(255) NOT NULL, `member_id` VARCHAR(255) NOT NULL,
        `name` TEXT, `initials` TEXT, `color` TEXT, `ws` INT, `status` TEXT, `joined` TEXT,
        `last_active` TEXT, `left` TEXT, `left_reason` TEXT, `top_domain` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `circle_roster_domains` (
        `roster_id` INT NOT NULL, `domain` VARCHAR(255) NOT NULL, `ws` INT, PRIMARY KEY (`roster_id`, `domain`)
    )",

    "CREATE TABLE IF NOT EXISTS `circle_proposals` (
        `id` VARCHAR(255) NOT NULL, `circle_id` VARCHAR(255) NOT NULL, `title` TEXT, `status` TEXT, `date` TEXT,
        PRIMARY KEY (`id`, `circle_id`)
    )",

    "CREATE TABLE IF NOT EXISTS `circle_resolutions` (
        `id` VARCHAR(255) NOT NULL, `circle_id` VARCHAR(255) NOT NULL, `title` TEXT, `date` TEXT, `type` TEXT,
        PRIMARY KEY (`id`, `circle_id`)
    )",

    "CREATE TABLE IF NOT EXISTS `circle_activity` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `circle_id` VARCHAR(255) NOT NULL, `text` TEXT, `time` TEXT, `type` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `exit_reason_labels` (
        `key` VARCHAR(255) PRIMARY KEY, `label` TEXT
    )",

    // ── CELLS ──
    "CREATE TABLE IF NOT EXISTS `cells` (
        `id` VARCHAR(255) PRIMARY KEY, `type` TEXT, `title` TEXT, `status` TEXT, `delib_type` TEXT,
        `participants` INT, `members` INT, `progress` INT, `days_active` INT, `lead` TEXT, `circle` TEXT,
        `created` TEXT, `deadline` TEXT, `blind` INT DEFAULT 0, `assessors` INT, `commissioned_by` TEXT,
        `resolution_ref` TEXT, `entity_type` TEXT, `source` TEXT, `resolution` TEXT,
        `deliverable_specs` TEXT, `meta` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `cell_domains` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL, `domain` VARCHAR(255) NOT NULL,
        UNIQUE(`cell_id`, `domain`)
    )",

    "CREATE TABLE IF NOT EXISTS `cell_circles` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL, `circle_id` TEXT,
        `name` TEXT, `initials` TEXT, `gradient` TEXT, `status` TEXT, `role` TEXT, `votes` INT
    )",

    "CREATE TABLE IF NOT EXISTS `cell_messages` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL,
        `author` TEXT, `initials` TEXT, `text` TEXT, `time` TEXT, `color` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `cell_tasks` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL,
        `task_id` TEXT, `label` TEXT, `status` TEXT, `locked` INT DEFAULT 0, `assignee` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `cell_objectives` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL,
        `obj_id` TEXT, `label` TEXT, `status` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `cell_team` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL,
        `name` TEXT, `initials` TEXT, `role` TEXT, `focus` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `draft_resolutions` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL,
        `res_id` INT, `title` TEXT, `text` TEXT, `action` TEXT,
        `votes_nullified` INT DEFAULT 0, `status` TEXT DEFAULT 'draft',
        UNIQUE(`cell_id`, `res_id`)
    )",

    "CREATE TABLE IF NOT EXISTS `resolution_versions` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `draft_id` INT NOT NULL,
        `title` TEXT, `text` TEXT, `action` TEXT, `author` TEXT, `ts` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `resolution_implementing_circles` (
        `draft_id` INT NOT NULL, `circle_name` VARCHAR(255) NOT NULL, PRIMARY KEY (`draft_id`, `circle_name`)
    )",

    "CREATE TABLE IF NOT EXISTS `cell_votes` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL, `domain` VARCHAR(255) NOT NULL,
        `yea` INT, `nay` INT, `total` INT, UNIQUE(`cell_id`, `domain`)
    )",

    "CREATE TABLE IF NOT EXISTS `vote_records` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL, `domain` VARCHAR(255) NOT NULL,
        `name` TEXT, `initials` TEXT, `ws` INT, `vote` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `cell_vote_summary` (
        `cell_id` VARCHAR(255) PRIMARY KEY, `summary` TEXT
    )",

    // ── STFs ──
    "CREATE TABLE IF NOT EXISTS `stfs` (
        `id` VARCHAR(255) PRIMARY KEY, `type` TEXT, `purpose` TEXT, `title` TEXT,
        `circle` TEXT, `deadline` TEXT, `status` TEXT, `bucket` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `stf_candidates` (
        `id` VARCHAR(255) PRIMARY KEY, `stf_id` VARCHAR(255) NOT NULL, `name` TEXT, `initials` TEXT,
        `match_score` INT, `interest_score` INT, `competence_score` INT, `status` TEXT, `invited_date` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `stf_candidate_domains` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `candidate_id` VARCHAR(255) NOT NULL,
        `domain` VARCHAR(255) NOT NULL, UNIQUE(`candidate_id`, `domain`)
    )",

    "CREATE TABLE IF NOT EXISTS `stf_evidence` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `cell_id` VARCHAR(255) NOT NULL,
        `candidate` TEXT, `title` TEXT NOT NULL, `detail` TEXT, `link` TEXT,
        `status` TEXT DEFAULT 'pending', `submitted_by` TEXT, `submitted_at` TEXT
    )",

    // ── THREADS / INBOX / PUBLICATIONS / NEWS / EVENTS ──
    "CREATE TABLE IF NOT EXISTS `threads` (
        `id` VARCHAR(255) PRIMARY KEY, `title` TEXT, `body` TEXT, `author` TEXT, `initials` TEXT,
        `avatar` TEXT, `domain` TEXT, `domain_color` TEXT, `badge` TEXT, `badge_class` TEXT,
        `replies` INT, `likes` INT, `shares` INT, `time` TEXT, `pinned` INT DEFAULT 0,
        `endorsements` INT DEFAULT 0, `proposal_cell_id` TEXT, `visibility` TEXT DEFAULT 'public',
        `jstf_cell_id` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `thread_endorsements` (
        `user_id` VARCHAR(255) NOT NULL, `thread_id` VARCHAR(255) NOT NULL,
        `created_at` TEXT DEFAULT (NOW()), PRIMARY KEY (`user_id`, `thread_id`)
    )",

    "CREATE TABLE IF NOT EXISTS `thread_bookmarks` (
        `user_id` VARCHAR(255) NOT NULL, `thread_id` VARCHAR(255) NOT NULL,
        `created_at` TEXT DEFAULT (NOW()), PRIMARY KEY (`user_id`, `thread_id`)
    )",

    "CREATE TABLE IF NOT EXISTS `thread_replies` (
        `id` VARCHAR(255) PRIMARY KEY, `thread_id` VARCHAR(255) NOT NULL,
        `author` TEXT, `initials` TEXT, `avatar` TEXT, `time` TEXT, `body` TEXT, `likes` INT DEFAULT 0
    )",

    "CREATE TABLE IF NOT EXISTS `inbox` (
        `id` VARCHAR(255) PRIMARY KEY, `type` TEXT, `title` TEXT, `desc` TEXT,
        `time` TEXT, `badge` TEXT, `unread` INT DEFAULT 1, `detail` TEXT, `nav` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `inbox_actions` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `inbox_id` VARCHAR(255) NOT NULL,
        `label` TEXT, `style` TEXT, `action` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `inbox_meta` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `inbox_id` VARCHAR(255) NOT NULL, `label` TEXT, `value` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `publications` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `title` TEXT, `journal` TEXT, `date` TEXT,
        `views` INT, `downloads` INT, `type` TEXT, `abstract` TEXT, `tags` TEXT, `domain` TEXT,
        `status` TEXT DEFAULT 'approved', `author` TEXT, `created_at` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `publication_authors` (
        `publication_id` INT NOT NULL, `author` VARCHAR(255) NOT NULL, PRIMARY KEY (`publication_id`, `author`)
    )",

    "CREATE TABLE IF NOT EXISTS `library_items` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `title` TEXT, `category` TEXT, `item_type` TEXT,
        `domain` TEXT, `link` TEXT, `curated_by` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `news` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `title` TEXT, `time` TEXT, `source` TEXT,
        `domain` TEXT, `body` TEXT, `curated_by` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `events` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `title` TEXT, `date` TEXT, `location` TEXT,
        `domain` TEXT, `type` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `opportunities` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `title` TEXT, `deadline` TEXT, `type` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `projects` (
        `id` VARCHAR(255) PRIMARY KEY, `title` TEXT, `lead` TEXT, `progress` INT, `role` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `project_domains` (
        `project_id` VARCHAR(255) NOT NULL, `domain` VARCHAR(255) NOT NULL, PRIMARY KEY (`project_id`, `domain`)
    )",

    // ── CONFIG & MISC ──
    "CREATE TABLE IF NOT EXISTS `system_settings` (
        `id` INT PRIMARY KEY, `steward_term_months` INT, `max_consecutive_terms` INT,
        `cooloff_months` INT, `p_astf_cycle_months` INT, `auto_expire_circles` INT DEFAULT 0,
        `default_circle_expiry_months` INT
    )",

    "CREATE TABLE IF NOT EXISTS `stats` (
        `id` INT PRIMARY KEY, `stats` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `registration_domains` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `name` TEXT, `type` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `registration_meta` (
        `id` INT PRIMARY KEY, `elo_map` TEXT, `knowledge_levels` TEXT,
        `experiential_levels` TEXT, `default_interests` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `integrity_records` (
        `id` VARCHAR(255) PRIMARY KEY, `type` TEXT, `subject` TEXT, `purpose` TEXT,
        `circle` TEXT, `date` TEXT, `verdict` TEXT, `text` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `governance_events` (
        `id` VARCHAR(255) PRIMARY KEY, `type` TEXT, `circle` TEXT, `date` TEXT,
        `text` TEXT, `participant` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `circle_applications` (
        `id` VARCHAR(255) PRIMARY KEY, `circle_id` TEXT, `circle_name` TEXT, `applicant` TEXT,
        `initials` TEXT, `motivation` TEXT, `status` TEXT, `applied_date` TEXT, `queue_position` INT
    )",

    "CREATE TABLE IF NOT EXISTS `circle_application_domains` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `app_id` VARCHAR(255) NOT NULL,
        `domain` VARCHAR(255) NOT NULL, UNIQUE(`app_id`, `domain`)
    )",

    "CREATE TABLE IF NOT EXISTS `project_applications` (
        `id` VARCHAR(255) PRIMARY KEY, `cell_id` TEXT, `project_name` TEXT, `applicant` TEXT,
        `initials` TEXT, `motivation` TEXT, `status` TEXT, `applied_date` TEXT, `proposed_role` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `governance_ledger` (
        `id` VARCHAR(255) PRIMARY KEY, `type` TEXT, `target` TEXT, `settings` TEXT,
        `applied_by` TEXT, `applied_at` TEXT, `status` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `domain_layout_meta` (
        `id` INT PRIMARY KEY, `world_size` INT, `seeds` TEXT, `camera` TEXT
    )",

    "CREATE TABLE IF NOT EXISTS `auth_tokens` (
        `id` INT AUTO_INCREMENT PRIMARY KEY, `user_id` VARCHAR(255) NOT NULL,
        `token` VARCHAR(255) NOT NULL UNIQUE, `expires_at` TEXT NOT NULL,
        `created_at` TEXT DEFAULT (NOW())
    )",
];

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

echo "Connecting to MySQL at $DB_HOST:$DB_PORT..." . PHP_EOL;

$db = new mysqli($DB_HOST, $DB_USER, $DB_PASS, null, $DB_PORT);
if ($db->connect_error) {
    die("Connection failed: " . $db->connect_error . "\n");
}
$db->set_charset('utf8mb4');

if ($drop) {
    echo "  Dropping database \"$DB_NAME\"…\n";
    $db->query("DROP DATABASE IF EXISTS `$DB_NAME`");
}

$db->query("CREATE DATABASE IF NOT EXISTS `$DB_NAME` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$db->select_db($DB_NAME);
echo "  ✓ Database \"$DB_NAME\" ready\n";

// Create tables
echo "  Creating " . count($TABLES) . " tables…\n";
$created = 0;
foreach ($TABLES as $ddl) {
    if ($db->query($ddl)) {
        $created++;
    }
}
echo "  ✓ $created tables created\n";

// Load mock data
echo "  Loading mock.json…\n";
$mock = json_decode(file_get_contents($MOCK_PATH), true);
if (!$mock) {
    die("  ✗ Failed to load mock.json\n");
}

// ═══════════════════════════════════════════════════════════════
// Seed data
// ═══════════════════════════════════════════════════════════════

// Users
$users = $mock['participants'] ?? [];
$userRows = array_map(fn($u) => [
    'id' => $u['id'], 'name' => $u['name'], 'initials' => $u['initials'],
    'email' => strtolower($u['id'] ?? '') . '@solis.local',
    'location' => $u['location'] ?? null, 'joined' => $u['joined'] ?? null,
    'status' => $u['status'] ?? 'Active', 'standing' => $u['standing'] ?? null,
    'competence' => $u['competence'] ?? null, 'bio' => $u['bio'] ?? null,
    'essay' => $u['essay'] ?? null, 'avatar' => j($u['avatar'] ?? null),
    'is_current' => ($u['is_current'] ?? false) ? 1 : 0,
    'password_hash' => hashPassword('solis123'),
], $users);
upsert($db, 'users', $userRows, ['id','name','initials','email','location','joined','status','standing','competence','bio','essay','avatar','is_current','password_hash']);

// Participants (directory cards)
$partRows = array_map(fn($u) => [
    'user_id' => $u['id'], 'location' => $u['location'] ?? null,
    'joined' => $u['joined'] ?? null, 'bio' => $u['bio'] ?? null,
], $users);
insert($db, 'participants', $partRows, ['user_id','location','joined','bio']);

// Domains
$domains = $mock['domains'] ?? [];
$domainRows = [];
foreach ($domains as $id => $d) {
    $domainRows[] = [
        'id' => $id, 'label' => $d['label'] ?? $id, 'short' => $d['short'] ?? null,
        'color' => $d['color'] ?? null, 'has_circle' => ($d['has_circle'] ?? false) ? 1 : 0,
        'type' => $d['type'] ?? null, 'taxonomy' => $d['taxonomy'] ?? null,
    ];
}
upsert($db, 'domains', $domainRows, ['id','label','short','color','has_circle','type','taxonomy']);

// Organisations
$orgs = array_map(fn($o) => [
    'id' => $o['id'], 'name' => $o['name'] ?? null, 'acronym' => $o['acronym'] ?? null,
    'shortname' => $o['shortname'] ?? null, 'location' => $o['location'] ?? null,
    'summary' => $o['summary'] ?? null, 'status' => $o['status'] ?? null,
    'founded' => $o['founded'] ?? null, 'founding_cell' => $o['founding_cell'] ?? null,
    'member_count' => $o['member_count'] ?? null, 'website' => $o['website'] ?? null,
    'logo' => j($o['logo'] ?? null),
], $mock['organisations'] ?? []);
upsert($db, 'organisations', $orgs, ['id','name','acronym','shortname','location','summary','status','founded','founding_cell','member_count','website','logo']);

// Circles
$circles = $mock['circles'] ?? [];
$circRows = array_map(fn($c) => [
    'id' => $c['id'], 'name' => $c['name'] ?? null, 'status' => $c['status'] ?? null,
    'members' => $c['members'] ?? null, 'motions' => $c['motions'] ?? null,
    'description' => $c['description'] ?? null, 'founded' => $c['founded'] ?? null,
    'meta' => j($c['meta'] ?? null),
], $circles);
upsert($db, 'circles', $circRows, ['id','name','status','members','motions','description','founded','meta']);

// Circle domains
foreach ($circles as $c) {
    if (!empty($c['domains']) && is_array($c['domains'])) {
        $cdRows = array_map(fn($d) => [
            'circle_id' => $c['id'],
            'domain' => is_string($d) ? $d : ($d['domain'] ?? null),
            'mandate' => is_array($d) ? ($d['mandate'] ?? null) : null,
        ], $c['domains']);
        insert($db, 'circle_domains', $cdRows, ['circle_id','domain','mandate']);
    }
}

// Circle roster
foreach ($circles as $c) {
    if (!empty($c['roster'])) {
        $roster = is_array($c['roster']) && !isset($c['roster']['active'])
            ? $c['roster']
            : array_merge($c['roster']['active'] ?? [], $c['roster']['former'] ?? []);
        $rosterRows = array_map(fn($r) => [
            'circle_id' => $c['id'], 'member_id' => $r['member_id'] ?? $r['id'] ?? null,
            'name' => $r['name'] ?? null, 'initials' => $r['initials'] ?? null,
            'color' => $r['color'] ?? null, 'ws' => $r['ws'] ?? null,
            'status' => $r['status'] ?? null, 'joined' => $r['joined'] ?? null,
            'last_active' => $r['lastActive'] ?? $r['last_active'] ?? null,
            'top_domain' => $r['topDomain'] ?? $r['top_domain'] ?? null,
        ], $roster);
        insert($db, 'circle_roster', $rosterRows, ['circle_id','member_id','name','initials','color','ws','status','joined','last_active','top_domain']);
    }
}

// Cells
$cells = $mock['cells'] ?? [];
$cellRows = array_map(fn($c) => [
    'id' => $c['id'], 'type' => $c['type'] ?? null, 'title' => $c['title'] ?? null,
    'status' => $c['status'] ?? null, 'delib_type' => $c['delib_type'] ?? null,
    'participants' => $c['participants'] ?? null, 'members' => $c['members'] ?? null,
    'progress' => $c['progress'] ?? null, 'days_active' => $c['days_active'] ?? null,
    'lead' => $c['lead'] ?? null, 'circle' => $c['circle'] ?? null,
    'created' => $c['created'] ?? null, 'deadline' => $c['deadline'] ?? null,
    'blind' => ($c['blind'] ?? false) ? 1 : 0, 'assessors' => $c['assessors'] ?? null,
    'commissioned_by' => $c['commissioned_by'] ?? null, 'resolution_ref' => $c['resolution_ref'] ?? null,
    'source' => j($c['source'] ?? null), 'resolution' => j($c['resolution'] ?? null),
    'deliverable_specs' => j($c['deliverable_specs'] ?? null), 'meta' => j($c['meta'] ?? null),
], $cells);
upsert($db, 'cells', $cellRows, ['id','type','title','status','delib_type','participants','members','progress','days_active','lead','circle','created','deadline','blind','assessors','commissioned_by','resolution_ref','source','resolution','deliverable_specs','meta']);

// Cell domains
foreach ($cells as $c) {
    if (!empty($c['domains']) && is_array($c['domains'])) {
        $cdRows = array_map(fn($d) => [
            'cell_id' => $c['id'],
            'domain' => is_string($d) ? $d : ($d['domain'] ?? $d),
        ], $c['domains']);
        insert($db, 'cell_domains', $cdRows, ['cell_id','domain']);
    }
}

// Cell team
foreach ($cells as $c) {
    if (!empty($c['team']) && is_array($c['team'])) {
        $ctRows = array_map(fn($t) => [
            'cell_id' => $c['id'], 'name' => $t['name'] ?? null,
            'initials' => $t['initials'] ?? null, 'role' => $t['role'] ?? null,
            'focus' => $t['focus'] ?? null,
        ], $c['team']);
        insert($db, 'cell_team', $ctRows, ['cell_id','name','initials','role','focus']);
    }
}

// STFs
$stfs = $mock['stfs'] ?? ['pending' => [], 'active' => [], 'completed' => []];
$allStfs = array_merge($stfs['pending'] ?? [], $stfs['active'] ?? [], $stfs['completed'] ?? []);
$stfRows = array_map(function($s) use ($stfs) {
    $bucket = $s['bucket'] ?? 'active';
    if (in_array($s, $stfs['pending'] ?? [])) $bucket = 'pending';
    elseif (in_array($s, $stfs['active'] ?? [])) $bucket = 'active';
    elseif (in_array($s, $stfs['completed'] ?? [])) $bucket = 'completed';
    return [
        'id' => $s['id'], 'type' => $s['type'] ?? null, 'purpose' => $s['purpose'] ?? null,
        'title' => $s['title'] ?? null, 'circle' => $s['circle'] ?? null,
        'deadline' => $s['deadline'] ?? null, 'status' => $s['status'] ?? null, 'bucket' => $bucket,
    ];
}, $allStfs);
upsert($db, 'stfs', $stfRows, ['id','type','purpose','title','circle','deadline','status','bucket']);

// STF candidates
foreach ($allStfs as $s) {
    if (!empty($s['candidates']) && is_array($s['candidates'])) {
        $scRows = array_map(fn($c) => [
            'id' => $c['id'], 'stf_id' => $s['id'], 'name' => $c['name'] ?? null,
            'initials' => $c['initials'] ?? null, 'match_score' => $c['match_score'] ?? null,
            'interest_score' => $c['interest_score'] ?? null, 'competence_score' => $c['competence_score'] ?? null,
            'status' => $c['status'] ?? null, 'invited_date' => $c['invited_date'] ?? null,
        ], $s['candidates']);
        upsert($db, 'stf_candidates', $scRows, ['id','stf_id','name','initials','match_score','interest_score','competence_score','status','invited_date']);
    }
}

// Threads
$threads = $mock['threads'] ?? [];
$threadRows = array_map(fn($t) => [
    'id' => $t['id'], 'title' => $t['title'] ?? null, 'body' => $t['body'] ?? null,
    'author' => $t['author'] ?? null, 'initials' => $t['initials'] ?? null,
    'avatar' => j($t['avatar'] ?? null), 'domain' => $t['domain'] ?? null,
    'domain_color' => $t['domain_color'] ?? null, 'badge' => $t['badge'] ?? null,
    'badge_class' => $t['badge_class'] ?? null, 'replies' => $t['replies'] ?? null,
    'likes' => $t['likes'] ?? null, 'shares' => $t['shares'] ?? null, 'time' => $t['time'] ?? null,
    'pinned' => ($t['pinned'] ?? false) ? 1 : 0, 'endorsements' => $t['endorsements'] ?? 0,
    'proposal_cell_id' => $t['proposal_cell_id'] ?? null,
    'visibility' => $t['visibility'] ?? 'public', 'jstf_cell_id' => $t['jstf_cell_id'] ?? null,
], $threads);
upsert($db, 'threads', $threadRows, ['id','title','body','author','initials','avatar','domain','domain_color','badge','badge_class','replies','likes','shares','time','pinned','endorsements','proposal_cell_id','visibility','jstf_cell_id']);

// Inbox
$inbox = $mock['inbox'] ?? [];
$inboxRows = array_map(fn($i) => [
    'id' => $i['id'], 'type' => $i['type'] ?? null, 'title' => $i['title'] ?? null,
    'desc' => $i['desc'] ?? null, 'time' => $i['time'] ?? null, 'badge' => $i['badge'] ?? null,
    'unread' => ($i['unread'] ?? true) ? 1 : 0, 'detail' => j($i['detail'] ?? null),
    'nav' => $i['nav'] ?? null,
], $inbox);
upsert($db, 'inbox', $inboxRows, ['id','type','title','desc','time','badge','unread','detail','nav']);

// Publications
$pubs = $mock['publications'] ?? [];
$pubRows = array_map(fn($p) => [
    'title' => $p['title'] ?? null, 'journal' => $p['journal'] ?? null,
    'date' => $p['date'] ?? null, 'views' => $p['views'] ?? null,
    'downloads' => $p['downloads'] ?? null, 'type' => $p['type'] ?? null,
    'abstract' => $p['abstract'] ?? null, 'tags' => j($p['tags'] ?? null),
    'domain' => $p['domain'] ?? null, 'status' => $p['status'] ?? 'approved',
    'author' => $p['author'] ?? null, 'created_at' => $p['created_at'] ?? null,
], $pubs);
insert($db, 'publications', $pubRows, ['title','journal','date','views','downloads','type','abstract','tags','domain','status','author','created_at']);

// News
$news = $mock['news'] ?? [];
$newsRows = array_map(fn($n) => [
    'title' => $n['title'] ?? null, 'time' => $n['time'] ?? null,
    'source' => $n['source'] ?? null, 'domain' => $n['domain'] ?? null,
    'body' => $n['body'] ?? null, 'curated_by' => $n['curated_by'] ?? null,
], $news);
insert($db, 'news', $newsRows, ['title','time','source','domain','body','curated_by']);

// Events
$events = $mock['events'] ?? [];
$eventRows = array_map(fn($e) => [
    'title' => $e['title'] ?? null, 'date' => $e['date'] ?? null,
    'location' => $e['location'] ?? null, 'domain' => $e['domain'] ?? null,
    'type' => $e['type'] ?? null,
], $events);
insert($db, 'events', $eventRows, ['title','date','location','domain','type']);

// Opportunities
$opps = $mock['opportunities'] ?? [];
$oppRows = array_map(fn($o) => [
    'title' => $o['title'] ?? null, 'deadline' => $o['deadline'] ?? null, 'type' => $o['type'] ?? null,
], $opps);
insert($db, 'opportunities', $oppRows, ['title','deadline','type']);

// Projects
$projects = $mock['projects'] ?? [];
$projRows = array_map(fn($p) => [
    'id' => $p['id'], 'title' => $p['title'] ?? null, 'lead' => $p['lead'] ?? null,
    'progress' => $p['progress'] ?? null, 'role' => $p['role'] ?? null,
], $projects);
upsert($db, 'projects', $projRows, ['id','title','lead','progress','role']);

// Stats
if (!empty($mock['stats'])) {
    upsert($db, 'stats', [['id' => 1, 'stats' => j($mock['stats'])]], ['id','stats']);
}

// System settings
if (!empty($mock['systemSettings'])) {
    $s = $mock['systemSettings'];
    $stmt = $db->prepare("INSERT INTO system_settings (id, steward_term_months, max_consecutive_terms, cooloff_months, p_astf_cycle_months, auto_expire_circles, default_circle_expiry_months) VALUES (1, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE steward_term_months=VALUES(steward_term_months)");
    $auto = ($s['auto_expire_circles'] ?? false) ? 1 : 0;
    $stmt->bind_param('iiiiii', $s['steward_term_months'], $s['max_consecutive_terms'], $s['cooloff_months'], $s['p_astf_cycle_months'], $auto, $s['default_circle_expiry_months']);
    $stmt->execute();
    $stmt->close();
}

// Registration
if (!empty($mock['registration'])) {
    $r = $mock['registration'];
    if (!empty($r['domains'])) {
        $regRows = array_map(fn($d) => ['name' => $d['name'] ?? null, 'type' => $d['type'] ?? null], $r['domains']);
        insert($db, 'registration_domains', $regRows, ['name','type']);
    }
    $stmt = $db->prepare("INSERT INTO registration_meta (id, elo_map, knowledge_levels, experiential_levels, default_interests) VALUES (1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE elo_map=VALUES(elo_map)");
    $elo = j($r['eloMap'] ?? null);
    $kl = j($r['knowledgeLevels'] ?? null);
    $el = j($r['experientialLevels'] ?? null);
    $di = j($r['defaultInterests'] ?? null);
    $stmt->bind_param('ssss', $elo, $kl, $el, $di);
    $stmt->execute();
    $stmt->close();
}

// Governance events
$govEvents = $mock['governanceEvents'] ?? [];
$govRows = array_map(fn($g) => [
    'id' => $g['id'], 'type' => $g['type'] ?? null, 'circle' => $g['circle'] ?? null,
    'date' => $g['date'] ?? null, 'text' => $g['text'] ?? null,
    'participant' => $g['participant'] ?? null,
], $govEvents);
upsert($db, 'governance_events', $govRows, ['id','type','circle','date','text','participant']);

// Circle applications
$circleApps = $mock['circleApplications'] ?? [];
$appRows = array_map(fn($a) => [
    'id' => $a['id'], 'circle_id' => $a['circleId'] ?? null, 'circle_name' => $a['circleName'] ?? null,
    'applicant' => $a['applicant'] ?? null, 'initials' => $a['initials'] ?? null,
    'motivation' => $a['motivation'] ?? null, 'status' => $a['status'] ?? null,
    'applied_date' => $a['appliedDate'] ?? null, 'queue_position' => $a['queuePosition'] ?? null,
], $circleApps);
upsert($db, 'circle_applications', $appRows, ['id','circle_id','circle_name','applicant','initials','motivation','status','applied_date','queue_position']);

// Integrity records
$ir = $mock['integrityRecords'] ?? [];
$irRows = array_map(fn($r) => [
    'id' => $r['id'], 'type' => $r['type'] ?? null, 'subject' => $r['subject'] ?? null,
    'purpose' => $r['purpose'] ?? null, 'circle' => $r['circle'] ?? null,
    'date' => $r['date'] ?? null, 'verdict' => $r['verdict'] ?? null, 'text' => $r['text'] ?? null,
], $ir);
upsert($db, 'integrity_records', $irRows, ['id','type','subject','purpose','circle','date','verdict','text']);

// Governance ledger
$gl = $mock['governanceLedger'] ?? [];
$glRows = array_map(fn($l) => [
    'id' => $l['id'], 'type' => $l['type'] ?? null, 'target' => $l['target'] ?? null,
    'settings' => j($l['settings'] ?? null), 'applied_by' => $l['appliedBy'] ?? null,
    'applied_at' => $l['appliedAt'] ?? null, 'status' => $l['status'] ?? null,
], $gl);
upsert($db, 'governance_ledger', $glRows, ['id','type','target','settings','applied_by','applied_at','status']);

echo "  ✓ Seed complete\n";

$db->close();
echo "Done!\n";
