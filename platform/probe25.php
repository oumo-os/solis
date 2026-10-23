<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$old = "                \$cell['title'] = 'vSTF — sealed verification ···' . sealedRef(\$c['id']);\n                unset(\$cell['candidateName'], \$cell['candidateInitials']);\n                \$cell['assessments'] = [];\n                if (is_array(\$cell['source'])) unset(\$cell['source']['candidateName'], \$cell['source']['candidateInitials']);\n                \$cell['resolution'] = \$cell['resolution'] ? ['status' => \$cell['resolution']['status'] ?? 'Sealed'] : null;";
$pos = strpos($s, $old);
echo "pos=" . $pos . "\n";
if ($pos === false) {
    // Try matching just the unset line
    $needle = "                unset(\$cell['candidateName'], \$cell['candidateInitials']);\n                \$cell['assessments'] = [];\n";
    echo "needle2 pos=" . strpos($s, $needle) . "\n";
    $needle3 = "unset(\$cell['candidateName'], \$cell['candidateInitials']);";
    echo "needle3 pos=" . strpos($s, $needle3) . "\n";
}
