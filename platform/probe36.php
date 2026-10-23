<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$pos = strpos($s, "unset(\$cell['candidateName']");
echo "pos=" . $pos . "\n";
echo substr($s, $pos, 260) . "\n";
echo "---next unset---\n";
$pos2 = strpos($s, "unset(\$cell['candidateName']");
echo substr($s, $pos2, 260) . "\n";
