<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$pos = strpos($s, "sealed verification");
echo "vSTF title line:\n";
echo substr($s, $pos - 120, 200), "\n\n";
// find the unset line right after
$u = strpos($s, "unset(\$cell['candidateName'], \$cell['candidateInitials']);");
echo "unset line pos=$u\n";
echo substr($s, $u, 120), "\n";
