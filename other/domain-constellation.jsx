import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// SOLIS DOMAINS
// ─────────────────────────────────────────────────────────────────────────────
const DOMAIN_IDS = [
  "astronomy-astrophysics","aerospace-engineering","earth-planetary-science",
  "space-medicine-biology","space-law-policy","telecommunications-signals",
  "computer-science-software","physics","materials-science",
  "robotics-automation","remote-sensing","space-architecture",
  "space-finance-economics","science-communication",
  "philosophy-ethics-space","art-culture-space",
];

const DOMAIN_META = {
  "astronomy-astrophysics":  { label:"Astronomy & Astrophysics",  short:"ASTRO",    color:"#6EB8FF" },
  "aerospace-engineering":   { label:"Aerospace Engineering",     short:"AERO",     color:"#4ACCA8" },
  "earth-planetary-science": { label:"Earth & Planetary Science", short:"EARTH",    color:"#7AACDA" },
  "space-medicine-biology":  { label:"Space Medicine & Biology",  short:"MED",      color:"#FF8080" },
  "space-law-policy":        { label:"Space Law & Policy",        short:"LAW",      color:"#FFB84D" },
  "telecommunications-signals":{ label:"Telecom & Signals",       short:"COMMS",    color:"#B088F0" },
  "computer-science-software":{ label:"CS & Software",            short:"CODE",     color:"#50E0C0" },
  "physics":                 { label:"Physics",                   short:"PHYS",     color:"#AACCEE" },
  "materials-science":       { label:"Materials Science",         short:"MAT",      color:"#E0A060" },
  "robotics-automation":     { label:"Robotics & Automation",     short:"ROBO",     color:"#80D0FF" },
  "remote-sensing":          { label:"Remote Sensing",            short:"RS",       color:"#40C090" },
  "space-architecture":      { label:"Space Architecture",        short:"ARCH",     color:"#C0A0E0" },
  "space-finance-economics": { label:"Space Finance & Economics", short:"FIN",      color:"#FFD060" },
  "science-communication":   { label:"Science Communication",     short:"SCICOMM",  color:"#FF90B0" },
  "philosophy-ethics-space": { label:"Philosophy & Ethics",       short:"PHIL",     color:"#D0C0A0" },
  "art-culture-space":       { label:"Art & Culture of Space",    short:"ART",      color:"#E0B0C0" },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────
function mkRng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/0xffffffff; }; }

function generateMembers(){
  const rng=mkRng(42);
  const pick=(arr,n)=>{ const a=[...arr],out=[]; for(let i=0;i<n&&a.length;i++){ const idx=Math.floor(rng()*a.length); out.push(a.splice(idx,1)[0]); } return out; };
  const clusters=[
    {core:["astronomy-astrophysics","earth-planetary-science","physics","remote-sensing"],size:8},
    {core:["space-law-policy","philosophy-ethics-space","space-finance-economics","science-communication"],size:7},
    {core:["aerospace-engineering","robotics-automation","materials-science","space-architecture"],size:6},
    {core:["computer-science-software","telecommunications-signals","physics","robotics-automation"],size:6},
    {core:["space-medicine-biology","earth-planetary-science","philosophy-ethics-space"],size:4},
    {core:["art-culture-space","science-communication","philosophy-ethics-space"],size:4},
  ];
  const members=[];
  clusters.forEach((cl,ci)=>{
    for(let i=0;i<cl.size;i++){
      const strongDomains=pick(cl.core,Math.floor(rng()*2)+1);
      const weakDomains=pick(DOMAIN_IDS.filter(d=>!cl.core.includes(d)),Math.floor(rng()*2));
      const competence={};
      strongDomains.forEach(d=>{ competence[d]=Math.floor(rng()*1400)+1200; });
      weakDomains.forEach(d=>{ competence[d]=Math.floor(rng()*600)+200; });
      const interested=pick([...cl.core,...DOMAIN_IDS.filter(d=>!cl.core.includes(d)).slice(0,4)],Math.floor(rng()*3)+2);
      members.push({id:`m${ci}_${i}`,competence,interested});
    }
  });
  return members;
}

const MEMBERS=generateMembers();

function deriveDomainStats(){
  const stats={};
  DOMAIN_IDS.forEach(d=>{
    const scores=MEMBERS.map(m=>m.competence[d]).filter(Boolean);
    const interested=MEMBERS.filter(m=>m.interested.includes(d)).length;
    stats[d]={
      peakW:scores.length?Math.max(...scores):0,
      avgW:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0,
      memberCount:scores.length,
      interestCount:interested,
    };
  });
  return stats;
}

function deriveEdges(){
  const edges=[];
  for(let i=0;i<DOMAIN_IDS.length;i++){
    for(let j=i+1;j<DOMAIN_IDS.length;j++){
      const a=DOMAIN_IDS[i],b=DOMAIN_IDS[j];
      const mutual=MEMBERS.filter(m=>(m.competence[a]||m.interested.includes(a))&&(m.competence[b]||m.interested.includes(b))).length;
      if(mutual>=2) edges.push({a,b,mutual});
    }
  }
  return edges;
}

const DOMAIN_STATS=deriveDomainStats();
const EDGES=deriveEdges();

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
const WORLD=2400;

function computeLayout(){
  const rng=mkRng(99);
  const seeds={
    "astronomy-astrophysics":[380,380],"earth-planetary-science":[460,330],"remote-sensing":[420,460],
    "physics":[340,440],"computer-science-software":[880,480],"telecommunications-signals":[960,400],
    "robotics-automation":[840,560],"space-law-policy":[1380,480],"philosophy-ethics-space":[1480,560],
    "space-finance-economics":[1360,620],"science-communication":[1480,420],"art-culture-space":[1080,780],
    "space-medicine-biology":[1030,900],"materials-science":[930,840],"space-architecture":[1280,280],
    "aerospace-engineering":[1200,380],
  };
  const pos={};
  DOMAIN_IDS.forEach(d=>{
    const s=seeds[d]||[rng()*WORLD,rng()*WORLD];
    pos[d]={x:s[0]+(rng()-0.5)*50,y:s[1]+(rng()-0.5)*50,vx:0,vy:0};
  });
  const K_SPRING=0.04,K_REPEL=16000,SPRING_LEN=250,DAMPING=0.85;
  for(let iter=0;iter<300;iter++){
    for(let i=0;i<DOMAIN_IDS.length;i++){
      for(let j=i+1;j<DOMAIN_IDS.length;j++){
        const a=pos[DOMAIN_IDS[i]],b=pos[DOMAIN_IDS[j]];
        const dx=b.x-a.x,dy=b.y-a.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
        const f=K_REPEL/(dist*dist),fx=(dx/dist)*f,fy=(dy/dist)*f;
        a.vx-=fx;a.vy-=fy;b.vx+=fx;b.vy+=fy;
      }
    }
    EDGES.forEach(({a,b,mutual})=>{
      const pa=pos[a],pb=pos[b];
      const dx=pb.x-pa.x,dy=pb.y-pa.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
      const nl=SPRING_LEN-mutual*5,f=K_SPRING*(dist-nl),fx=(dx/dist)*f,fy=(dy/dist)*f;
      pa.vx+=fx;pa.vy+=fy;pb.vx-=fx;pb.vy-=fy;
    });
    DOMAIN_IDS.forEach(d=>{
      pos[d].vx*=DAMPING;pos[d].vy*=DAMPING;
      pos[d].x+=pos[d].vx;pos[d].y+=pos[d].vy;
    });
  }
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  DOMAIN_IDS.forEach(d=>{
    minX=Math.min(minX,pos[d].x);maxX=Math.max(maxX,pos[d].x);
    minY=Math.min(minY,pos[d].y);maxY=Math.max(maxY,pos[d].y);
  });
  const sc=Math.min((WORLD-600)/(maxX-minX||1),(WORLD-600)/(maxY-minY||1));
  DOMAIN_IDS.forEach(d=>{ pos[d].x=300+(pos[d].x-minX)*sc; pos[d].y=300+(pos[d].y-minY)*sc; });
  return pos;
}

const LAYOUT=computeLayout();

function makeBgStars(count,seed){
  const rng=mkRng(seed);
  return Array.from({length:count},()=>({
    x:rng()*WORLD,y:rng()*WORLD,
    r:rng()*0.5+0.1,
    op:rng()*0.15+0.03,
    tp:3+rng()*7,
    tph:rng()*Math.PI*2,
  }));
}
const BG_STARS=makeBgStars(500,17);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const INITIAL_SCALE=0.38;
const MIN_SCALE=0.15;
const MAX_SCALE=4.0;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const mod=(v,n)=>((v%n)+n)%n;

function spikeLen(peakW){ return 4+(peakW/3000)*22; }
function starR(peakW){ return 0.9+(peakW/3000)*1.6; }
function haloRings(interestCount){ return [8,14,22].map((base,i)=>({ r:base+interestCount*0.35, op:0.18-i*0.05 })); }

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function DomainConstellation(){
  const containerRef=useRef(null);
  const [dims,setDims]=useState({w:900,h:600});
  const [camera,setCamera]=useState({x:WORLD/2,y:WORLD/2,scale:INITIAL_SCALE});
  const [active,setActive]=useState(null);
  const [locked,setLocked]=useState(null);
  const [time,setTime]=useState(0);

  const [driftPos,setDriftPos]=useState(()=>{
    const p={};
    DOMAIN_IDS.forEach(id=>{ p[id]={x:LAYOUT[id].x,y:LAYOUT[id].y}; });
    return p;
  });
  const driftVel=useRef(()=>{
    const rng=mkRng(7),d={};
    DOMAIN_IDS.forEach(id=>{ d[id]={vx:(rng()-0.5)*0.03,vy:(rng()-0.5)*0.03}; });
    return d;
  });

  const panActive=useRef(false);
  const panLast=useRef({x:0,y:0,t:0});
  const velRef=useRef({vx:0,vy:0});
  const inertiaId=useRef(null);
  const pinchRef=useRef(null);
  const flyRef=useRef(null);

  // ── Resize ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    const measure=()=>{
      if(!containerRef.current) return;
      const {width,height}=containerRef.current.getBoundingClientRect();
      setDims({w:width||900,h:height||600});
    };
    measure();
    const ro=new ResizeObserver(measure);
    if(containerRef.current) ro.observe(containerRef.current);
    return ()=>ro.disconnect();
  },[]);

  // ── Anim loop ────────────────────────────────────────────────────────────
  useEffect(()=>{
    let id,last=performance.now();
    const vel=driftVel.current;
    function frame(now){
      const dt=(now-last)/1000; last=now;
      setTime(t=>t+dt);
      setDriftPos(prev=>{
        const next={};
        DOMAIN_IDS.forEach(id=>{
          let x=prev[id].x+vel[id].vx;
          let y=prev[id].y+vel[id].vy;
          x+=(LAYOUT[id].x-x)*0.0006;
          y+=(LAYOUT[id].y-y)*0.0006;
          next[id]={x:mod(x,WORLD),y:mod(y,WORLD)};
        });
        return next;
      });
      if(flyRef.current){
        const f=flyRef.current;
        f.t=Math.min(f.t+dt/f.dur,1);
        const ease=t=>t<0.5?2*t*t:(1-Math.pow(-2*t+2,2)/2);
        const e=ease(f.t);
        setCamera({
          x:f.startX+(f.endX-f.startX)*e,
          y:f.startY+(f.endY-f.startY)*e,
          scale:f.startScale+(f.endScale-f.startScale)*e,
        });
        if(f.t>=1) flyRef.current=null;
      }
      id=requestAnimationFrame(frame);
    }
    id=requestAnimationFrame(frame);
    return ()=>cancelAnimationFrame(id);
  },[]);

  const flyTo=useCallback((worldX,worldY,targetScale=1.6,dur=1.0)=>{
    setCamera(c=>{
      flyRef.current={
        startX:c.x,startY:c.y,startScale:c.scale,
        endX:worldX,endY:worldY,endScale:targetScale,
        t:0,dur,
      };
      return c;
    });
  },[]);

  const navigateTo=useCallback((id)=>{
    const pos=driftPos[id]||LAYOUT[id];
    setLocked(id);
    flyTo(pos.x,pos.y,1.8,1.1);
  },[driftPos,flyTo]);

  // ── Pan/zoom ─────────────────────────────────────────────────────────────
  const stopInertia=useCallback(()=>{ if(inertiaId.current){cancelAnimationFrame(inertiaId.current);inertiaId.current=null;} },[]);

  const startInertia=useCallback(()=>{
    stopInertia();
    let {vx,vy}=velRef.current;
    const step=()=>{
      vx*=0.92;vy*=0.92;
      if(Math.abs(vx)<0.05&&Math.abs(vy)<0.05) return;
      setCamera(c=>({...c,x:c.x-vx/c.scale,y:c.y-vy/c.scale}));
      inertiaId.current=requestAnimationFrame(step);
    };
    inertiaId.current=requestAnimationFrame(step);
  },[stopInertia]);

  const onPD=useCallback(e=>{
    if(e.button!==undefined&&e.button!==0) return;
    flyRef.current=null; stopInertia();
    panActive.current=true;
    panLast.current={x:e.clientX,y:e.clientY,t:performance.now()};
    velRef.current={vx:0,vy:0};
    e.currentTarget.setPointerCapture(e.pointerId);
  },[stopInertia]);

  const onPM=useCallback(e=>{
    if(!panActive.current) return;
    const now=performance.now();
    const dx=e.clientX-panLast.current.x,dy=e.clientY-panLast.current.y;
    const dt=now-panLast.current.t||16;
    velRef.current={vx:dx/dt*16,vy:dy/dt*16};
    panLast.current={x:e.clientX,y:e.clientY,t:now};
    setCamera(c=>({...c,x:c.x-dx/c.scale,y:c.y-dy/c.scale}));
  },[]);

  const onPU=useCallback(()=>{ panActive.current=false; startInertia(); },[startInertia]);

  const onWheel=useCallback(e=>{
    e.preventDefault(); flyRef.current=null;
    const factor=e.deltaY>0?0.91:1.10;
    setCamera(c=>{
      const rect=containerRef.current?.getBoundingClientRect();
      if(!rect) return c;
      const mx=e.clientX-rect.left,my=e.clientY-rect.top;
      const wx=c.x+(mx-dims.w/2)/c.scale;
      const wy=c.y+(my-dims.h/2)/c.scale;
      const ns=clamp(c.scale*factor,MIN_SCALE,MAX_SCALE);
      return {scale:ns,x:wx-(mx-dims.w/2)/ns,y:wy-(my-dims.h/2)/ns};
    });
  },[dims]);

  useEffect(()=>{
    const el=containerRef.current;
    if(!el) return;
    el.addEventListener("wheel",onWheel,{passive:false});
    return ()=>el.removeEventListener("wheel",onWheel);
  },[onWheel]);

  const onTS=useCallback(e=>{
    if(e.touches.length===2){
      stopInertia();flyRef.current=null;
      const [a,b]=e.touches;
      pinchRef.current={dist:Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),camScale:camera.scale,camX:camera.x,camY:camera.y,midX:(a.clientX+b.clientX)/2,midY:(a.clientY+b.clientY)/2};
    }
  },[camera,stopInertia]);

  const onTM=useCallback(e=>{
    if(e.touches.length===2&&pinchRef.current){
      e.preventDefault();
      const [a,b]=e.touches;
      const dist=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);
      const ns=clamp(pinchRef.current.camScale*(dist/pinchRef.current.dist),MIN_SCALE,MAX_SCALE);
      const rect=containerRef.current?.getBoundingClientRect();
      if(!rect) return;
      const mx=pinchRef.current.midX-rect.left,my=pinchRef.current.midY-rect.top;
      const wx=pinchRef.current.camX+(mx-dims.w/2)/pinchRef.current.camScale;
      const wy=pinchRef.current.camY+(my-dims.h/2)/pinchRef.current.camScale;
      setCamera({scale:ns,x:wx-(mx-dims.w/2)/ns,y:wy-(my-dims.h/2)/ns});
    }
  },[dims]);

  // ── Hit testing ──────────────────────────────────────────────────────────
  const HIT_R=22/camera.scale;

  function screenToWorld(ex,ey){
    const rect=containerRef.current?.getBoundingClientRect();
    if(!rect) return {wx:0,wy:0};
    const mx=ex-rect.left,my=ey-rect.top;
    return {wx:camera.x+(mx-dims.w/2)/camera.scale,wy:camera.y+(my-dims.h/2)/camera.scale};
  }

  function hitTest(wx,wy){
    let hit=null,best=HIT_R;
    DOMAIN_IDS.forEach(id=>{
      const pos=driftPos[id];
      for(const ox of [-WORLD,0,WORLD]){
        for(const oy of [-WORLD,0,WORLD]){
          const d=Math.hypot(pos.x+ox-wx,pos.y+oy-wy);
          if(d<best){best=d;hit=id;}
        }
      }
    });
    return hit;
  }

  const onMouseMove=useCallback(e=>{
    if(panActive.current) return;
    const {wx,wy}=screenToWorld(e.clientX,e.clientY);
    setActive(hitTest(wx,wy));
  },[camera,driftPos,dims]);

  const onSvgClick=useCallback(e=>{
    const {wx,wy}=screenToWorld(e.clientX,e.clientY);
    const hit=hitTest(wx,wy);
    if(hit){ setLocked(l=>l===hit?null:hit); }
    else { setLocked(null); }
  },[camera,driftPos,dims]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const focusId=locked||active;
  const connectedSet=useMemo(()=>{
    if(!focusId) return null;
    const s=new Set();
    EDGES.forEach(({a,b})=>{ if(a===focusId)s.add(b); if(b===focusId)s.add(a); });
    return s;
  },[focusId]);

  function visibleCopies(pos){
    const pad=200/camera.scale;
    const vx0=camera.x-dims.w/2/camera.scale-pad,vx1=camera.x+dims.w/2/camera.scale+pad;
    const vy0=camera.y-dims.h/2/camera.scale-pad,vy1=camera.y+dims.h/2/camera.scale+pad;
    const copies=[];
    for(const ox of [-WORLD,0,WORLD]){
      for(const oy of [-WORLD,0,WORLD]){
        const cx=pos.x+ox,cy=pos.y+oy;
        if(cx>=vx0&&cx<=vx1&&cy>=vy0&&cy<=vy1) copies.push({x:cx,y:cy});
      }
    }
    return copies;
  }

  const ws=(wx,wy)=>({
    sx:(wx-camera.x)*camera.scale+dims.w/2,
    sy:(wy-camera.y)*camera.scale+dims.h/2,
  });

  const sidebarDomains=useMemo(()=>[...DOMAIN_IDS].sort((a,b)=>DOMAIN_STATS[b].interestCount-DOMAIN_STATS[a].interestCount),[]);

  return (
    <div style={{display:"flex",width:"100%",height:"100vh",background:"#0E1E34",overflow:"hidden",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <div style={{
        width:220,flexShrink:0,
        background:"rgba(14,30,52,0.97)",
        borderRight:"1px solid rgba(200,150,14,0.12)",
        display:"flex",flexDirection:"column",
        overflowY:"auto",
        zIndex:10,
      }}>
        <div style={{padding:"18px 16px 12px",borderBottom:"1px solid rgba(200,150,14,0.1)"}}>
          <div style={{fontSize:9,letterSpacing:3,color:"rgba(200,150,14,0.5)",textTransform:"uppercase",fontWeight:600}}>SOLIS</div>
          <div style={{fontSize:10,letterSpacing:1.5,color:"rgba(200,150,14,0.3)",textTransform:"uppercase",marginTop:3}}>Domain Constellation</div>
        </div>
        <div style={{flex:1,padding:"8px 0"}}>
          {sidebarDomains.map(id=>{
            const meta=DOMAIN_META[id],stats=DOMAIN_STATS[id];
            const isFocus=focusId===id;
            const isConn=connectedSet?.has(id);
            return (
              <button
                key={id}
                onClick={()=>navigateTo(id)}
                style={{
                  display:"block",width:"100%",padding:"8px 16px",
                  background:isFocus?"rgba(200,150,14,0.08)":isConn?"rgba(200,150,14,0.03)":"transparent",
                  border:"none",borderLeft:`2px solid ${isFocus?meta.color:isConn?"rgba(200,150,14,0.15)":"transparent"}`,
                  cursor:"pointer",textAlign:"left",
                  transition:"background 0.2s,border-color 0.2s",
                }}
              >
                <div style={{fontSize:8,letterSpacing:1.5,color:isFocus?meta.color:"rgba(200,150,14,0.25)",textTransform:"uppercase",marginBottom:3,fontWeight:600}}>
                  {meta.short}
                </div>
                <div style={{fontSize:10,color:isFocus?"#fff":isConn?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.4)",letterSpacing:0.5,fontWeight:isFocus?600:400}}>
                  {meta.label}
                </div>
                <div style={{marginTop:5,height:1,background:"rgba(200,150,14,0.15)",borderRadius:1}}>
                  <div style={{height:1,width:`${(stats.interestCount/20)*100}%`,background:isFocus?meta.color:"rgba(200,150,14,0.3)",borderRadius:1,transition:"width 0.3s"}}/>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid rgba(200,150,14,0.08)"}}>
          <div style={{fontSize:8,color:"rgba(200,150,14,0.3)",letterSpacing:1,lineHeight:1.8}}>
            {DOMAIN_IDS.length} domains<br/>
            {EDGES.length} connections<br/>
            {MEMBERS.length} members
          </div>
        </div>
      </div>

      {/* ── CANVAS ───────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{flex:1,position:"relative",overflow:"hidden",cursor:panActive.current?"grabbing":"crosshair"}}
        onPointerDown={onPD}
        onPointerMove={onPM}
        onPointerUp={onPU}
        onPointerCancel={onPU}
        onMouseMove={onMouseMove}
        onMouseLeave={()=>setActive(null)}
        onClick={onSvgClick}
        onTouchStart={onTS}
        onTouchMove={onTM}
        onTouchEnd={onPU}
      >
        <svg width={dims.w} height={dims.h} style={{display:"block",pointerEvents:"none"}}>
          <defs>
            <radialGradient id="bgG" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#142840"/>
              <stop offset="100%" stopColor="#0E1E34"/>
            </radialGradient>
            <filter id="fHalo" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="9" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="fHaloSm" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="fSpike" x="-400%" y="-400%" width="900%" height="900%">
              <feGaussianBlur stdDeviation="1.2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="fEdge" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="1.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="fLabel" x="-60%" y="-200%" width="220%" height="500%">
              <feGaussianBlur stdDeviation="4" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect width={dims.w} height={dims.h} fill="url(#bgG)"/>

          {/* Background stars */}
          {BG_STARS.map((st,i)=>{
            const copies=visibleCopies(st);
            const twinkle=Math.sin(time/st.tp+st.tph)*0.5+0.5;
            return copies.map((cp,ci)=>{
              const {sx,sy}=ws(cp.x,cp.y);
              return <circle key={`${i}-${ci}`} cx={sx} cy={sy} r={st.r} fill="#FFFFFF" opacity={st.op*(0.5+twinkle*0.5)}/>;
            });
          })}

          {/* Edges */}
          {EDGES.map(({a,b,mutual},idx)=>{
            const pa=driftPos[a],pb=driftPos[b];
            const isConn=focusId&&(a===focusId||b===focusId);
            if(focusId&&!isConn) return null;
            let bestDx=pb.x-pa.x,bestDy=pb.y-pa.y;
            for(const ox of [-WORLD,0,WORLD]) for(const oy of [-WORLD,0,WORLD]){
              const dx=pb.x+ox-pa.x,dy=pb.y+oy-pa.y;
              if(dx*dx+dy*dy<bestDx*bestDx+bestDy*bestDy){bestDx=dx;bestDy=dy;}
            }
            const sA=ws(pa.x,pa.y),sB=ws(pa.x+bestDx,pa.y+bestDy);
            if(sA.sx<-50&&sB.sx<-50||sA.sx>dims.w+50&&sB.sx>dims.w+50||
               sA.sy<-50&&sB.sy<-50||sA.sy>dims.h+50&&sB.sy>dims.h+50) return null;
            const ang=idx*0.61803;
            const msx=(sA.sx+sB.sx)/2+Math.sin(ang)*12*camera.scale;
            const msy=(sA.sy+sB.sy)/2+Math.cos(ang)*8*camera.scale;
            const baseOp=0.05+Math.min(mutual/12,1)*0.18;
            const op=isConn?0.75:baseOp;
            const w=isConn?0.5+Math.min(mutual/12,1)*0.9:0.25;
            return (
              <g key={`${a}-${b}`}>
                {isConn&&<path d={`M${sA.sx},${sA.sy}Q${msx},${msy}${sB.sx},${sB.sy}`} stroke="#C8960E" strokeWidth={(w+2)*camera.scale} fill="none" opacity={0.06} filter="url(#fEdge)"/>}
                <path d={`M${sA.sx},${sA.sy}Q${msx},${msy}${sB.sx},${sB.sy}`} stroke={isConn?"#E8B450":"#1A3050"} strokeWidth={w*camera.scale} fill="none" opacity={op} strokeDasharray={isConn?"none":`${3*camera.scale} ${7*camera.scale}`}/>
              </g>
            );
          })}

          {/* Domain nodes */}
          {DOMAIN_IDS.map(id=>{
            const pos=driftPos[id],stats=DOMAIN_STATS[id],meta=DOMAIN_META[id];
            const isFocus=focusId===id;
            const isNeighbour=connectedSet?.has(id);
            const hasFocus=!!focusId;
            const copies=visibleCopies(pos);
            if(!copies.length) return null;

            const sr=starR(stats.peakW)*camera.scale;
            const sl=spikeLen(stats.peakW)*camera.scale;
            const pulse=Math.sin(time*1.1+id.charCodeAt(0)*0.8)*0.5+0.5;
            const twink=Math.sin(time*0.7+id.charCodeAt(2)*1.2)*0.5+0.5;

            let nodeOp;
            if(isFocus) nodeOp=1;
            else if(isNeighbour) nodeOp=0.8;
            else if(hasFocus) nodeOp=0.05;
            else nodeOp=0.5+twink*0.35;

            const starColor=meta.color;
            const showLabel=isFocus||(hasFocus&&isNeighbour);
            const rings=haloRings(stats.interestCount);

            return copies.map((cp,ci)=>{
              const {sx,sy}=ws(cp.x,cp.y);
              return (
                <g key={`${id}-${ci}`} opacity={nodeOp}>
                  {(isFocus||(isNeighbour&&camera.scale>0.5)||(!hasFocus&&camera.scale>0.35))&&rings.map((ring,ri)=>(
                    <circle key={ri} cx={sx} cy={sy}
                      r={ring.r*camera.scale*(isFocus?1.4:1)*(1+pulse*0.08)}
                      fill="none"
                      stroke={starColor}
                      strokeWidth={(isFocus?1.2:0.6-ri*0.15)*camera.scale}
                      opacity={ring.op*(isFocus?2.2:1)*(0.7+pulse*0.3)}
                      filter={ri===0?"url(#fHalo)":"url(#fHaloSm)"}
                    />
                  ))}

                  {(isFocus||(!hasFocus&&camera.scale>0.45))&&[0,90,45,135].map((ang,ai)=>{
                    const rad=ang*Math.PI/180;
                    const len=(isFocus?sl:sl*0.45)*(1+(ai>1?0.5:1));
                    const op2=isFocus?(ai>1?0.3:0.55):(ai>1?0.08:0.15);
                    return (
                      <g key={ang} filter={isFocus?"url(#fSpike)":undefined}>
                        <line x1={sx-Math.cos(rad)*len*0.15} y1={sy-Math.sin(rad)*len*0.15}
                          x2={sx+Math.cos(rad)*len} y2={sy+Math.sin(rad)*len}
                          stroke={starColor} strokeWidth={(isFocus?0.6:0.3)*camera.scale} opacity={op2}
                        />
                        <line x1={sx+Math.cos(rad)*len*0.15} y1={sy+Math.sin(rad)*len*0.15}
                          x2={sx-Math.cos(rad)*len} y2={sy-Math.sin(rad)*len}
                          stroke={starColor} strokeWidth={(isFocus?0.6:0.3)*camera.scale} opacity={op2}
                        />
                      </g>
                    );
                  })}

                  <circle cx={sx} cy={sy} r={sr*(isFocus?1.8:isNeighbour?1.3:1)} fill={starColor}
                    filter={isFocus?"url(#fHaloSm)":undefined}
                  />

                  {showLabel&&(
                    <text x={sx} y={sy-sr-(isFocus?sl*0.5+6:8)*1}
                      textAnchor="middle"
                      fontSize={isFocus?8*camera.scale:6.5*camera.scale}
                      letterSpacing={1.8}
                      fill={isFocus?"#fff":"rgba(200,150,14,0.5)"}
                      fontFamily="inherit"
                      fontWeight={isFocus?600:400}
                      style={{textTransform:"uppercase",pointerEvents:"none"}}
                      filter={isFocus?"url(#fLabel)":undefined}
                      opacity={isFocus?1:0.7}
                    >{meta.label}</text>
                  )}
                </g>
              );
            });
          })}
        </svg>

        {/* HUD */}
        <div style={{position:"absolute",bottom:16,left:16,fontSize:8,letterSpacing:2,color:"rgba(200,150,14,0.3)",textTransform:"uppercase",pointerEvents:"none"}}>
          {Math.round(camera.scale*100)}% · drag · scroll · pinch
        </div>
        {!focusId&&(
          <div style={{position:"absolute",bottom:16,right:16,fontSize:8,letterSpacing:1.5,color:"rgba(200,150,14,0.2)",textTransform:"uppercase",textAlign:"right",pointerEvents:"none"}}>
            hover or tap a star<br/>world wraps at edges
          </div>
        )}

        {active&&!locked&&(
          <HoverChip meta={DOMAIN_META[active]} stats={DOMAIN_STATS[active]}/>
        )}
        {locked&&(
          <DetailPanel
            id={locked}
            meta={DOMAIN_META[locked]}
            stats={DOMAIN_STATS[locked]}
            connectedSet={connectedSet}
            onClose={()=>setLocked(null)}
            onNavigate={navigateTo}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function HoverChip({meta,stats}){
  return (
    <div style={{position:"absolute",top:16,right:16,background:"rgba(14,30,52,0.92)",border:"1px solid rgba(200,150,14,0.15)",borderRadius:4,padding:"10px 14px",pointerEvents:"none",backdropFilter:"blur(8px)",minWidth:160}}>
      <div style={{fontSize:8,letterSpacing:2.5,color:meta.color,textTransform:"uppercase",marginBottom:4,fontWeight:600}}>
        {meta.short}
      </div>
      <div style={{fontSize:13,fontWeight:700,color:"#fff",letterSpacing:0.5,marginBottom:8}}>{meta.label}</div>
      <MiniStat label="peak Ws"  value={stats.peakW}          max={3000} color={meta.color}/>
      <MiniStat label="interest" value={stats.interestCount}   max={20}   color="#C8960E"/>
      <MiniStat label="members"  value={stats.memberCount}     max={15}   color="#4ACCA8"/>
      <div style={{marginTop:7,fontSize:7,color:"rgba(200,150,14,0.35)",letterSpacing:1.5}}>CLICK TO LOCK</div>
    </div>
  );
}

function DetailPanel({id,meta,stats,connectedSet,onClose,onNavigate}){
  const connEdges=EDGES.filter(({a,b})=>a===id||b===id).map(e=>({...e,otherId:e.a===id?e.b:e.a})).sort((x,y)=>y.mutual-x.mutual);
  return (
    <div style={{position:"absolute",bottom:20,right:16,width:220,background:"rgba(14,28,48,0.96)",border:"1px solid rgba(200,150,14,0.15)",borderRadius:4,padding:"16px 18px",backdropFilter:"blur(12px)",boxShadow:"0 0 40px rgba(0,0,0,0.3)"}}>
      <button onClick={onClose} style={{position:"absolute",top:10,right:12,background:"none",border:"none",cursor:"pointer",color:"rgba(200,150,14,0.4)",fontSize:11,padding:2}}>✕</button>
      <div style={{fontSize:8,letterSpacing:2.5,color:meta.color,textTransform:"uppercase",marginBottom:5,fontWeight:600}}>
        {meta.short}
      </div>
      <div style={{fontSize:14,fontWeight:700,color:"#fff",letterSpacing:0.5,marginBottom:12}}>{meta.label}</div>
      <MiniStat label="PEAK WS"    value={stats.peakW}          max={3000} color={meta.color}/>
      <MiniStat label="AVG WS"     value={stats.avgW}           max={3000} color="rgba(200,150,14,0.5)"/>
      <MiniStat label="INTEREST"   value={stats.interestCount}  max={20}   color="#C8960E"/>
      <MiniStat label="MEMBERS"    value={stats.memberCount}    max={15}   color="#4ACCA8"/>
      {connEdges.length>0&&(
        <div style={{marginTop:12,borderTop:"1px solid rgba(200,150,14,0.1)",paddingTop:10}}>
          <div style={{fontSize:8,letterSpacing:1.5,color:"rgba(200,150,14,0.35)",textTransform:"uppercase",marginBottom:8}}>Strongest Links</div>
          {connEdges.slice(0,5).map(({otherId,mutual})=>(
            <button key={otherId} onClick={()=>onNavigate(otherId)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",background:"none",border:"none",cursor:"pointer",padding:"3px 0",marginBottom:2}}>
              <span style={{fontSize:9,color:"rgba(200,150,14,0.5)",textTransform:"uppercase",letterSpacing:1}}>{DOMAIN_META[otherId].short}</span>
              <span style={{fontSize:9,color:"rgba(200,150,14,0.6)",fontWeight:600}}>{mutual}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{marginTop:10,fontSize:7,color:"rgba(200,150,14,0.25)",letterSpacing:1}}>{connectedSet.size} CONNECTED · {MEMBERS.length} MEMBERS</div>
    </div>
  );
}

function MiniStat({label,value,max,color}){
  return (
    <div style={{marginBottom:7}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(200,150,14,0.4)",textTransform:"uppercase"}}>{label}</span>
        <span style={{fontSize:9,color,fontWeight:600}}>{typeof value==="number"?value.toLocaleString():value}</span>
      </div>
      <div style={{height:1,background:"rgba(200,150,14,0.15)",borderRadius:1}}>
        <div style={{height:1,width:`${Math.min(value/max,1)*100}%`,background:color,borderRadius:1,opacity:0.55}}/>
      </div>
    </div>
  );
}
