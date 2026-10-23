<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
echo "draftResolutions pos=" . strpos($s, "\$cell['draftResolutions'] = [];") . "\n";
echo "vs pos=" . strpos($s, "\$vs = \$voteByCell") . "\n";
echo "caseSealed pos=" . strpos($s, "\$caseSealed") . "\n";
