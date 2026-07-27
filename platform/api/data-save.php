<?php
require_once __DIR__ . '/config.php';

$user = requireAuth();
$body = getBody();

$action   = $body['action'] ?? '';
$key      = $body['key'] ?? '';
$itemId   = $body['id'] ?? null;
$itemData = $body['data'] ?? $body['item'] ?? null;
$changes  = $body['changes'] ?? null;

if (!$action || !$key) error('action and key required');

$db = getDB();
$allowedKeys = ['cells','circles','stfs','threads','inbox','projects','domains',
                'governanceLedger','participants','organisations','systemSettings',
                'integrityRecords','governanceEvents','circleApplications',
                'stfCandidates','projectApplications','publications',
                'news','events','opportunities','stats','exitReasonLabels',
                'userActivity','userCircles'];

if (!in_array($key, $allowedKeys)) error("Invalid key: $key");

switch ($action) {

  case 'set':
    // Replace entire collection
    if ($itemData === null) error('data required for set action');
    $json = json_encode($itemData, JSON_UNESCAPED_UNICODE);
    $db->prepare('REPLACE INTO app_data (data_key, data_value) VALUES (?, ?)')
       ->execute([$key, $json]);
    // Log
    $db->prepare('INSERT INTO mutation_log (user_id, action, data_key, item_id, snapshot) VALUES (?,?,?,?,?)')
       ->execute([$user['id'], 'set', $key, null, $json]);
    json(['ok' => true]);
    break;

  case 'push':
    // Append item to array
    if ($itemData === null) error('item required for push action');
    $st = $db->prepare('SELECT data_value FROM app_data WHERE data_key = ?');
    $st->execute([$key]);
    $row = $st->fetch();
    $arr = $row ? json_decode($row['data_value'], true) : [];
    if (!is_array($arr)) $arr = [];
    $arr[] = $itemData;
    $json = json_encode($arr, JSON_UNESCAPED_UNICODE);
    $db->prepare('REPLACE INTO app_data (data_key, data_value) VALUES (?, ?)')
       ->execute([$key, $json]);
    $db->prepare('INSERT INTO mutation_log (user_id, action, data_key, item_id, snapshot) VALUES (?,?,?,?,?)')
       ->execute([$user['id'], 'push', $key, $itemId, $json]);
    json(['ok' => true]);
    break;

  case 'update':
    // Update item in array by id
    if (!$itemId || !$changes) error('id and changes required for update action');
    $st = $db->prepare('SELECT data_value FROM app_data WHERE data_key = ?');
    $st->execute([$key]);
    $row = $st->fetch();
    if (!$row) error("Key not found: $key");
    $arr = json_decode($row['data_value'], true);
    if (!is_array($arr)) error("Key is not an array: $key");
    $found = false;
    foreach ($arr as &$item) {
      if (isset($item['id']) && $item['id'] === $itemId) {
        foreach ($changes as $k => $v) {
          $item[$k] = $v;
        }
        $found = true;
        break;
      }
    }
    if (!$found) error("Item not found: $itemId");
    $json = json_encode($arr, JSON_UNESCAPED_UNICODE);
    $db->prepare('REPLACE INTO app_data (data_key, data_value) VALUES (?, ?)')
       ->execute([$key, $json]);
    $db->prepare('INSERT INTO mutation_log (user_id, action, data_key, item_id, snapshot) VALUES (?,?,?,?,?)')
       ->execute([$user['id'], 'update', $key, $itemId, $json]);
    json(['ok' => true]);
    break;

  case 'delete':
    // Remove item from array by id
    if (!$itemId) error('id required for delete action');
    $st = $db->prepare('SELECT data_value FROM app_data WHERE data_key = ?');
    $st->execute([$key]);
    $row = $st->fetch();
    if (!$row) error("Key not found: $key");
    $arr = json_decode($row['data_value'], true);
    if (!is_array($arr)) error("Key is not an array: $key");
    $arr = array_values(array_filter($arr, function($item) use ($itemId) {
      return !(isset($item['id']) && $item['id'] === $itemId);
    }));
    $json = json_encode($arr, JSON_UNESCAPED_UNICODE);
    $db->prepare('REPLACE INTO app_data (data_key, data_value) VALUES (?, ?)')
       ->execute([$key, $json]);
    $db->prepare('INSERT INTO mutation_log (user_id, action, data_key, item_id, snapshot) VALUES (?,?,?,?,?)')
       ->execute([$user['id'], 'delete', $key, $itemId, $json]);
    json(['ok' => true]);
    break;

  default:
    error("Unknown action: $action");
}
