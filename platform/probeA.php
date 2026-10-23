<?php
$p = 'M:/Dev/projects/New folder/solis/solis/platform/api.php';
$s = file_get_contents($p);
$i = strpos($s, "if ((\$c['type'] ?? '') === 'vSTF Cell') {");
echo "pos=$i\n";
$oldV = "                \$cell['title'] = 'vSTF — sealed verification ···' . sealedRef(\$c['id']);\n                unset(\$cell['candidateName'], \$cell['candidateInitials']);\n                \$cell['assessments'] = [];\n                if (is_array(\$cell['source'])) unset(\$cell['source']['candidateName'], \$cell['source']['candidateInitials']);\n                \$cell['resolution'] = \$cell['resolution'] ? ['status' => \$cell['resolution']['status'] ?? 'Sealed'] : null;";
echo "oldV present: " . (strpos($s, $oldV) !== false ? "YES" : "NO") . "\n";
echo "oldV bytes: " . strlen($oldV) . "\n";
$needle = "unset(\$cell['candidateName'], \$cell['candidateInitials']);";
$j = strpos($s, $needle);
echo "needle pos: $j\n";
echo substr($s, $j, 80), "\n";
