<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
$old = "                \$cell['title'] = 'vSTF — sealed verification ···' . sealedRef(\$c['id']);\n                unset(\$cell['candidateName'], \$cell['candidateInitials']);\n                \$cell['assessments'] = [];\n                if (is_array(\$cell['source'])) unset(\$cell['source']['candidateName'], \$cell['source']['candidateInitials']);\n                \$cell['resolution'] = \$cell['resolution'] ? ['status' => \$cell['resolution']['status'] ?? 'Sealed'] : null;";
$pos = strpos($s, $old);
echo "pos=" . $pos . "\n";
if ($pos === false) {
    // try CRLF
    $old2 = str_replace("\n", "\r\n", $old);
    echo "CRLF present: " . (strpos($s, $old2) !== false ? "YES" : "NO") . "\n";
}
