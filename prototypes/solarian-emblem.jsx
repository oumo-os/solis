import { useState } from "react";

const NAVY  = "#0E1E34";
const GOLD  = "#C8880A";
const GOLDB = "#E8A820";
const BG    = "#F8F9FB";

// ── Bodies · 02 November 2000 ─────────────────────────────────────────────────
const BODIES = [
  { name:"Mercury",   short:"Mer", angle: 51.81, dist: 0.3117, light:  2.6, r: 14.00, inner:true,  human:false },
  { name:"Venus",     short:"Ven", angle:314.66, dist: 0.7282, light:  6.1, r: 27.55, inner:true,  human:false },
  { name:"Earth",     short:"Ear", angle: 37.46, dist: 0.9922, light:  8.3, r: 32.49, inner:true,  human:false },
  { name:"Mars",      short:"Mar", angle:158.10, dist: 1.6660, light: 13.9, r: 40.77, inner:true,  human:false },
  { name:"Ceres",     short:"Cer", angle:160.62, dist: 2.7691, light: 23.0, r: 48.89, inner:true,  human:false },
  { name:"Jupiter",   short:"Jup", angle: 61.97, dist: 5.0288, light: 41.8, r: 58.42, inner:false, human:false },
  { name:"Saturn",    short:"Sat", angle: 55.06, dist: 9.1229, light: 75.9, r: 67.93, inner:false, human:false },
  { name:"Uranus",    short:"Ura", angle:322.38, dist:19.9532, light:165.9, r: 80.43, inner:false, human:false },
  { name:"Neptune",   short:"Nep", angle:308.07, dist:30.1100, light:250.4, r: 87.00, inner:false, human:false },
  { name:"Pluto",     short:"Plu", angle:239.22, dist:39.4820, light:328.4, r: 91.33, inner:false, human:false },
  { name:"Haumea",    short:"Hau", angle:199.07, dist:43.1340, light:358.7, r: 92.74, inner:false, human:false },
  { name:"Makemake",  short:"Mak", angle:172.99, dist:45.7910, light:380.8, r: 93.70, inner:false, human:false },
  { name:"Eris",      short:"Eri", angle:204.54, dist:67.6680, light:562.8, r: 99.94, inner:false, human:false },
  { name:"Voyager 1", short:"V1",  angle:259.00, dist:77.0000, light:640.0, r:102.00, inner:false, human:true  },
];

const VB = 340, CX = 170, CY = 170;
const rad = d => d * Math.PI / 180;
const pt  = (a, r) => ({ x: CX + r * Math.cos(rad(a)), y: CY + r * Math.sin(rad(a)) });

// ── Circular arc text ─────────────────────────────────────────────────────────
// isBottom: true = letters face inward (reads right-side up at bottom)
//           false = letters face outward (reads right-side up at top)
function ArcText({ text, r, centerAngle, spanDeg, fontSize, fontWeight, fill, isBottom=false, tracking=1 }) {
  const chars = text.split("");
  const n = chars.length;
  const anglePerChar = spanDeg / n;
  const startAngle = centerAngle - spanDeg / 2;

  return chars.map((ch, i) => {
    const a  = startAngle + (i + 0.5) * anglePerChar;
    const p  = pt(a, r);
    const rot = isBottom ? a - 90 : a + 90;
    return (
      <text key={i} x={p.x} y={p.y}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} fontWeight={fontWeight}
        fontFamily="'Playfair Display',Georgia,serif"
        fill={fill} letterSpacing={tracking}
        transform={`rotate(${rot},${p.x},${p.y})`}>
        {ch}
      </text>
    );
  });
}

// ── Mark ─────────────────────────────────────────────────────────────────────
function Mark({ size=300, dark=false, labels=false, times=false, circular=false }) {
  const fg      = dark ? "rgba(255,255,255,0.88)" : NAVY;
  const fgFaint = dark ? "rgba(255,255,255,0.13)" : "rgba(14,30,52,0.13)";
  const lblCol  = dark ? "rgba(255,255,255,0.46)" : "rgba(14,30,52,0.40)";
  const numCol  = dark ? "rgba(255,255,255,0.36)" : "rgba(14,30,52,0.34)";
  const textCol = dark ? "rgba(255,255,255,0.82)" : NAVY;
  const dimCol  = dark ? "rgba(255,255,255,0.38)" : "rgba(14,30,52,0.42)";
  const goldCol = dark ? GOLDB : GOLD;

  // Divider diamonds at 0° and 180° on the wordmark ring
  const diamond = (angle, r_d) => {
    const p = pt(angle, r_d);
    return <rect key={angle} x={p.x-2.2} y={p.y-2.2} width={4.4} height={4.4}
      transform={`rotate(45,${p.x},${p.y})`} fill={goldCol} opacity={0.7}/>;
  };

  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} width={size} height={size} xmlns="http://www.w3.org/2000/svg">

      {/* ── Circular wordmark ── */}
      {circular && <>
        {/* SOLARIAN — top arc, heavy */}
        <ArcText text="SOLARIAN" r={138} centerAngle={270} spanDeg={88}
          fontSize={12} fontWeight={700} fill={textCol} isBottom={false} tracking={2}/>

        {/* ULTRA HIC ET NUNC — bottom arc, light */}
        <ArcText text="ULTRA HIC ET NUNC" r={131} centerAngle={90} spanDeg={114}
          fontSize={7} fontWeight={400} fill={dimCol} isBottom={true} tracking={1.2}/>

        {/* Divider diamonds at 3 o'clock and 9 o'clock */}
        {diamond(0,   135)}
        {diamond(180, 135)}
      </>}

      {/* ── Heliopause ring ── */}
      <circle cx={CX} cy={CY} r={112}
        fill="none" stroke={fgFaint}
        strokeWidth={0.5} strokeDasharray="1.5 6"/>

      {/* ── Asteroid belt rings ── */}
      <circle cx={CX} cy={CY} r={44}
        fill="none" stroke={fgFaint}
        strokeWidth={0.4} strokeDasharray="2 6.5"/>
      <circle cx={CX} cy={CY} r={55}
        fill="none" stroke={fgFaint}
        strokeWidth={0.4} strokeDasharray="2 6.5"/>

      {/* ── Sol corona ── */}
      <circle cx={CX} cy={CY} r={7.5}
        fill="none" stroke={fgFaint} strokeWidth={0.4}/>

      {/* ── Bodies ── */}
      {BODIES.map(b => {
        const end  = pt(b.angle, b.r);
        const num  = pt(b.angle, b.r * 0.60);
        const flip = b.angle > 90 && b.angle < 270;
        const tRot = flip ? b.angle + 180 : b.angle;
        const lblR = b.r + (b.inner ? 10 : 11);
        const lbl  = pt(b.angle, lblR);
        const dotR = b.human ? 2.0 : (b.inner ? 1.8 : 2.4);

        return (
          <g key={b.name}>
            {/* Line — Voyager slightly thinner to distinguish */}
            <line x1={CX} y1={CY} x2={end.x} y2={end.y}
              stroke={fg} strokeWidth={b.human ? 0.6 : 0.75}
              strokeDasharray={b.human ? "none" : "none"}/>

            {/* Light-time notation */}
            {times && (
              <text x={num.x} y={num.y} fontSize={5.2}
                textAnchor="middle" dominantBaseline="middle"
                fill={numCol} fontFamily="'Courier New',monospace"
                transform={`rotate(${tRot},${num.x},${num.y})`}>
                {b.light < 600 ? `${b.light}'` : `${(b.light/60).toFixed(1)}h`}
              </text>
            )}

            {/* Body marker */}
            {b.human
              ? <circle cx={end.x} cy={end.y} r={dotR}
                  fill="none" stroke={fg} strokeWidth={0.8}/>
              : <circle cx={end.x} cy={end.y} r={dotR} fill={fg}/>
            }

            {/* Label */}
            {labels && (
              <text x={lbl.x} y={lbl.y} fontSize={5.5}
                textAnchor="middle" dominantBaseline="middle"
                fill={lblCol} fontFamily="Inter,system-ui,sans-serif"
                fontWeight={500}>
                {b.short}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Sol ── */}
      <circle cx={CX} cy={CY} r={4} fill={goldCol}/>
      <circle cx={CX-1} cy={CY-1} r={1.4} fill={GOLDB} opacity={0.5}/>
    </svg>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [dark,     setDark]     = useState(false);
  const [labels,   setLabels]   = useState(false);
  const [times,    setTimes]    = useState(false);
  const [circular, setCircular] = useState(true);

  const Btn = ({ label, active, on }) => (
    <button onClick={on} style={{
      background:active ? NAVY : "#fff", color:active ? "#fff" : NAVY,
      border:`1px solid ${active ? NAVY : "rgba(14,30,52,.18)"}`,
      borderRadius:4, padding:"7px 16px",
      fontFamily:"inherit", fontSize:12, fontWeight:500,
      cursor:"pointer", transition:"all .15s",
    }}>{label}</button>
  );

  const Panel = ({ children, label }) => (
    <div style={{
      background:"#fff", border:"1px solid rgba(14,30,52,.09)",
      borderRadius:6, padding:"18px 20px",
    }}>
      {label && <div style={{
        fontSize:10, fontWeight:600, letterSpacing:".1em",
        textTransform:"uppercase", color:"rgba(14,30,52,.3)", marginBottom:14,
      }}>{label}</div>}
      {children}
    </div>
  );

  return (
    <div style={{ fontFamily:"Inter,system-ui,sans-serif", background:BG, minHeight:"100vh", padding:"32px 24px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:".1em", textTransform:"uppercase", color:GOLD, marginBottom:6 }}>
          Solarian Society · Full Emblem
        </div>
        <h1 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:24, fontWeight:700, color:NAVY, marginBottom:4 }}>
          Planetary Map with Wordmark
        </h1>
        <p style={{ fontSize:12, color:"rgba(14,30,52,.5)", lineHeight:1.65 }}>
          02 November 2000 — first day of continuous human presence in space.<br/>
          14 bodies including Voyager 1, the only line that crosses the heliopause.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        <Btn label="Wordmark" active={circular} on={()=>setCircular(!circular)}/>
        <Btn label="Labels"   active={labels}   on={()=>setLabels(!labels)}/>
        <Btn label="Times"    active={times}     on={()=>setTimes(!times)}/>
        <Btn label="Dark"     active={dark}      on={()=>setDark(!dark)}/>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:16, alignItems:"start" }}>

        {/* ── Main emblem ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{
            background:dark ? NAVY : "#fff",
            border:`1px solid ${dark ? "transparent" : "rgba(14,30,52,.09)"}`,
            borderRadius:8, padding:16,
            display:"flex", alignItems:"center", justifyContent:"center",
            transition:"background .3s",
          }}>
            <Mark size={300} dark={dark} labels={labels} times={times} circular={circular}/>
          </div>

          {/* Scale strip */}
          <Panel label="Scale — mark only">
            <div style={{ display:"flex", alignItems:"flex-end", gap:16, flexWrap:"wrap" }}>
              {[120, 80, 48, 32, 20].map(s => (
                <div key={s} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                  <Mark size={s} dark={false}/>
                  <span style={{ fontSize:9, color:"rgba(14,30,52,.3)" }}>{s}px</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* Stamp variants */}
          <Panel label="Stamp variants">
            <div style={{ display:"flex", gap:10 }}>
              {[
                { bg:"#fff",    border:"1px solid rgba(14,30,52,.1)" },
                { bg:BG,        border:"none" },
                { bg:NAVY,      border:"none" },
                { bg:GOLD,      border:"none" },
              ].map((s, i) => (
                <div key={i} style={{
                  background:s.bg, border:s.border,
                  borderRadius:6, padding:10, flex:1,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <Mark size={72} dark={s.bg === NAVY || s.bg === GOLD} circular={circular}/>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── Right column ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          <Panel label="Map key · 02 November 2000">
            <div style={{ display:"flex", flexDirection:"column" }}>
              {BODIES.map((b, i) => (
                <div key={b.name} style={{
                  display:"grid",
                  gridTemplateColumns:"10px 86px 1fr 52px 52px",
                  gap:8, alignItems:"center",
                  padding:"4px 0",
                  borderBottom:i < BODIES.length-1 ? "1px solid rgba(14,30,52,.05)" : "none",
                }}>
                  {b.human
                    ? <div style={{ width:8, height:8, borderRadius:"50%", border:`1.5px solid ${NAVY}`, background:"transparent" }}/>
                    : <div style={{ width:b.inner?5:7, height:b.inner?5:7, borderRadius:"50%", background:NAVY }}/>
                  }
                  <span style={{ fontSize:12, color:NAVY, fontWeight:b.human ? 600 : 500 }}>{b.name}</span>
                  <div style={{ height:1, background:"linear-gradient(90deg,rgba(14,30,52,.18),transparent)" }}/>
                  <span style={{ fontSize:11, color:"rgba(14,30,52,.4)", textAlign:"right" }}>
                    {b.dist < 10 ? b.dist.toFixed(2) : b.dist.toFixed(1)} AU
                  </span>
                  <span style={{ fontSize:11, color:GOLD, textAlign:"right", fontWeight:500 }}>
                    {b.light < 600 ? `${b.light}'` : `${(b.light/60).toFixed(1)}h`}
                  </span>
                </div>
              ))}
              <div style={{
                display:"grid", gridTemplateColumns:"10px 86px 1fr 52px 52px",
                gap:8, alignItems:"center",
                paddingTop:7, marginTop:4,
                borderTop:"1px solid rgba(14,30,52,.1)",
              }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:GOLD }}/>
                <span style={{ fontSize:12, color:NAVY, fontWeight:600 }}>Sol</span>
                <div/>
                <span style={{ fontSize:11, color:"rgba(14,30,52,.4)", textAlign:"right" }}>origin</span>
                <span style={{ fontSize:11, color:GOLD, textAlign:"right" }}>0'</span>
              </div>
            </div>

            <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid rgba(14,30,52,.06)", display:"flex", flexDirection:"column", gap:5 }}>
              {[
                ["○","Voyager 1 — human-made, open circle"],
                ["— —","Asteroid belt (2.2–3.2 AU)"],
                ["·  ·  ·","Heliopause (~90 AU); Voyager crosses it"],
                ["10.7h","Light travel time in hours for distant bodies"],
              ].map(([s,d]) => (
                <div key={d} style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:11, fontFamily:"monospace", color:GOLD, width:40, flexShrink:0 }}>{s}</span>
                  <span style={{ fontSize:11, color:"rgba(14,30,52,.45)", lineHeight:1.5 }}>{d}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel label="Alignments · 02 November 2000">
            {[
              { b:"Earth · Mercury · Saturn · Jupiter", n:"All within 25° (37°–62°). On the day the first ISS crew arrived, Earth and three major bodies clustered on the same side of Sol." },
              { b:"Mars · Ceres", n:"Within 2.5° of each other (158°–161°). The fourth planet and the largest asteroid belt body, nearly co-longitudinal." },
              { b:"Venus · Neptune · Uranus", n:"Within 15° (308°–322°). An inner planet and two ice giants pointing the same direction from Sol." },
              { b:"Haumea · Eris", n:"Within 5.5° (199°–205°). Two trans-Neptunian dwarf planets in near-alignment." },
            ].map((a, i, arr) => (
              <div key={i} style={{
                padding:"10px 0",
                borderBottom:i < arr.length-1 ? "1px solid rgba(14,30,52,.07)" : "none",
              }}>
                <div style={{ fontSize:12, fontWeight:600, color:NAVY, marginBottom:3 }}>{a.b}</div>
                <div style={{ fontSize:12, color:"rgba(14,30,52,.48)", lineHeight:1.6 }}>{a.n}</div>
              </div>
            ))}
          </Panel>

          <Panel>
            <p style={{ fontSize:12, color:"rgba(14,30,52,.48)", lineHeight:1.75 }}>
              The Voyager 1 line is the only one that crosses the heliopause ring — the only human-made object on the map, still moving outward with no plan to return. The emblem was modelled on the pulsar map carried aboard Voyager. Voyager itself now appears on it.
            </p>
          </Panel>

        </div>
      </div>
    </div>
  );
}
