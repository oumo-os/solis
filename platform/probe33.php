<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$pos = strpos($s, "unset(\$cell['candidateName'], \$cell['candidateInitials']);");
echo "pos=" . $pos . "\n";
echo substr($s, $pos, 120) . "\n";
