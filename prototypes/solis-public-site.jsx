import { useState } from "react";

const C = {
  bg:"#F8F9FB",white:"#FFFFFF",surfaceAlt:"#F2F5F9",
  border:"#DDE3EC",borderLight:"#EBF0F6",borderFaint:"#F0F4F8",
  navy:"#0E1E34",navyMid:"#1A3255",
  gold:"#9A6F0A",goldBg:"#FDF6E8",goldRule:"#C8960E",
  blue:"#1A5296",blueLight:"#2468C0",
  text:"#18293D",muted:"#526070",faint:"#8A9DB0",
  tagLaunch:{bg:"#EBF3FC",text:"#1A5296",border:"#C4D9F0"},
  tagPolicy:{bg:"#FDF3E0",text:"#8A5800",border:"#F0D8A0"},
  tagIndustry:{bg:"#E8F5EE",text:"#1A6640",border:"#B8DECA"},
  tagEvent:{bg:"#EBF3FC",text:"#1A5296",border:"#C4D9F0"},
  tagProject:{bg:"#FDF3E0",text:"#8A5800",border:"#F0D8A0"},
  tagPub:{bg:"#F2EBFC",text:"#5A2896",border:"#D4BAEE"},
};
const ts = k => { const t=C["tag"+k]||C.tagEvent; return {background:t.bg,color:t.text,border:`1px solid ${t.border}`}; };

function SolMark({size=22}){
  const cx=size/2,cy=size/2,sc=size/44;
  const bodies=[
    {a:51.81,r:3.5},{a:314.66,r:6.1},{a:37.46,r:7.2},{a:158.10,r:9.0},
    {a:160.62,r:11.2},{a:61.97,r:13.3},{a:55.06,r:15.5},{a:322.38,r:17.9},
    {a:308.07,r:19.5},{a:239.22,r:20.6},{a:199.07,r:20.9},{a:172.99,r:21.2},
    {a:204.54,r:22.4},{a:259.00,r:23.0},
  ];
  const rad=d=>d*Math.PI/180;
  const pt=(a,r)=>({x:cx+r*sc*Math.cos(rad(a)),y:cy+r*sc*Math.sin(rad(a))});
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
      {bodies.map((b,i)=>{const p=pt(b.a,b.r);return(
        <g key={i}>
          <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#0E1E34" strokeWidth={0.55*sc} opacity={0.85}/>
          <circle cx={p.x} cy={p.y} r={(b.r>18?0.9:0.65)*sc}
            fill={i===13?"none":"#0E1E34"}
            stroke={i===13?"#0E1E34":"none"}
            strokeWidth={i===13?0.6*sc:0}/>
        </g>
      );})}
      <circle cx={cx} cy={cy} r={0.9*sc} fill="#C8960E"/>
    </svg>
  );
}

const sectorNews=[
  {tag:"Launch",   title:"ISRO's PSLV-C60 successfully deploys SpaDeX docking demonstration in LEO",     source:"Space News",      time:"2 hr ago"},
  {tag:"Policy",   title:"African Union Space Agency framework advances at Addis Ababa summit",           source:"SpaceAfrica",     time:"Yesterday"},
  {tag:"Industry", title:"Rocket Lab expands Neutron manufacturing capacity for constellation operators", source:"NASASpaceFlight", time:"2 days ago"},
];
const commonsActivity=[
  {type:"Event",       title:"Space Policy 101 — Open Discussion Session",         note:"Fri Jul 18 · Steward: Policy & Advocacy"},
  {type:"Expedition",  title:"Uganda Space Sector Map — Collaborative Initiative", note:"Open for contributors · 4 participants active"},
  {type:"Publication", title:"Why East Africa Needs a Space Economy Strategy",     note:"Essay by Okello M. · Jul 9, 2026"},
];
const opportunities=[
  {type:"Fellowship",  org:"SGAC",        title:"Space Generation Congress 2026",       deadline:"Aug 1",  location:"Milan"},
  {type:"Scholarship", org:"AfricaSpace", title:"Young Professional Award",             deadline:"Aug 15", location:"Remote"},
  {type:"Competition", org:"ESA",         title:"Moon Camp Challenge — Open Category",  deadline:"Sep 30", location:"Remote"},
  {type:"Call",        org:"IAC 2026",    title:"Abstract Submissions Now Open",        deadline:"Oct 1",  location:"Brisbane"},
];
const stewards=[
  {domain:"Commons & Knowledge",     name:"Akello J.",   since:"Mar 2026",              note:"Maintains the Observatory and domain taxonomy"},
  {domain:"Events & Coordination",   name:"Mwenda T.",   since:"Jan 2026",              note:"Coordinates public events and gatherings"},
  {domain:"Publications",            name:"Namugga C.",  since:"Apr 2026",              note:"Oversees essays, reports, and featured writing"},
  {domain:"Participation",           name:"Okello R.",   since:"Feb 2026",              note:"Welcomes new participants, maintains directory"},
  {domain:"Policy & Advocacy",       name:"Ssempa D.",   since:"Jun 2026",              note:"Represents Commons in policy discussions"},
  {domain:"AfricaSpace Summit 2026", name:"Nakabugo B.", since:"Jun 2026",until:"Sep 2026",note:"Commons delegate to AfricaSpace Summit 2026"},
];
const observatory=[
  {cat:"News",         desc:"Curated space sector coverage, filtered for signal",        count:"Updated daily"},
  {cat:"Calendar",     desc:"Global launches, milestones, and Commons events",           count:"38 upcoming"},
  {cat:"Opportunities",desc:"Scholarships, fellowships, competitions, open calls",       count:"12 open"},
  {cat:"Library",      desc:"Books, courses, podcasts, career guides, and tools",       count:"200+ resources"},
  {cat:"Publications", desc:"Essays, reports, and analysis from Commons participants",   count:"14 pieces"},
];
const pubs=[
  {title:"Why East Africa Needs a Space Economy Strategy",                   author:"Okello M.",   date:"Jul 9, 2026",  type:"Essay"},
  {title:"Understanding the Outer Space Treaty — A Plain Language Guide",    author:"Ssempa D.",  date:"Jun 22, 2026", type:"Guide"},
  {title:"AfricaSpace 2026 — What the Summit Means for East Africa",        author:"Nakabugo B.",date:"Jun 15, 2026", type:"Report"},
];
const orgs=[
  {name:"Uganda Astronomical Society",      domain:"Astronomy · Observation",  members:"600+", location:"Kampala"},
  {name:"Makerspace KLA",                   domain:"Engineering · Hardware",   members:"80+",  location:"Kampala"},
  {name:"Space Policy East Africa",         domain:"Policy · Advocacy",        members:"40+",  location:"Nairobi"},
  {name:"Astro Club — Makerere University", domain:"Education · Research",     members:"120+", location:"Kampala"},
];

export default function App(){
  const [page,setPage]=useState("Home");
  return (
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",background:C.bg,color:C.text,minHeight:"100vh"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .serif{font-family:'Playfair Display',Georgia,serif}
        .card{background:${C.white};border:1px solid ${C.border};border-radius:5px;padding:20px;transition:box-shadow .15s,border-color .15s}
        .card:hover{box-shadow:0 2px 12px rgba(14,30,52,.06);border-color:#C8D4E3}
        .tag{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;padding:3px 8px;border-radius:3px}
        .nb{background:none;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;color:${C.muted};padding:4px 0;transition:color .15s}
        .nb:hover{color:${C.navy}} .nb.on{color:${C.gold};font-weight:600}
        .gb{background:${C.navy};color:#fff;font-family:inherit;font-weight:600;font-size:13px;padding:10px 22px;border-radius:4px;border:none;cursor:pointer;transition:background .15s}
        .gb:hover{background:${C.navyMid}}
        .ob{background:${C.white};color:${C.text};font-family:inherit;font-weight:500;font-size:13px;padding:10px 22px;border-radius:4px;border:1px solid ${C.border};cursor:pointer;transition:border-color .15s}
        .ob:hover{border-color:${C.faint}}
        .sl{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${C.faint};margin-bottom:18px;padding-bottom:10px;border-bottom:1px solid ${C.border}}
      `}</style>

      <nav style={{background:C.white,position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1080,margin:"0 auto",padding:"0 28px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <button onClick={()=>setPage("Home")} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:9}}>
            <SolMark size={24}/>
            <span className="serif" style={{fontSize:15,fontWeight:700,color:C.navy}}>Solis</span>
            <span style={{fontSize:12,color:C.faint,marginLeft:2}}>/ Solarian Commons</span>
          </button>
          <div style={{display:"flex",gap:26}}>
            {["About","Observatory","Expeditions","Events","Organisations","Stewards"].map(n=>(
              <button key={n} className={`nb${page===n?" on":""}`} onClick={()=>setPage(n)}>{n}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="ob" style={{padding:"7px 16px",fontSize:12}}>Login</button>
            <button className="gb" style={{padding:"7px 16px",fontSize:12}} onClick={()=>setPage("Participate")}>Participate</button>
          </div>
        </div>
        <div style={{height:2,background:`linear-gradient(90deg,transparent,${C.goldRule} 30%,${C.goldRule} 70%,transparent)`,opacity:.3}}/>
      </nav>

      <div style={{maxWidth:1080,margin:"0 auto",padding:"0 28px"}}>
        {page==="Home"          && <Home setPage={setPage}/>}
        {page==="About"         && <About setPage={setPage}/>}
        {page==="Observatory"   && <ObservatoryPage/>}
        {page==="Stewards"      && <StewardsPage/>}
        {page==="Organisations" && <OrgsPage/>}
        {page==="Participate"   && <ParticipatePage setPage={setPage}/>}
        {(page==="Expeditions"||page==="Events") && <Stub name={page}/>}
      </div>

      <footer style={{borderTop:`1px solid ${C.border}`,marginTop:80,padding:"28px 0",background:C.white}}>
        <div style={{maxWidth:1080,margin:"0 auto",padding:"0 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <SolMark size={18}/>
            <span className="serif" style={{fontSize:13,color:C.muted}}>Solis · Solarian Commons · Kampala, Uganda</span>
          </div>
          <span style={{fontSize:12,color:C.faint,fontStyle:"italic"}}>Ultra hic et nunc</span>
        </div>
      </footer>
    </div>
  );
}

function Home({setPage}){
  return (
    <div>
      <div style={{padding:"64px 0 52px",borderBottom:`1px solid ${C.border}`,marginBottom:48}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:32}}>
          <div style={{maxWidth:560}}>
            <p style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.gold,marginBottom:18}}>Kampala, Uganda · Open to all</p>
            <h1 className="serif" style={{fontSize:50,fontWeight:700,lineHeight:1.08,color:C.navy,marginBottom:20}}>
              The Commons for a<br/><span style={{color:C.gold}}>Solarian civilisation.</span>
            </h1>
            <p style={{fontSize:16,lineHeight:1.8,color:C.muted,marginBottom:12,maxWidth:460}}>
              An open community for anyone interested in humanity's future beyond Earth — regardless of discipline, institution, or other affiliations.
            </p>
            <p style={{fontSize:14,lineHeight:1.7,color:C.faint,marginBottom:32,maxWidth:440}}>
              You're already Solarian. This is where you find the others.
            </p>
            <div style={{display:"flex",gap:10}}>
              <button className="gb" onClick={()=>setPage("Participate")}>Participate in the Commons</button>
              <button className="ob" onClick={()=>setPage("About")}>What is Solis?</button>
            </div>
          </div>
          <div style={{flexShrink:0,width:232}}>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:5,overflow:"hidden"}}>
              <div style={{background:C.surfaceAlt,padding:"12px 16px",borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:10,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",color:C.faint}}>The Commons today</span>
              </div>
              {[["12","Open opportunities"],["38","Upcoming events"],["5","Active stewards"],["4","Active expeditions"],["6","Affiliated organisations"]].map(([n,l],i,arr)=>(
                <div key={i} style={{padding:"10px 16px",borderBottom:i<arr.length-1?`1px solid ${C.borderFaint}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,color:C.muted}}>{l}</span>
                  <span className="serif" style={{fontSize:20,fontWeight:700,color:C.navy}}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:36,marginBottom:52}}>
        <div>
          <div className="sl">From the sector</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {sectorNews.map((n,i)=>(
              <div key={i} className="card" style={{cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span className="tag" style={ts(n.tag)}>{n.tag}</span>
                  <span style={{fontSize:11,color:C.faint}}>{n.source} · {n.time}</span>
                </div>
                <p style={{fontSize:14,lineHeight:1.55,color:C.text,fontWeight:500}}>{n.title}</p>
              </div>
            ))}
            <button className="ob" style={{fontSize:12,marginTop:4}} onClick={()=>{}}>Full Observatory →</button>
          </div>
        </div>
        <div>
          <div className="sl">From the Commons</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {commonsActivity.map((a,i)=>(
              <div key={i} className="card">
                <div style={{marginBottom:8}}>
                  <span className="tag" style={ts(a.type==="Publication"?"Pub":a.type==="Expedition"?"Project":a.type)}>{a.type}</span>
                </div>
                <p style={{fontSize:14,lineHeight:1.55,color:C.text,fontWeight:500,marginBottom:5}}>{a.title}</p>
                <p style={{fontSize:12,color:C.faint}}>{a.note}</p>
              </div>
            ))}
            <button className="ob" style={{fontSize:12,marginTop:4}}>Participant area →</button>
          </div>
        </div>
      </div>

      <div style={{marginBottom:52}}>
        <div className="sl">Open opportunities</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {opportunities.map((o,i)=>(
            <div key={i} className="card" style={{cursor:"pointer"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:".07em",textTransform:"uppercase",color:C.gold,marginBottom:8}}>{o.type}</div>
              <p style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:12,lineHeight:1.4}}>{o.title}</p>
              <div style={{fontSize:11,color:C.faint}}>{o.org} · {o.location}</div>
              <div style={{fontSize:11,color:C.faint,marginTop:2}}>Due {o.deadline}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{background:C.navy,borderRadius:6,padding:"44px 44px",marginBottom:64,display:"grid",gridTemplateColumns:"1fr auto",gap:32,alignItems:"center"}}>
        <div>
          <h2 className="serif" style={{fontSize:26,fontWeight:600,color:C.white,marginBottom:10,lineHeight:1.35}}>
            Not united by a destination.<br/>
            <span style={{color:C.goldRule}}>United by a direction.</span>
          </h2>
          <p style={{fontSize:14,color:"rgba(255,255,255,.5)",lineHeight:1.75,maxWidth:420}}>
            The Commons is open to anyone with genuine curiosity about humanity's future beyond Earth. No credentials. No approval. You participate, and the Commons grows around you.
          </p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"flex-end"}}>
          <button onClick={()=>setPage("Participate")} style={{background:C.goldRule,color:C.navy,fontFamily:"inherit",fontWeight:700,fontSize:13,padding:"11px 24px",border:"none",borderRadius:4,cursor:"pointer"}}>
            Participate in the Commons
          </button>
          <button className="ob" onClick={()=>setPage("About")} style={{borderColor:"rgba(255,255,255,.2)",color:"rgba(255,255,255,.6)",fontSize:12}}>
            Read about Solis
          </button>
        </div>
      </div>
    </div>
  );
}

function About({setPage}){
  return (
    <div style={{padding:"52px 0 72px",maxWidth:680}}>
      <p style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.gold,marginBottom:10}}>About</p>
      <h1 className="serif" style={{fontSize:40,fontWeight:700,color:C.navy,marginBottom:6}}>What is Solis?</h1>
      <p className="serif" style={{fontSize:18,fontStyle:"italic",color:C.muted,marginBottom:40}}>The digital infrastructure of the Solarian Commons</p>
      <blockquote style={{borderLeft:`3px solid ${C.goldRule}`,paddingLeft:20,marginBottom:36}}>
        <p className="serif" style={{fontSize:17,fontStyle:"italic",color:C.muted,lineHeight:1.75}}>
          On 2 November 2000, Expedition 1 docked at the International Space Station. Since that morning, not one day has passed without at least one human living beyond Earth. The chain has not broken.
        </p>
      </blockquote>
      <p style={{fontSize:15,lineHeight:1.85,color:C.text,marginBottom:16}}>
        Solis is the digital infrastructure of the Solarian Commons — an open community for people interested in humanity's future beyond Earth. Not an organisation. Not a typical platform. A commons: a shared environment where people naturally gather, where organisations affiliate without subordinating, where identity precedes membership.
      </p>
      <p style={{fontSize:15,lineHeight:1.85,color:C.muted,marginBottom:16}}>
        The Commons is open to anyone — astronomers, engineers, policy researchers, educators, entrepreneurs, artists, students, dreamers — regardless of credentials, career stage, or other affiliations. You do not apply to the Commons. You participate in it.
      </p>
      <p style={{fontSize:15,lineHeight:1.85,color:C.muted,marginBottom:36}}>
        Organisations affiliate with the Commons without losing their independence. University clubs, astronomy societies, startups, research groups — all retain their own governance and identity while participating in a shared environment where they can discover one another and collaborate.
      </p>
      <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:5,padding:"20px 24px",marginBottom:40}}>
        <p className="serif" style={{fontSize:16,fontStyle:"italic",color:C.navy,lineHeight:1.75,textAlign:"center"}}>
          "The Commons is not united by a destination. It is united by a direction."
        </p>
      </div>
      <div style={{paddingTop:32,borderTop:`1px solid ${C.border}`,marginBottom:36}}>
        <div className="sl">Part of a wider ecosystem</div>
        <p style={{fontSize:14,color:C.muted,lineHeight:1.75,marginBottom:20}}>The Solarian Commons operates alongside organisations engaged with space across Uganda, East Africa, and the continent.</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {["Uganda Astronomical Society","East African Astronomical Society","African Astronomical Society","Space Generation Advisory Council","Private & institutional actors"].map((org,i)=>(
            <span key={i} style={{fontSize:12,color:C.text,background:C.white,border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 12px"}}>{org}</span>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="gb">Read the Solis document</button>
        <button className="ob" onClick={()=>setPage("Participate")}>Participate in the Commons</button>
      </div>
    </div>
  );
}

function ObservatoryPage(){
  return (
    <div style={{padding:"52px 0 72px"}}>
      <p style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.gold,marginBottom:10}}>Observatory</p>
      <h1 className="serif" style={{fontSize:40,fontWeight:700,color:C.navy,marginBottom:12}}>Knowledge for the curious</h1>
      <p style={{fontSize:15,color:C.muted,marginBottom:10,maxWidth:540,lineHeight:1.75}}>The Commons' public knowledge space. Entirely open — no participation required.</p>
      <p style={{fontSize:13,color:C.faint,marginBottom:44,maxWidth:540,fontStyle:"italic"}}>An observatory is where you go to see further.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:52}}>
        {observatory.map((c,i)=>(
          <div key={i} className="card" style={{cursor:"pointer"}}>
            <div style={{width:24,height:2,background:C.goldRule,borderRadius:1,marginBottom:14}}/>
            <div style={{fontSize:12,fontWeight:600,color:C.gold,marginBottom:8}}>{c.cat}</div>
            <p style={{fontSize:14,color:C.text,fontWeight:500,marginBottom:10,lineHeight:1.5}}>{c.desc}</p>
            <p style={{fontSize:11,color:C.faint}}>{c.count}</p>
          </div>
        ))}
      </div>
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:32}}>
        <div className="sl">Recent publications</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {pubs.map((p,i)=>(
            <div key={i} className="card" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20}}>
              <div>
                <span className="tag" style={{...ts("Pub"),marginRight:10}}>{p.type}</span>
                <span style={{fontSize:14,color:C.text,fontWeight:500}}>{p.title}</span>
                <div style={{fontSize:12,color:C.faint,marginTop:5}}>{p.author} · {p.date}</div>
              </div>
              <button className="ob" style={{fontSize:12,padding:"6px 14px",whiteSpace:"nowrap"}}>Read →</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StewardsPage(){
  return (
    <div style={{padding:"52px 0 72px",maxWidth:820}}>
      <p style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.gold,marginBottom:10}}>Stewards</p>
      <h1 className="serif" style={{fontSize:40,fontWeight:700,color:C.navy,marginBottom:12}}>Current Stewards</h1>
      <p style={{fontSize:15,color:C.muted,marginBottom:12,maxWidth:560,lineHeight:1.75}}>
        Stewards are participants entrusted by the community with specific responsibilities — moderation, domain curation, event coordination, archive maintenance, and more. One role, defined by mandate, earned through contribution.
      </p>
      <p style={{fontSize:13,color:C.faint,marginBottom:44}}>All past stewardships are archived. The full participant directory is available to participants.</p>
      <div className="sl">Active stewards</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {stewards.map((s,i)=>(
          <div key={i} className="card" style={{display:"grid",gridTemplateColumns:"210px 1fr 70px",gap:20,alignItems:"center"}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:s.until?C.blueLight:C.gold,marginBottom:3}}>{s.domain}</div>
              <div style={{fontSize:11,color:C.faint}}>Since {s.since}{s.until?` → ${s.until}`:""}</div>
            </div>
            <div>
              <div style={{fontSize:14,color:C.text,fontWeight:600,marginBottom:3}}>{s.name}</div>
              <div style={{fontSize:12,color:C.muted}}>{s.note}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <span style={{fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",background:s.until?"#EBF3FC":"#E8F5EE",color:s.until?C.blueLight:"#1A6640",border:`1px solid ${s.until?"#C4D9F0":"#B8DECA"}`,borderRadius:3,padding:"3px 8px"}}>
                {s.until?"Mandate":"Active"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p style={{fontSize:13,color:C.faint,marginTop:24,lineHeight:1.65}}>Stewardship mandates are bounded — they end when their purpose is concluded. The record of every past stewardship is preserved in the archive.</p>
    </div>
  );
}

function OrgsPage(){
  return (
    <div style={{padding:"52px 0 72px"}}>
      <p style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.gold,marginBottom:10}}>Organisations</p>
      <h1 className="serif" style={{fontSize:40,fontWeight:700,color:C.navy,marginBottom:12}}>Affiliated organisations</h1>
      <p style={{fontSize:15,color:C.muted,marginBottom:12,maxWidth:560,lineHeight:1.75}}>
        Organisations affiliate with the Commons — they do not join it. Each retains its own governance, identity, and independence entirely.
      </p>
      <p style={{fontSize:13,color:C.faint,marginBottom:44}}>Affiliation means participation and visibility. Nothing more, nothing less.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14,marginBottom:40}}>
        {orgs.map((o,i)=>(
          <div key={i} className="card" style={{cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <h3 style={{fontSize:15,fontWeight:600,color:C.navy,lineHeight:1.3}}>{o.name}</h3>
              <span style={{fontSize:11,color:C.faint,whiteSpace:"nowrap",marginLeft:12}}>{o.members}</span>
            </div>
            <p style={{fontSize:12,color:C.muted,marginBottom:6}}>{o.domain}</p>
            <p style={{fontSize:11,color:C.faint}}>{o.location}</p>
          </div>
        ))}
      </div>
      <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:5,padding:"24px 28px"}}>
        <h3 style={{fontSize:15,fontWeight:600,color:C.navy,marginBottom:8}}>Does your organisation belong here?</h3>
        <p style={{fontSize:14,color:C.muted,lineHeight:1.65,marginBottom:16}}>If your organisation engages with humanity's future beyond Earth — in any discipline — you're welcome to affiliate. No application, no approval, no fees.</p>
        <button className="gb">Affiliate your organisation</button>
      </div>
    </div>
  );
}

function ParticipatePage({setPage}){
  return (
    <div style={{padding:"52px 0 72px",maxWidth:620}}>
      <p style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.gold,marginBottom:10}}>Participate</p>
      <h1 className="serif" style={{fontSize:40,fontWeight:700,color:C.navy,marginBottom:12}}>Join the Commons</h1>
      <p style={{fontSize:15,color:C.muted,marginBottom:40,lineHeight:1.75}}>
        The Commons is open. No application, no approval, no credentials required. You participate, and the Commons is there.
      </p>
      {[
        ["Access the participant directory","Find and connect with other Solarians across disciplines, backgrounds, and interests."],
        ["Participate in discussions","The Commons' forum — threaded, searchable, permanent. Not a WhatsApp group."],
        ["Start or join expeditions","Propose something. The Commons provides visibility and support, not gatekeeping."],
        ["Affiliate your organisation","Bring your organisation into the Commons. It keeps its independence entirely."],
      ].map(([title,desc],i)=>(
        <div key={i} style={{display:"flex",gap:16,marginBottom:20,paddingBottom:20,borderBottom:`1px solid ${C.borderFaint}`}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:C.goldRule,marginTop:8,flexShrink:0}}/>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:4}}>{title}</div>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.65}}>{desc}</div>
          </div>
        </div>
      ))}
      <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:5,padding:28,marginTop:12}}>
        <p style={{fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.65}}>Create your Solarian profile and begin participating. No introduction required.</p>
        <div style={{display:"flex",gap:10}}>
          <button className="gb">Create your profile</button>
          <button className="ob" onClick={()=>setPage("About")}>Read about the Commons first</button>
        </div>
      </div>
    </div>
  );
}

function Stub({name}){
  return (
    <div style={{padding:"96px 0 72px",textAlign:"center"}}>
      <p style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.faint,marginBottom:16}}>{name}</p>
      <h1 className="serif" style={{fontSize:36,color:C.navy,marginBottom:14}}>Coming soon</h1>
      <p style={{fontSize:14,color:C.muted}}>This section is being built. Explore the Observatory in the meantime.</p>
    </div>
  );
}
