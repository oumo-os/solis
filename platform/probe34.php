<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$needle = "unset(\$cell['candidateName'], \$cell['candidateInitials']);";
$pos = strpos($s, $needle);
echo "pos=" . var_export($pos, true) . "\n";
// maybe with different spacing
$needle2 = "unset(\$cell['candidateName'],\$cell['candidateInitials']);";
echo "pos2=" . var_export(strpos($s, $needle2), true) . "\n";
$needle3 = "unset(\$cell['candidateName']";
echo "pos3=" . var_export(strpos($s, $needle3), true) . "\n";
