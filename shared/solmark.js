function SolMark(size, light, opts) {
  size = size || 22;
  light = !!light;
  opts = opts || {};
  // Unified with emblem — 17 bodies (14 + 3 comets), platform colors
  var NAVY = "#0E1E34", GOLD = "#C8960E", GOLDB = "#E8B450";
  var ROT = 52.54;
  var S = 1.5;
  var BODIES = [
    {name:"Mercury",short:"Mer",angle:51.81+ROT,dist:0.3117,light:2.6,r:14.00,inner:true,human:false},
    {name:"Venus",short:"Ven",angle:314.66+ROT,dist:0.7282,light:6.1,r:27.55,inner:true,human:false},
    {name:"Earth",short:"Ear",angle:37.46+ROT,dist:0.9922,light:8.3,r:32.49,inner:true,human:false,color:"#1A5296",moon:true},
    {name:"Mars",short:"Mar",angle:158.10+ROT,dist:1.6660,light:13.9,r:40.77,inner:true,human:false,color:"#8B2500"},
    {name:"Ceres",short:"Cer",angle:160.62+ROT,dist:2.7691,light:23.0,r:48.89,inner:true,human:false},
    {name:"Jupiter",short:"Jup",angle:61.97+ROT,dist:5.0288,light:41.8,r:58.42,inner:false,human:false},
    {name:"Saturn",short:"Sat",angle:55.06+ROT,dist:9.1229,light:75.9,r:67.93,inner:false,human:false},
    {name:"Uranus",short:"Ura",angle:322.38+ROT,dist:19.9532,light:165.9,r:80.43,inner:false,human:false},
    {name:"Neptune",short:"Nep",angle:308.07+ROT,dist:30.1100,light:250.4,r:87.00,inner:false,human:false},
    {name:"Pluto",short:"Plu",angle:239.22+ROT,dist:39.4820,light:328.4,r:91.33,inner:false,human:false},
    {name:"Haumea",short:"Hau",angle:199.07+ROT,dist:43.1340,light:358.7,r:92.74,inner:false,human:false},
    {name:"Makemake",short:"Mak",angle:172.99+ROT,dist:45.7910,light:380.8,r:93.70,inner:false,human:false},
    {name:"Eris",short:"Eri",angle:204.54+ROT,dist:67.6680,light:562.8,r:99.94,inner:false,human:false},
    {name:"Voyager 1",short:"V1",angle:259.00+ROT,dist:77.0000,light:640.0,r:118.00,inner:false,human:true},
    {name:"Harley's Comet",short:"HC",angle:180.61,dist:26.07,light:0,r:75.00,inner:false,human:false},
    {name:"'Oumuamua",short:"'Ou",angle:326.19,dist:38.00,light:0,r:89.00,inner:false,human:true,noline:true},
    {name:"Hale-Bopp",short:"HB",angle:321.0,dist:3.30,light:0,r:50.00,inner:false,human:false}
  ];
  var VB = 340, CX = 170, CY = Math.round(99.94 * S * 0.9744 + 7);
  // For large emblem-style rendering (size>120) use centered CY like emblem for accurate heliopause
  if (size > 120) CY = 170;
  var rad = function(d){return d*Math.PI/180;};
  var pt = function(a,r){return {x:CX+r*Math.cos(rad(a)),y:CY+r*Math.sin(rad(a))};};
  var fg = light ? "rgba(255,255,255,0.92)" : NAVY;
  var fgFaint = light ? "rgba(255,255,255,0.30)" : "rgba(14,30,52,0.30)";
  var goldCol = light ? GOLDB : GOLD;

  var t = Math.max(0, Math.min(1, (80 - size) / 60));
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

  var labels = !!opts.labels, times = !!opts.times, circular = !!opts.circular;
  var wordmark = opts.wordmark !== undefined ? !!opts.wordmark : circular;

  var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + VB + ' ' + VB + '" style="flex-shrink:0" xmlns="http://www.w3.org/2000/svg">';

  // Circular wordmark (emblem) — only when requested
  if (wordmark) {
    var fgText = light ? "rgba(255,255,255,0.82)" : NAVY;
    var dimCol = light ? "rgba(255,255,255,0.38)" : "rgba(14,30,52,0.42)";
    var word="SOLARIAN",wSpan=88,wStart=270-wSpan/2;
    for(var i=0;i<word.length;i++){var a=wStart+(i+0.5)*(wSpan/word.length);var p=pt(a,138);svg+='<text x="'+p.x+'" y="'+p.y+'" text-anchor="middle" dominant-baseline="middle" transform="rotate('+(a+90)+','+p.x+','+p.y+')" font-family="Playfair Display,Georgia,serif" font-size="12" font-weight="700" fill="'+fgText+'" letter-spacing="2">'+word[i]+'</text>';}
    var motto="ULTRA HIC ET NUNC",mSpan=114,mStart=90-mSpan/2;
    for(var i=0;i<motto.length;i++){var a=mStart+(i+0.5)*(mSpan/motto.length);var p=pt(a,131);svg+='<text x="'+p.x+'" y="'+p.y+'" text-anchor="middle" dominant-baseline="middle" transform="rotate('+(a-90)+','+p.x+','+p.y+')" font-family="Playfair Display,Georgia,serif" font-size="7" font-weight="400" fill="'+dimCol+'" letter-spacing="1.2">'+motto[i]+'</text>';}
    [0,180].forEach(function(angle){var p=pt(angle,135);svg+='<rect x="'+(p.x-2.2)+'" y="'+(p.y-2.2)+'" width="4.4" height="4.4" transform="rotate(45,'+p.x+','+p.y+')" fill="'+goldCol+'" opacity="0.7"/>';});
  }

  var rd1 = Math.max(2, ringDash);
  var rg1 = Math.max(2, ringGap * 0.6);
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (112*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + ringW + '" stroke-dasharray="' + rd1 + ' ' + rg1 + '"/>';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (95*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + ringW + '" stroke-dasharray="' + (rd1*1.2) + ' ' + rg1 + '"/>';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (55*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + ringW + '" stroke-dasharray="' + rd1 + ' ' + rg1 + '"/>';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (44*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + ringW + '" stroke-dasharray="' + rd1 + ' ' + rg1 + '"/>';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (7.5*S) + '" fill="none" stroke="' + fgFaint + '" stroke-width="' + (ringW * 1.2) + '"/>';

  for(var i=0;i<BODIES.length;i++){
    var b=BODIES[i],end=pt(b.angle,b.r),num=pt(b.angle,b.r*0.60);
    var flip=b.angle>90&&b.angle<270,tRot=flip?b.angle+180:b.angle;
    var lblR=b.r+(b.inner?10:11),lbl=pt(b.angle,lblR);
    var dotR=b.human? voyagerDot : (b.inner? dotInner : dotOuter);
    if(!b.noline) svg += '<line x1="'+CX+'" y1="'+CY+'" x2="'+end.x+'" y2="'+end.y+'" stroke="'+fg+'" stroke-width="'+(b.human? voyagerLineW : lineW)+'"/>';
    if(times && b.light){var tl=b.light<600?b.light+"'" : (b.light/60).toFixed(1)+"h"; svg+='<text x="'+num.x+'" y="'+num.y+'" font-size="5.2" text-anchor="middle" dominant-baseline="middle" fill="'+(light?"rgba(255,255,255,0.36)":"rgba(14,30,52,0.34)")+'" font-family="Courier New,monospace" transform="rotate('+tRot+','+num.x+','+num.y+')">'+tl+'</text>';}
    if(b.human) svg += '<circle cx="'+end.x+'" cy="'+end.y+'" r="'+dotR+'" fill="none" stroke="'+fg+'" stroke-width="'+voyagerStroke+'"/>';
    else {var bodyFill=b.color||fg; svg += '<circle cx="'+end.x+'" cy="'+end.y+'" r="'+dotR+'" fill="'+bodyFill+'"/>';}
    if(b.moon) svg += '<circle cx="'+end.x+'" cy="'+end.y+'" r="'+(dotR+moonGap)+'" fill="none" stroke="silver" stroke-width="'+moonRing+'"/>';
    if(labels) svg += '<text x="'+lbl.x+'" y="'+lbl.y+'" font-size="5.5" text-anchor="middle" dominant-baseline="middle" fill="'+(light?"rgba(255,255,255,0.46)":"rgba(14,30,52,0.40)")+'" font-family="Inter,system-ui,sans-serif" font-weight="500">'+b.short+'</text>';
  }
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + sunR + '" fill="' + goldCol + '"/>';
  svg += '<circle cx="' + (CX-1) + '" cy="' + (CY-1) + '" r="' + sunHi + '" fill="' + GOLDB + '" opacity="0.5"/>';
  svg += '</svg>';
  return svg;
}
