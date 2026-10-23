<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$j = strpos($s, "unset(\$cell['candidateName'], \$cell['candidateInitials']);");
echo substr($s, $j - 60, 260), "\n\n---\n";
echo "actual line endings around j: ";
echo bin2hex(substr($s, $j - 5, 30)), "\n";
