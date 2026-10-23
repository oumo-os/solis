<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$needle = "if (\$caseSealed) {";
$pos = strpos($s, $needle);
echo "pos=" . $pos . "\n";
echo substr($s, $pos, 120) . "\n";
