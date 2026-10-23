<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
foreach (["sealed audit", "sealed verification", "sealed case", "sealed probe"] as $n) {
    $pos = strpos($s, $n);
    echo $n . " => " . $pos . " :: " . substr($s, $pos, 80) . "\n";
}
