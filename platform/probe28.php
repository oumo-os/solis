<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$needle = "sealed audit ···";
$pos = strpos($s, $needle);
echo "pos=" . $pos . "\n";
echo substr($s, $pos - 80, 200), "\n";
