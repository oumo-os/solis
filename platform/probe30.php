<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$needle = "sealed audit ···";
$pos = strpos($s, $needle);
echo "pos=" . var_export($pos, true) . "\n";
// search for just the em dash variant
foreach (["sealed audit", "sealed verification", "sealed case", "sealed probe"] as $n) {
    echo $n . " => " . strpos($s, $n) . "\n";
}
