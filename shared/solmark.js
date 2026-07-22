function SolMark(size, light) {
  size = size || 22;
  light = light || false;
  var NAVY = "#0E1E34", GOLD = "#C8960E", GOLDB = "#E8B450";
  var ROT = 52.54;
  var S = 1.5; // scale factor
  var BODIES = [
    {name:"Mercury",angle:51.81+ROT,r:14.00*S,inner:true,human:false},
    {name:"Venus",angle:314.66+ROT,r:27.55*S,inner:true,human:false},
    {name:"Earth",angle:37.46+ROT,r:32.49*S,inner:true,human:false,color:"#1A5296",moon:true},
    {name:"Mars",angle:158.10+ROT,r:40.77*S,inner:true,human:false,color:"#8B2500"},
    {name:"Ceres",angle:160.62+ROT,r:48.89*S,inner:true,human:false},
    {name:"Jupiter",angle:61.97+ROT,r:58.42*S,inner:false,human:false},
    {name:"Saturn",angle:55.06+ROT,r:67.93*S,inner:false,human:false},
    {name:"Uranus",angle:322.38+ROT,r:80.43*S,inner:false,human:false},
    {name:"Neptune",angle:308.07+ROT,r:87.00*S,inner:false,human:false},
    {name:"Pluto",angle:239.22+ROT,r:91.33*S,inner:false,human:false},
    {name:"Haumea",angle:199.07+ROT,r:92.74*S,inner:false,human:false},
    {name:"Makemake",angle:172.99+ROT,r:93.70*S,inner:false,human:false},
    {name:"Eris",angle:204.54+ROT,r:99.94*S,inner:false,human:false},
    {name:"Voyager 1",angle:259.00+ROT,r:118.00*S,inner:false,human:true}
  ];
  // CY so Eris touches top: Eris y = CY + 99.94*S*sin(257.08°) ≈ CY - 150.7
  var VB = 340, CX = 170, CY = Math.round(99.94 * S * 0.9744 + 7);
  var rad = function(d) { return d * Math.PI / 180; };
  var pt = function(a, r) { return { x: CX + r * Math.cos(rad(a)), y: CY + r * Math.sin(rad(a)) }; };
  var fg = light ? "rgba(255,255,255,0.92)" : NAVY;
  var fgFaint = light ? "rgba(255,255,255,0.30)" : "rgba(14,30,52,0.30)";
  var goldCol = light ? GOLDB : GOLD;

  // Aggressive LOD: at small sizes, everything gets much bolder
  var t = Math.max(0, Math.min(1, (80 - size) / 60));

  // Stroke widths scale dramatically
  var lineW = 0.75 + t * 3.5;
  var voyagerLineW = 0.6 + t * 2.8;
  var dotInner = 1.8 + t * 4.5;
  var dotOuter = 2.4 + t * 5.0;
  var voyagerDot = 2.0 + t * 5.0;
  var voyagerStroke = 0.8 + t * 2.5;
  var moonRing = 0.5 + t * 2.0;
  var moonGap = 1.6 + t * 2.5;
  var sunR = 4 + t * 6;
  var sunHi = 1.4 + t * 2.0;
  var ringW = 0.5 + t * 1.8;
  var ringDash = 1.5 + t * 3;
  var ringGap = 5 - t * 2.5;

  var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + VB + ' ' + VB + '" style="flex-shrink:0">';
  // Orbital rings
  var rd1 = Math.max(2, ringDash);
  var rg1 = Math.max(2, ringGap * 0.6);
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (112*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + ringW + '" stroke-dasharray="' + rd1 + ' ' + rg1 + '"/>';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (95*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + ringW + '" stroke-dasharray="' + (rd1*1.2) + ' ' + rg1 + '"/>';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (55*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + ringW + '" stroke-dasharray="' + rd1 + ' ' + rg1 + '"/>';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (44*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + ringW + '" stroke-dasharray="' + rd1 + ' ' + rg1 + '"/>';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (7.5*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + (ringW * 1.2) + '"/>';
  // Bodies
  for (var i = 0; i < BODIES.length; i++) {
    var b = BODIES[i], end = pt(b.angle, b.r);
    var dotR = b.human ? voyagerDot : (b.inner ? dotInner : dotOuter);
    if (!b.noline) {
      svg += '<line x1="' + CX + '" y1="' + CY + '" x2="' + end.x + '" y2="' + end.y + '" stroke="' + fg + '" stroke-width="' + (b.human ? voyagerLineW : lineW) + '"/>';
    }
    if (b.human) {
      svg += '<circle cx="' + end.x + '" cy="' + end.y + '" r="' + dotR + '" fill="none" stroke="' + fg + '" stroke-width="' + voyagerStroke + '"/>';
    } else {
      var bodyFill = b.color || fg;
      svg += '<circle cx="' + end.x + '" cy="' + end.y + '" r="' + dotR + '" fill="' + bodyFill + '"/>';
    }
    if (b.moon) {
      svg += '<circle cx="' + end.x + '" cy="' + end.y + '" r="' + (dotR + moonGap) + '" fill="none" stroke="silver" stroke-width="' + moonRing + '"/>';
    }
  }
  // Sun
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + sunR + '" fill="' + goldCol + '"/>';
  svg += '<circle cx="' + (CX - 1) + '" cy="' + (CY - 1) + '" r="' + sunHi + '" fill="' + GOLDB + '" opacity="0.5"/>';
  svg += '</svg>';
  return svg;
}