<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$pos = strpos($s, "unset(\$cell['candidateName'], \$cell['candidateInitials']);");
echo "pos=" . $pos . "\n";
echo substr($s, $pos, 200), "\n";
echo "---hex around pos---\n";
echo bin2hex(substr($s, $pos - 10, 80)), "\n";
