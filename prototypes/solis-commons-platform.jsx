import { useState } from "react";

const C = {
  bg:"#F2F5F9",white:"#FFFFFF",surface:"#F8FAFB",
  border:"#DDE3EC",borderFaint:"#EBF0F6",
  navy:"#0E1E34",navyMid:"#1A3255",navyLight:"#243D5E",
  gold:"#9A6F0A",goldRule:"#C8960E",goldBg:"#FDF6E8",
  blue:"#1A5296",blueLight:"#2468C0",
  green:"#1A6640",greenBg:"#E8F5EE",greenBorder:"#B8DECA",
  amber:"#8A5800",amberBg:"#FDF3E0",amberBorder:"#F0D8A0",
  purple:"#5A2896",purpleBg:"#F2EBFC",purpleBorder:"#D4BAEE",
  red:"#8A1F1F",redBg:"#FCEAEA",redBorder:"#F0BABA",
  text:"#18293D",muted:"#526070",faint:"#8A9DB0",
  sidebar:"#0E1E34",
};

function SolMark({size=20,light=false}){
  const cx=size/2,cy=size/2,sc=size/44;
  const bodies=[{a:51.81,r:3.5},{a:314.66,r:6.1},{a:37.46,r:7.2},{a:158.10,r:9.0},{a:160.62,r:11.2},{a:61.97,r:13.3},{a:55.06,r:15.5},{a:322.38,r:17.9},{a:308.07,r:19.5},{a:239.22,r:20.6},{a:199.07,r:20.9},{a:172.99,r:21.2},{a:204.54,r:22.4},{a:259.00,r:23.0}];
  const rad=d=>d*Math.PI/180;
  const pt=(a,r)=>({x:cx+r*sc*Math.cos(rad(a)),y:cy+r*sc*Math.sin(rad(a))});
  const stroke=light?"rgba(255,255,255,0.75)":"#0E1E34";
  return(
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
      {bodies.map((b,i)=>{const p=pt(b.a,b.r);return(<g key={i}><line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={stroke} strokeWidth={0.55*sc} opacity={0.85}/><circle cx={p.x} cy={p.y} r={(b.r>18?0.9:0.65)*sc} fill={i===13?"none":stroke} stroke={i===13?stroke:"none"} strokeWidth={i===13?0.6*sc:0}/></g>);})}
      <circle cx={cx} cy={cy} r={0.9*sc} fill="#C8960E"/>
    </svg>
  );
}

const ME={name:"Oumo S.",initials:"OS",domains:["Space Law","Mars Habitability","Remote Sensing"],standing:847};

const feed=[
  {id:1,domain:"Space Law",title:"Liability frameworks for debris-generating manoeuvres — who bears responsibility when avoidance fails?",author:"Ssempa D.",authorInitials:"SD",time:"3h",replies:8,tag:"Discussion",stewardEndorsed:{name:"Akello J.",domain:"Space Law"}},
  {id:2,domain:"Mars Habitability",title:"Psychological design in confined habitats — lessons from Antarctic stations",author:"Namugga C.",authorInitials:"NC",time:"7h",replies:14,tag:"Discussion",stewardEndorsed:null},
  {id:3,domain:"Remote Sensing",title:"Sentinel-2 data access for East Africa — current limitations and workarounds",author:"Mwenda T.",authorInitials:"MT",time:"1d",replies:5,tag:"Question",stewardEndorsed:null},
  {id:4,domain:"Space Law",title:"ITU coordination procedures — a plain language walkthrough",author:"Akello J.",authorInitials:"AJ",time:"2d",replies:22,tag:"Guide",tier2Approved:true,stewardEndorsed:null},
];

const undertakings=[
  {id:1,title:"East Africa Space Sector Mapping",domains:["Policy","Remote Sensing"],participants:7,status:"Active",progress:60,role:"Contributor",lead:"Okello R."},
  {id:2,title:"Space Debris Liability Framework Review",domains:["Space Law"],participants:4,status:"Active",progress:30,role:"Lead",lead:"You"},
  {id:3,title:"Swahili Space Terminology",domains:["Education","Communications"],participants:11,status:"Active",progress:75,role:"Observer",lead:"Kimani A."},
];

const circleCellMessages=[
  {author:"Akello J.",initials:"AJ",time:"2h",text:"The Ssempa discussion on debris liability has 22 replies and strong engagement from verified Space Law participants. Proposing we elevate it to an Observatory article. Thoughts?"},
  {author:"Namugga C.",initials:"NC",time:"1h",text:"Agreed. Quality is strong. I'd suggest requesting a summary section from Ssempa before we approve. Should we commission an xSTF for editorial review or handle in-circle?"},
  {author:"Akello J.",initials:"AJ",time:"45m",text:"In-circle is fine for this one. I'll reach out to Ssempa and set a 5-day window for revision before formal approval."},
  {author:"System",initials:"◆",time:"30m",text:"Decision logged: Elevation of thread #4 to Observatory article pending author revision. aSTF notified.",isSystem:true},
];

const undertakingCellMessages=[
  {author:"Okello R.",initials:"OR",time:"3h",text:"Kenya section is 80% done. Missing satellite programme funding data. Anyone have contacts at KSA?"},
  {author:"Kimani A.",initials:"KA",time:"2h",text:"I have a contact. Will reach out today. Also — should we include private operators or focus on government and academic?"},
  {author:"You",initials:"OS",time:"1h",text:"Both. The private sector data is thin but worth capturing even if incomplete. Let's flag gaps explicitly rather than exclude."},
  {author:"Okello R.",initials:"OR",time:"45m",text:"Agreed. I'll add a 'data quality' field to the schema. Mwenda, can you review the Uganda section draft by Friday?"},
];

const competences=[
  {domain:"Space Law",declared:1800,verified:1720,status:"verified"},
  {domain:"Remote Sensing",declared:1200,verified:1150,status:"verified"},
  {domain:"Mars Habitability",declared:600,verified:null,status:"pending"},
  {domain:"Policy Analysis",declared:900,verified:920,status:"verified"},
];

const interests=["Mars Habitability","Space Law","Lunar Infrastructure","East Africa Space Sector","Space Governance","Remote Sensing Applications"];

const stfInvitation={type:"vSTF",label:"Candidate Verification",ref:"vSTF-2026-0847",expires:"Jul 19, 2026",subject:"Stewardship candidate — Policy & Advocacy circle",task:"Investigate and evaluate the competence and suitability of three candidates for the Policy & Advocacy stewardship circle. Review submitted evidence, domain declarations, and interest alignment. Return your collective assessment within 7 days.",commitment:"Est. 4–6 hours",domains:["Space Law","Policy"],why:"Selected based on verified competence in Space Law (1720/3000) and declared interest in Space Governance."};

const domainColors={
  "Space Law":{bg:C.purpleBg,color:C.purple,border:C.purpleBorder},
  "Remote Sensing":{bg:C.greenBg,color:C.green,border:C.greenBorder},
  "Mars Habitability":{bg:C.amberBg,color:C.amber,border:C.amberBorder},
  "Policy":{bg:"#EBF3FC",color:C.blue,border:"#C4D9F0"},
  "Education":{bg:C.greenBg,color:C.green,border:C.greenBorder},
  "Communications":{bg:C.amberBg,color:C.amber,border:C.amberBorder},
  "default":{bg:"#F0F4F8",color:C.muted,border:C.border},
};

const Tag=({children,small})=>{
  const s=domainColors[children]||domainColors.default;
  return <span style={{display:"inline-block",fontSize:small?9:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",padding:small?"2px 6px":"3px 7px",borderRadius:3,background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>{children}</span>;
};

const Avatar=({initials,size=32,gold=false,system=false})=>(
  <div style={{width:size,height:size,borderRadius:system?"4px":"50%",background:system?"rgba(255,255,255,.15)":gold?C.goldRule:C.navyLight,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:size*0.32,fontWeight:600,flexShrink:0,fontFamily:"inherit"}}>{initials}</div>
);

const StandingBar=({value,max=3000,width=120,color})=>(
  <div style={{width,height:4,background:C.borderFaint,borderRadius:2,overflow:"hidden"}}>
    <div style={{width:`${Math.min((value/max)*100,100)}%`,height:"100%",background:color||C.goldRule,borderRadius:2}}/>
  </div>
);

export default function App(){
  const [page,setPage]=useState("Home");
  const [cellView,setCellView]=useState("circle");

  const navItems=[
    {id:"Home",icon:"⌂",label:"Home"},
    {id:"Discussions",icon:"◎",label:"Discussions"},
    {id:"Undertakings",icon:"◈",label:"Undertakings"},
    {id:"Cells",icon:"⬡",label:"Cells"},
    {id:"Observatory",icon:"◉",label:"Observatory"},
    {id:"Participants",icon:"◷",label:"Participants"},
    {id:"STF",icon:"◆",label:"Task Forces"},
    {id:"Profile",icon:"◌",label:"My Profile"},
  ];

  return(
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",background:C.bg,minHeight:"100vh",display:"flex"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .serif{font-family:'Playfair Display',Georgia,serif}
        .card{background:${C.white};border:1px solid ${C.border};border-radius:5px;transition:box-shadow .15s}
        .card:hover{box-shadow:0 2px 10px rgba(14,30,52,.06)}
        .gb{background:${C.navy};color:#fff;font-family:inherit;font-weight:600;font-size:12px;padding:8px 18px;border-radius:4px;border:none;cursor:pointer}
        .gb:hover{background:${C.navyMid}}
        .ob{background:${C.white};color:${C.text};font-family:inherit;font-weight:500;font-size:12px;padding:8px 18px;border-radius:4px;border:1px solid ${C.border};cursor:pointer}
        .ob:hover{border-color:${C.faint}}
        .sl{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${C.faint};margin-bottom:14px}
        .msg-input{width:100%;border:1px solid ${C.border};border-radius:4px;padding:10px 12px;font-family:inherit;font-size:13px;color:${C.text};outline:none;resize:none}
        .msg-input:focus{border-color:${C.navyLight}}
      `}</style>

      {/* Sidebar */}
      <div style={{width:220,background:C.sidebar,display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,bottom:0,zIndex:40}}>
        <div style={{padding:"20px 20px 16px",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <SolMark size={22} light/>
            <div>
              <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:14,fontWeight:700,color:"#fff"}}>Solis</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.35)",letterSpacing:".06em",marginTop:1}}>COMMONS</div>
            </div>
          </div>
        </div>
        <nav style={{flex:1,padding:"12px 10px",overflowY:"auto"}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>setPage(n.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:4,border:"none",cursor:"pointer",background:page===n.id?"rgba(255,255,255,.1)":"transparent",color:page===n.id?"#fff":"rgba(255,255,255,.5)",fontSize:13,fontWeight:page===n.id?500:400,fontFamily:"inherit",textAlign:"left",transition:"all .15s",marginBottom:2}}>
              <span style={{fontSize:14,opacity:.8}}>{n.icon}</span>
              {n.label}
              {n.id==="STF"&&<span style={{marginLeft:"auto",background:C.goldRule,color:"#fff",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:8}}>1</span>}
            </button>
          ))}
        </nav>
        <div style={{padding:"14px 16px",borderTop:"1px solid rgba(255,255,255,.08)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Avatar initials={ME.initials} size={30} gold/>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"#fff"}}>{ME.name}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>Standing {ME.standing}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{marginLeft:220,flex:1,display:"flex",flexDirection:"column",minHeight:"100vh"}}>
        <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"0 28px",height:48,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:30}}>
          <div style={{fontSize:14,fontWeight:600,color:C.navy}}>{navItems.find(n=>n.id===page)?.label||"Commons"}</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:12,color:C.faint,fontStyle:"italic"}}>Ultra hic et nunc</span>
            <div style={{width:1,height:16,background:C.border}}/>
            <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:C.muted,position:"relative"}} onClick={()=>setPage("STF")}>
              🔔<span style={{position:"absolute",top:-2,right:-2,background:C.goldRule,color:"#fff",fontSize:8,fontWeight:700,width:12,height:12,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>1</span>
            </button>
          </div>
        </div>

        <div style={{flex:1,padding:"28px",overflowY:"auto"}}>
          {page==="Home"         &&<HomePage setPage={setPage}/>}
          {page==="Discussions"  &&<DiscussionsPage/>}
          {page==="Undertakings" &&<UndertakingsPage setPage={setPage}/>}
          {page==="Cells"        &&<CellsPage cellView={cellView} setCellView={setCellView}/>}
          {page==="STF"          &&<STFPage/>}
          {page==="Profile"      &&<ProfilePage setPage={setPage}/>}
          {page==="Participants" &&<ParticipantsPage/>}
          {page==="Observatory"  &&<ObsPage/>}
          {page==="Undertaking:1"&&<UndertakingDetail setPage={setPage}/>}
        </div>
      </div>
    </div>
  );

  function HomePage({setPage}){
    return(
      <div style={{maxWidth:900}}>
        <div style={{background:C.goldBg,border:`1px solid ${C.amberBorder}`,borderRadius:5,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>◆</span>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:C.navy,marginBottom:2}}>Pending STF invitation — vSTF Candidate Verification</div>
              <div style={{fontSize:12,color:C.muted}}>Ref: vSTF-2026-0847 · Expires Jul 19, 2026 · Est. 4–6 hours</div>
            </div>
          </div>
          <button className="gb" style={{whiteSpace:"nowrap"}} onClick={()=>setPage("STF")}>View invitation</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:24}}>
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div className="sl" style={{margin:0}}>Your domain feed</div>
              <div style={{display:"flex",gap:6}}>{ME.domains.map(d=><Tag key={d}>{d}</Tag>)}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {feed.map(f=>(
                <div key={f.id} className="card" style={{padding:"16px 18px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <Tag>{f.domain}</Tag>
                    <span style={{fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:C.muted}}>{f.tag}</span>
                    {f.tier2Approved&&<span style={{fontSize:10,fontWeight:600,letterSpacing:".05em",textTransform:"uppercase",background:"#EBF3FC",color:C.blue,border:"1px solid #C4D9F0",padding:"2px 6px",borderRadius:3}}>Observatory article</span>}
                  </div>
                  <p style={{fontSize:14,fontWeight:500,color:C.text,lineHeight:1.5,marginBottom:8}}>{f.title}</p>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <Avatar initials={f.authorInitials} size={20}/>
                    <span style={{fontSize:12,color:C.muted}}>{f.author}</span>
                    <span style={{fontSize:12,color:C.faint}}>{f.time} ago</span>
                    <span style={{fontSize:12,color:C.faint,marginLeft:"auto"}}>{f.replies} replies</span>
                  </div>
                  {f.stewardEndorsed&&(
                    <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.borderFaint}`,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,background:C.goldBg,color:C.gold,border:`1px solid ${C.amberBorder}`,padding:"3px 8px",borderRadius:3,fontWeight:600}}>★ Steward endorsement</span>
                      <span style={{fontSize:11,color:C.muted}}>{f.stewardEndorsed.name} · {f.stewardEndorsed.domain} steward</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div className="card" style={{padding:"16px"}}>
              <div className="sl">Your undertakings</div>
              {undertakings.slice(0,2).map(e=>(
                <div key={e.id} style={{paddingBottom:12,marginBottom:12,borderBottom:`1px solid ${C.borderFaint}`}}>
                  <div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:6,lineHeight:1.4}}>{e.title}</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:11,color:C.muted}}>{e.role}</span>
                    <span style={{fontSize:11,color:C.faint}}>{e.participants} participants</span>
                  </div>
                  <div style={{height:3,background:C.borderFaint,borderRadius:2,overflow:"hidden"}}>
                    <div style={{width:`${e.progress}%`,height:"100%",background:e.role==="Lead"?C.goldRule:C.navyLight,borderRadius:2}}/>
                  </div>
                </div>
              ))}
              <button className="ob" style={{width:"100%",marginTop:4}} onClick={()=>setPage("Undertakings")}>All undertakings</button>
            </div>
            <div className="card" style={{padding:"16px"}}>
              <div className="sl">Standing</div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:8}}>
                <span style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:28,fontWeight:700,color:C.navy}}>{ME.standing}</span>
                <span style={{fontSize:12,color:C.faint}}>/ 3000</span>
              </div>
              <StandingBar value={ME.standing} max={3000} width={200}/>
              <div style={{fontSize:11,color:C.muted,marginTop:8,lineHeight:1.6}}>2 completed STF assignments · 1 active stewardship</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function DiscussionsPage(){
    return(
      <div style={{maxWidth:800}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {["All","Space Law","Mars Habitability","Remote Sensing"].map(d=>(
              <button key={d} style={{fontSize:11,fontWeight:600,letterSpacing:".05em",textTransform:"uppercase",padding:"5px 12px",borderRadius:3,border:`1px solid ${d==="All"?C.navy:C.border}`,background:d==="All"?C.navy:C.white,color:d==="All"?"#fff":C.muted,cursor:"pointer",fontFamily:"inherit"}}>{d}</button>
            ))}
          </div>
          <button className="gb">+ New discussion</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {feed.map(f=>(
            <div key={f.id} className="card" style={{padding:"18px 20px",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <Tag>{f.domain}</Tag>
                <span style={{fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:C.muted}}>{f.tag}</span>
                {f.tier2Approved&&<span style={{fontSize:10,fontWeight:600,background:"#EBF3FC",color:C.blue,border:"1px solid #C4D9F0",padding:"2px 6px",borderRadius:3}}>↑ Observatory</span>}
              </div>
              <p style={{fontSize:15,fontWeight:500,color:C.text,lineHeight:1.5,marginBottom:10}}>{f.title}</p>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <Avatar initials={f.authorInitials} size={20}/>
                <span style={{fontSize:12,color:C.muted}}>{f.author} · {f.time} ago</span>
                <span style={{fontSize:12,color:C.faint,marginLeft:"auto"}}>{f.replies} replies</span>
              </div>
              {f.stewardEndorsed&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.borderFaint}`,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,background:C.goldBg,color:C.gold,border:`1px solid ${C.amberBorder}`,padding:"3px 8px",borderRadius:3,fontWeight:600}}>★ Steward endorsement</span>
                  <span style={{fontSize:11,color:C.muted}}>{f.stewardEndorsed.name} · {f.stewardEndorsed.domain} steward</span>
                  <span style={{fontSize:11,color:C.faint,marginLeft:"auto"}}>Carries domain authority</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function UndertakingsPage({setPage}){
    return(
      <div style={{maxWidth:900}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div className="sl" style={{margin:0}}>Active undertakings</div>
          <button className="gb">+ Propose undertaking</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {undertakings.map(e=>(
            <div key={e.id} className="card" style={{padding:"18px 20px",cursor:"pointer"}} onClick={()=>setPage("Undertaking:1")}>
              <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>{e.domains.map(d=><Tag key={d}>{d}</Tag>)}</div>
              <p style={{fontSize:14,fontWeight:600,color:C.text,lineHeight:1.4,marginBottom:12}}>{e.title}</p>
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:11,color:C.muted}}>Progress</span>
                  <span style={{fontSize:11,color:C.muted}}>{e.progress}%</span>
                </div>
                <div style={{height:3,background:C.borderFaint,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${e.progress}%`,height:"100%",background:e.role==="Lead"?C.goldRule:C.navyLight,borderRadius:2}}/>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:11,color:C.muted}}>Lead: {e.lead} · {e.participants} participants</span>
                <span style={{fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",background:e.role==="Lead"?C.goldBg:e.role==="Contributor"?C.greenBg:"#F0F4F8",color:e.role==="Lead"?C.amber:e.role==="Contributor"?C.green:C.muted,padding:"3px 8px",borderRadius:3,border:`1px solid ${e.role==="Lead"?C.amberBorder:e.role==="Contributor"?C.greenBorder:C.border}`}}>{e.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function UndertakingDetail({setPage}){
    const e=undertakings[0];
    return(
      <div style={{maxWidth:800}}>
        <button onClick={()=>setPage("Undertakings")} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:C.muted,marginBottom:16,fontFamily:"inherit"}}>← Back to undertakings</button>
        <div style={{display:"flex",gap:8,marginBottom:12}}>{e.domains.map(d=><Tag key={d}>{d}</Tag>)}</div>
        <h1 style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:26,fontWeight:700,color:C.navy,marginBottom:6}}>{e.title}</h1>
        <p style={{fontSize:13,color:C.muted,marginBottom:24}}>Lead: {e.lead} · {e.participants} participants · Started Apr 2026</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 260px",gap:20}}>
          <div>
            <div className="card" style={{padding:"18px 20px",marginBottom:14}}>
              <div className="sl">Mandate</div>
              <p style={{fontSize:14,color:C.text,lineHeight:1.7}}>Produce a comprehensive mapping of the East African space sector — active organisations, initiatives, funding sources, academic programmes, and key individuals. Deliverable: a structured dataset and accompanying report, archived in the Observatory.</p>
            </div>
            <div className="card" style={{padding:"18px 20px",marginBottom:14}}>
              <div className="sl">Undertaking cell — recent activity</div>
              <div style={{background:C.surface,border:`1px solid ${C.borderFaint}`,borderRadius:4,padding:"14px 16px",marginBottom:12}}>
                <p style={{fontSize:12,color:C.muted,marginBottom:0}}>This cell is private to undertaking participants. The discussion below is visible only to you and your fellow participants.</p>
              </div>
              {undertakingCellMessages.map((m,i)=>(
                <div key={i} style={{display:"flex",gap:10,paddingBottom:12,marginBottom:12,borderBottom:i<undertakingCellMessages.length-1?`1px solid ${C.borderFaint}`:"none"}}>
                  <Avatar initials={m.initials} size={28} gold={m.initials==="OS"}/>
                  <div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600,color:m.initials==="OS"?C.gold:C.text}}>{m.author}</span>
                      <span style={{fontSize:11,color:C.faint}}>{m.time} ago</span>
                    </div>
                    <p style={{fontSize:13,color:C.text,lineHeight:1.6}}>{m.text}</p>
                  </div>
                </div>
              ))}
              <textarea className="msg-input" rows={2} placeholder="Add to the undertaking cell..."/>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="card" style={{padding:"16px"}}>
              <div className="sl">Progress</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:8}}>
                <span style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:32,fontWeight:700,color:C.navy}}>{e.progress}%</span>
              </div>
              <StandingBar value={e.progress} max={100} width={220}/>
            </div>
            <div className="card" style={{padding:"16px"}}>
              <div className="sl">Participants ({e.participants})</div>
              {[{n:"Okello R.",i:"OR"},{n:"Kimani A.",i:"KA"},{n:"Mwenda T.",i:"MT"},{n:"Oumo S.",i:"OS"},{n:"Ssempa D.",i:"SD"}].map((p,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <Avatar initials={p.i} size={26} gold={p.i==="OS"}/>
                  <span style={{fontSize:12,color:p.i==="OS"?C.gold:C.text,fontWeight:p.i==="OS"?600:400}}>{p.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function CellsPage({cellView,setCellView}){
    return(
      <div style={{maxWidth:900}}>
        <div style={{display:"flex",gap:8,marginBottom:24}}>
          {[["circle","Circle Cell — Publications"],["undertaking","Undertaking Cell — East Africa Mapping"]].map(([id,label])=>(
            <button key={id} onClick={()=>setCellView(id)} style={{padding:"8px 16px",borderRadius:4,border:`1px solid ${cellView===id?C.navy:C.border}`,background:cellView===id?C.navy:C.white,color:cellView===id?"#fff":C.muted,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
          ))}
        </div>

        {cellView==="circle"?(
          <div style={{maxWidth:700}}>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:5,padding:"12px 16px",marginBottom:16,display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:18}}>⬡</span>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.navy}}>Publications Steward Circle — Circle Cell</div>
                <div style={{fontSize:12,color:C.muted}}>Private to circle members · aSTF has read access · All messages logged</div>
              </div>
              <span style={{marginLeft:"auto",fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",background:C.greenBg,color:C.green,border:`1px solid ${C.greenBorder}`,padding:"3px 8px",borderRadius:3}}>Circle Cell</span>
            </div>
            <div className="card" style={{padding:"20px 22px"}}>
              {circleCellMessages.map((m,i)=>(
                <div key={i} style={{display:"flex",gap:10,paddingBottom:14,marginBottom:14,borderBottom:i<circleCellMessages.length-1?`1px solid ${C.borderFaint}`:"none"}}>
                  <Avatar initials={m.initials} size={30} system={m.isSystem}/>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600,color:m.isSystem?"rgba(255,255,255,.7)":C.text}}>{m.author}</span>
                      <span style={{fontSize:11,color:C.faint}}>{m.time} ago</span>
                      {m.isSystem&&<span style={{fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",background:"#EBF3FC",color:C.blue,border:"1px solid #C4D9F0",padding:"2px 6px",borderRadius:3}}>System log</span>}
                    </div>
                    <p style={{fontSize:13,color:m.isSystem?C.blue:C.text,lineHeight:1.65}}>{m.text}</p>
                  </div>
                </div>
              ))}
              <textarea className="msg-input" rows={2} placeholder="Add to circle cell..."/>
              <div style={{marginTop:8,fontSize:11,color:C.faint}}>All messages are recorded and readable by the aSTF. This is the deliberation record.</div>
            </div>
          </div>
        ):(
          <div style={{maxWidth:700}}>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:5,padding:"12px 16px",marginBottom:16,display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:18}}>⬡</span>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.navy}}>East Africa Space Sector Mapping — Undertaking Cell</div>
                <div style={{fontSize:12,color:C.muted}}>Private to 7 undertaking participants · Archived on completion</div>
              </div>
              <span style={{marginLeft:"auto",fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",background:C.amberBg,color:C.amber,border:`1px solid ${C.amberBorder}`,padding:"3px 8px",borderRadius:3}}>Undertaking Cell</span>
            </div>
            <div className="card" style={{padding:"20px 22px"}}>
              {undertakingCellMessages.map((m,i)=>(
                <div key={i} style={{display:"flex",gap:10,paddingBottom:14,marginBottom:14,borderBottom:i<undertakingCellMessages.length-1?`1px solid ${C.borderFaint}`:"none"}}>
                  <Avatar initials={m.initials} size={30} gold={m.initials==="OS"}/>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600,color:m.initials==="OS"?C.gold:C.text}}>{m.author}</span>
                      <span style={{fontSize:11,color:C.faint}}>{m.time} ago</span>
                    </div>
                    <p style={{fontSize:13,color:C.text,lineHeight:1.65}}>{m.text}</p>
                  </div>
                </div>
              ))}
              <textarea className="msg-input" rows={2} placeholder="Add to undertaking cell..."/>
            </div>
          </div>
        )}
      </div>
    );
  }

  function STFPage(){
    const [accepted,setAccepted]=useState(false);
    return(
      <div style={{maxWidth:700}}>
        <div className="sl">Pending invitation</div>
        {!accepted?(
          <div style={{background:C.white,border:`2px solid ${C.goldRule}`,borderRadius:6,padding:"28px 32px",marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div style={{width:40,height:40,borderRadius:5,background:C.goldBg,border:`1px solid ${C.amberBorder}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>◆</div>
              <div>
                <div style={{fontSize:11,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",color:C.gold,marginBottom:2}}>{stfInvitation.type} · {stfInvitation.label}</div>
                <div style={{fontSize:12,color:C.faint}}>Ref: {stfInvitation.ref}</div>
              </div>
              <div style={{marginLeft:"auto",textAlign:"right"}}>
                <div style={{fontSize:11,color:C.faint}}>Expires</div>
                <div style={{fontSize:13,fontWeight:600,color:C.amber}}>{stfInvitation.expires}</div>
              </div>
            </div>
            <h2 style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:20,fontWeight:700,color:C.navy,marginBottom:12}}>{stfInvitation.subject}</h2>
            <p style={{fontSize:14,color:C.text,lineHeight:1.75,marginBottom:16}}>{stfInvitation.task}</p>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"12px 16px",marginBottom:20}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[["Commitment",stfInvitation.commitment],["Domains",stfInvitation.domains.join(", ")],["Why selected",stfInvitation.why]].map(([label,val],i)=>(
                  <div key={i} style={{gridColumn:i===2?"1 / -1":"auto"}}>
                    <div style={{fontSize:10,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",color:C.faint,marginBottom:3}}>{label}</div>
                    <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:"#F2F5F9",borderRadius:4,padding:"10px 14px",marginBottom:20}}>
              <p style={{fontSize:12,color:C.muted,lineHeight:1.6}}>You do not know who else is on this task force until all members are confirmed. Declining carries no standing penalty.</p>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="gb" onClick={()=>setAccepted(true)}>Accept assignment</button>
              <button className="ob">Decline</button>
            </div>
          </div>
        ):(
          <div style={{background:C.greenBg,border:`1px solid ${C.greenBorder}`,borderRadius:6,padding:"24px 28px",marginBottom:24}}>
            <div style={{fontSize:14,fontWeight:600,color:C.green,marginBottom:6}}>✓ Assignment accepted — vSTF-2026-0847</div>
            <p style={{fontSize:13,color:C.text,lineHeight:1.6}}>You will receive access to candidate materials within 24 hours. Your identity remains confidential until all members confirm.</p>
          </div>
        )}
        <div className="sl" style={{marginTop:8}}>Past assignments</div>
        {[{type:"aSTF",label:"Governance Audit",ref:"aSTF-2026-0612",completed:"May 14, 2026",outcome:"Filed — no issues found"},{type:"xSTF",label:"Execution — Sector Report",ref:"xSTF-2026-0451",completed:"Mar 2, 2026",outcome:"Deliverable accepted"}].map((s,i)=>(
          <div key={i} className="card" style={{padding:"14px 18px",display:"grid",gridTemplateColumns:"auto 1fr auto",gap:16,alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:s.type==="aSTF"?C.blue:C.green,background:s.type==="aSTF"?"#EBF3FC":C.greenBg,padding:"4px 8px",borderRadius:3,border:`1px solid ${s.type==="aSTF"?"#C4D9F0":C.greenBorder}`}}>{s.type}</span>
            <div><div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:2}}>{s.label}</div><div style={{fontSize:11,color:C.faint}}>{s.ref} · Completed {s.completed}</div></div>
            <div style={{fontSize:12,color:C.green}}>{s.outcome}</div>
          </div>
        ))}
      </div>
    );
  }

  function ProfilePage({setPage}){
    return(
      <div style={{maxWidth:800}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:20,marginBottom:28}}>
          <Avatar initials={ME.initials} size={64} gold/>
          <div style={{flex:1}}>
            <h1 style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:28,fontWeight:700,color:C.navy,marginBottom:4}}>Oumo Samuel</h1>
            <p style={{fontSize:13,color:C.muted,marginBottom:10}}>Kampala, Uganda · Participant since Jul 2026</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{ME.domains.map(d=><Tag key={d}>{d}</Tag>)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:C.faint,marginBottom:2}}>Standing</div>
            <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:32,fontWeight:700,color:C.navy}}>{ME.standing}</div>
            <StandingBar value={ME.standing} max={3000} width={140}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div>
            <div className="card" style={{padding:"18px 20px"}}>
              <div className="sl">Competence declarations</div>
              {competences.map((c,i)=>(
                <div key={i} style={{paddingBottom:14,marginBottom:14,borderBottom:i<competences.length-1?`1px solid ${C.borderFaint}`:"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <Tag>{c.domain}</Tag>
                    <span style={{fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:c.status==="verified"?C.green:C.amber}}>{c.status}</span>
                  </div>
                  <div style={{display:"flex",gap:16,marginBottom:6}}>
                    <div><div style={{fontSize:10,color:C.faint,marginBottom:2}}>Declared</div><div style={{fontSize:13,fontWeight:600,color:C.text}}>{c.declared}<span style={{fontSize:11,color:C.faint}}>/3000</span></div></div>
                    {c.verified?<div><div style={{fontSize:10,color:C.faint,marginBottom:2}}>Verified</div><div style={{fontSize:13,fontWeight:600,color:C.green}}>{c.verified}<span style={{fontSize:11,color:C.faint}}>/3000</span></div></div>:<div><div style={{fontSize:10,color:C.faint,marginBottom:2}}>Verified</div><div style={{fontSize:12,color:C.amber}}>Pending vSTF</div></div>}
                  </div>
                  <StandingBar value={c.verified||c.declared} max={3000} width={200} color={c.status==="verified"?C.green:C.amber}/>
                </div>
              ))}
              <button className="ob" style={{width:"100%",marginTop:4}}>+ Add competence declaration</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div className="card" style={{padding:"18px 20px"}}>
              <div className="sl">Declared interests</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{interests.map(i=><span key={i} style={{fontSize:11,color:C.navy,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 10px"}}>{i}</span>)}</div>
              <button className="ob" style={{width:"100%",marginTop:14}}>Edit interests</button>
            </div>
            <div className="card" style={{padding:"18px 20px"}}>
              <div className="sl">Affiliations</div>
              {["Uganda Astronomical Society","Space Generation Advisory Council"].map((a,i)=>(
                <div key={i} style={{fontSize:13,color:C.text,paddingBottom:8,marginBottom:8,borderBottom:i<1?`1px solid ${C.borderFaint}`:"none"}}>{a}</div>
              ))}
              <button className="ob" style={{width:"100%",marginTop:4}}>+ Add affiliation</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ParticipantsPage(){
    const pp=[{n:"Akello J.",i:"AJ",d:["Commons & Knowledge","Astrophysics"],s:1240,l:"Kampala"},{n:"Mwenda T.",i:"MT",d:["Remote Sensing","Events"],s:890,l:"Kampala"},{n:"Namugga C.",i:"NC",d:["Publications","Space Medicine"],s:1050,l:"Entebbe"},{n:"Ssempa D.",i:"SD",d:["Space Law","Policy"],s:760,l:"Kampala"},{n:"Nakabugo B.",i:"NB",d:["Policy","AfAS Relations"],s:630,l:"Kampala"},{n:"Kimani A.",i:"KA",d:["Education","Communications"],s:980,l:"Nairobi"},{n:"Osei K.",i:"OK",d:["Propulsion","Launch Systems"],s:1380,l:"Accra"},{n:"Diallo M.",i:"DM",d:["Space Finance","Entrepreneurship"],s:720,l:"Dakar"}];
    return(
      <div style={{maxWidth:900}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div className="sl" style={{margin:0}}>{pp.length} participants visible</div>
          <input placeholder="Search..." style={{fontSize:12,border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 12px",outline:"none",fontFamily:"inherit",color:C.text,width:200}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          {pp.map((p,i)=>(
            <div key={i} className="card" style={{padding:"16px",cursor:"pointer",textAlign:"center"}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:10}}><Avatar initials={p.i} size={40}/></div>
              <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:4}}>{p.n}</div>
              <div style={{fontSize:11,color:C.faint,marginBottom:10}}>{p.l}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginBottom:10}}>{p.d.slice(0,2).map(d=><Tag key={d} small>{d.length>12?d.slice(0,11)+"…":d}</Tag>)}</div>
              <div style={{fontSize:11,color:C.muted}}>Standing {p.s}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ObsPage(){
    return(
      <div style={{maxWidth:800,textAlign:"center",paddingTop:60}}>
        <div style={{fontSize:32,marginBottom:16}}>◉</div>
        <h1 style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:28,color:C.navy,marginBottom:12}}>Observatory</h1>
        <p style={{fontSize:14,color:C.muted}}>Same public knowledge space, with contribution tools for participants. See the public Solis site for the full Observatory view.</p>
      </div>
    );
  }
}
