<?php
$p = 'M:/Dev/projects/New folder/solis/solis/platform/api.php';
$s = file_get_contents($p);
$needle = "\n                \$cell['title'] = 'aSTF — sealed audit ···' . sealedRef(\$c['id']);\n";
$pos = strpos($s, $needle);
echo "needle pos=" . $pos . "\n";
if ($pos !== false) echo substr($s, $pos, 200), "\n";
