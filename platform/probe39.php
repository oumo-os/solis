<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$pos = 31876;
echo substr($s, $pos, 120) . "\n---\n";
$pos2 = 38554;
echo substr($s, $pos2, 120) . "\n";
