<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$pos = strpos($s, "unset(\$cell['candidateName']");
echo "pos=" . $pos . "\n";
echo substr($s, $pos, 200) . "\n";
