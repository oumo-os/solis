<?php
$s = file_get_contents('M:/Dev/projects/New folder/solis/solis/platform/api.php');
// Check whether the vSTF branch was already patched (first edit succeeded)
$pos = strpos($s, "unset(\$cell['candidateName'], \$cell['candidateInitials'], \$cell['targetId'], \$cell['targetName'], \$cell['threadId'], \$cell['targetIsSteward'], \$cell['appealOf'], \$cell['revisionOf'], \$cell['isAppeal'], \$cell['verdict']);");
echo "already-patched unset pos=" . $pos . "\n";
// Check draftResolutions gate
$needle = "    \$cell['draftResolutions'] = [];\n    foreach ((\$draftByCell[\$c['id']] ?? []) as \$d) {";
echo "draftResolutions gate unpatched pos=" . strpos($s, $needle) . "\n";
// Check votes gate
$needle2 = "    \$vs = \$voteByCell[\$c['id']] ?? [];\n    if (\$vs || isset(\$vsumByCell[\$c['id']])) {";
echo "votes gate unpatched pos=" . strpos($s, $needle2) . "\n";
