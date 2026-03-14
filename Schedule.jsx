import { useState, useRef } from "react";

// ── DESIGN TOKENS ──────────────────────────────────────────────────────────
const C = {
  bg:      "#0b0c0e",
  surface: "#111318",
  card:    "#161a22",
  border:  "#1f2535",
  border2: "#252d3d",
  accent:  "#f97316",
  green:   "#22c55e",
  red:     "#ef4444",
  blue:    "#3b82f6",
  purple:  "#a855f7",
  teal:    "#14b8a6",
  muted:   "#4b5563",
  text:    "#f1f5f9",
  subtext: "#94a3b8",
};

const STAFF_PALETTE = [
  "#f97316","#3b82f6","#a855f7","#14b8a6","#22c55e",
  "#ec4899","#f59e0b","#6366f1","#ef4444","#06b6d4",
  "#84cc16","#fb923c","#8b5cf6","#10b981","#f43f5e",
];

const SHIFT_TYPES = {
  morning: { bg:"rgba(249,115,22,0.14)", border:"#f97316", text:"#fed7aa", label:"Morning" },
  evening: { bg:"rgba(59,130,246,0.14)",  border:"#3b82f6", text:"#bfdbfe", label:"Evening" },
  night:   { bg:"rgba(168,85,247,0.14)", border:"#a855f7", text:"#e9d5ff", label:"Night"   },
  off:     { bg:"rgba(75,85,99,0.10)",   border:"#4b5563", text:"#9ca3af", label:"Day off"  },
};

const ROLE_COLOR = {
  administrator: C.accent,
  assistant:     C.teal,
  doctor:        C.blue,
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WDAYS  = ["Mo","Tu","We","Th","Fr","Sa","Su"];

// ── HELPERS ──────────────────────────────────────────────────────────────────
const f2  = n => String(n).padStart(2,"0");
const toM = (h,m) => h*60+m;
const durH = (sh,sm,eh,em) => {
  const d = toM(eh,em)-toM(sh,sm);
  const h = Math.floor(d/60), m = d%60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
function makeStaff(id,name,role,ci){
  return { id, name, role, color: STAFF_PALETTE[ci%STAFF_PALETTE.length],
           initials: name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() };
}
function weekOf(d){
  const base = new Date(d), dow=(base.getDay()+6)%7;
  base.setDate(base.getDate()-dow);
  return Array.from({length:7},(_,i)=>{ const x=new Date(base); x.setDate(base.getDate()+i); return x; });
}

// ── DATA ─────────────────────────────────────────────────────────────────────
const STAFF = [
  makeStaff("s01","Yaroslav H",   "administrator", 0),
  makeStaff("s02","Pasha Kosov",  "administrator", 1),
  makeStaff("s03","Daria P",      "administrator", 2),
  makeStaff("s04","Masha",        "assistant",     3),
  makeStaff("s05","Maryna K",     "assistant",     4),
  makeStaff("s06","Denis Chechin","doctor",        5),
  makeStaff("s07","Khrystyna C",  "doctor",        6),
  makeStaff("s08","Alina G",      "doctor",        7),
  makeStaff("s09","Volodymyr K",  "doctor",        8),
  makeStaff("s10","Viktoria N",   "doctor",        9),
  makeStaff("s11","Ekaterina N",  "doctor",       10),
  makeStaff("s12","Samuel P",     "doctor",       11),
  makeStaff("s13","Ilja P",       "doctor",       12),
  makeStaff("s14","Oleh Safonkin","doctor",       13),
  makeStaff("s15","Ivan Todorov", "doctor",        0),
];

let uid = 200;
const SHIFTS_INIT = [
  { id:"sh1",  staffId:"s01", sh:8,  sm:0,  eh:16, em:0,  type:"morning", note:"" },
  { id:"sh2",  staffId:"s02", sh:9,  sm:0,  eh:17, em:0,  type:"morning", note:"" },
  { id:"sh3",  staffId:"s03", sh:8,  sm:30, eh:14, em:30, type:"morning", note:"Short day" },
  { id:"sh4",  staffId:"s04", sh:10, sm:0,  eh:19, em:0,  type:"evening", note:"" },
  { id:"sh5",  staffId:"s05", sh:8,  sm:0,  eh:16, em:0,  type:"morning", note:"" },
  { id:"sh6",  staffId:"s06", sh:9,  sm:0,  eh:18, em:0,  type:"morning", note:"" },
  { id:"sh7",  staffId:"s07", sh:11, sm:0,  eh:20, em:0,  type:"evening", note:"" },
  { id:"sh8",  staffId:"s08", sh:8,  sm:0,  eh:13, em:0,  type:"morning", note:"Half day" },
  { id:"sh9",  staffId:"s09", sh:13, sm:0,  eh:21, em:0,  type:"evening", note:"" },
  { id:"sh10", staffId:"s10", sh:8,  sm:0,  eh:16, em:0,  type:"morning", note:"" },
  { id:"sh11", staffId:"s11", sh:9,  sm:30, eh:17, em:30, type:"morning", note:"" },
  { id:"sh12", staffId:"s12", sh:14, sm:0,  eh:22, em:0,  type:"evening", note:"Late shift" },
  { id:"sh13", staffId:"s13", sh:8,  sm:0,  eh:16, em:0,  type:"morning", note:"" },
  { id:"sh14", staffId:"s14", sh:10, sm:0,  eh:18, em:0,  type:"morning", note:"" },
  { id:"sh15", staffId:"s15", sh:7,  sm:0,  eh:15, em:0,  type:"morning", note:"Early" },
];

// ── LAYOUT CONSTANTS ─────────────────────────────────────────────────────────
const START_H  = 7;
const END_H    = 22;
const HOURS    = END_H - START_H;
const ROW_H    = 54;
const LABEL_W  = 210;
const HOUR_W   = 76;
const TOTAL_W  = HOURS * HOUR_W;

// ── MINI CALENDAR ────────────────────────────────────────────────────────────
function MiniCal({ selected, onSelect }) {
  const [view, setView] = useState(new Date(selected));
  const y=view.getFullYear(), mo=view.getMonth();
  const first=new Date(y,mo,1), offset=(first.getDay()+6)%7;
  const dmax=new Date(y,mo+1,0).getDate();
  const today=new Date();
  const nav=d=>{const v=new Date(view);v.setMonth(v.getMonth()+d);setView(v);};

  const cells=[];
  for(let i=0;i<offset;i++) cells.push(null);
  for(let d=1;d<=dmax;d++) cells.push(new Date(y,mo,d));

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <button onClick={()=>nav(-1)} style={sBtn}>‹</button>
        <span style={{fontSize:11,fontWeight:700,color:C.text}}>{MONTHS[mo].slice(0,3)} {y}</span>
        <button onClick={()=>nav(1)}  style={sBtn}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1}}>
        {WDAYS.map(d=><div key={d} style={{fontSize:8,color:C.muted,textAlign:"center",paddingBottom:3,fontFamily:"monospace"}}>{d}</div>)}
        {cells.map((dt,i)=>{
          if(!dt) return <div key={"e"+i}/>;
          const isSel=dt.toDateString()===selected.toDateString();
          const isTd =dt.toDateString()===today.toDateString();
          return (
            <div key={i} onClick={()=>onSelect(new Date(dt))} style={{
              fontSize:10,textAlign:"center",padding:"3px 0",borderRadius:4,cursor:"pointer",
              fontFamily:"monospace",
              background:isSel?C.accent:isTd?"rgba(249,115,22,0.15)":"transparent",
              color:isSel?"#fff":isTd?C.accent:C.subtext,
              fontWeight:isSel||isTd?700:400,
            }}>{dt.getDate()}</div>
          );
        })}
      </div>
    </div>
  );
}
const sBtn={width:20,height:20,border:`1px solid ${C.border}`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.subtext,fontSize:11,background:"transparent"};

// ── SHIFT BLOCK ───────────────────────────────────────────────────────────────
function ShiftBlock({ shift, staffColor, onClick }) {
  const sc  = SHIFT_TYPES[shift.type]||SHIFT_TYPES.morning;
  const left  = ((toM(shift.sh,shift.sm)-START_H*60)/60)*HOUR_W;
  const width = ((toM(shift.eh,shift.em)-toM(shift.sh,shift.sm))/60)*HOUR_W;
  const narrow= width < 75;

  return (
    <div onClick={e=>{e.stopPropagation();onClick(shift);}}
      style={{
        position:"absolute",top:7,left:left+3,
        width:Math.max(width-6,20),height:ROW_H-14,
        background:sc.bg,
        borderLeft:`3px solid ${sc.border}`,
        borderRadius:"0 7px 7px 0",
        cursor:"pointer",overflow:"hidden",
        display:"flex",flexDirection:"column",justifyContent:"center",
        padding:"0 8px",boxSizing:"border-box",
        transition:"filter .12s, transform .12s",
        userSelect:"none",
      }}
      onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.2)";e.currentTarget.style.transform="scaleY(1.04)";}}
      onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)"; e.currentTarget.style.transform="scaleY(1)";}}>
      <div style={{fontFamily:"monospace",fontSize:8.5,color:sc.text,opacity:.75,whiteSpace:"nowrap"}}>
        {f2(shift.sh)}:{f2(shift.sm)} – {f2(shift.eh)}:{f2(shift.em)}
      </div>
      {!narrow&&<div style={{fontSize:10,fontWeight:700,color:sc.text,marginTop:1,whiteSpace:"nowrap"}}>
        {durH(shift.sh,shift.sm,shift.eh,shift.em)}
      </div>}
      {!narrow&&shift.note&&<div style={{fontFamily:"monospace",fontSize:8,color:sc.text,opacity:.5,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
        {shift.note}
      </div>}
    </div>
  );
}

// ── STAFF ROW ─────────────────────────────────────────────────────────────────
function StaffRow({ member, dayShifts, onClickShift, onClickEmpty, stripe }) {
  const hrs = dayShifts.reduce((a,s)=>{return a+(toM(s.eh,s.em)-toM(s.sh,s.sm))/60;},0);
  return (
    <div style={{display:"flex",height:ROW_H,borderBottom:`1px solid ${C.border}`,
      background:stripe?"rgba(22,26,34,0.55)":"transparent"}}>

      {/* ── LABEL COLUMN ── */}
      <div style={{
        width:LABEL_W,flexShrink:0,display:"flex",alignItems:"center",gap:9,
        padding:"0 14px",borderRight:`1px solid ${C.border}`,
        position:"sticky",left:0,zIndex:3,
        background:stripe?"#13171e":C.surface,
      }}>
        <div style={{
          width:32,height:32,borderRadius:8,flexShrink:0,
          background:`linear-gradient(135deg,${member.color},${member.color}77)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:10,fontWeight:800,color:"#fff",
        }}>{member.initials}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{member.name}</div>
          <div style={{fontSize:9,color:ROLE_COLOR[member.role]||C.subtext,fontFamily:"monospace",marginTop:1,textTransform:"uppercase",letterSpacing:".4px"}}>{member.role}</div>
        </div>
        {hrs>0&&<div style={{fontFamily:"monospace",fontSize:8.5,fontWeight:700,color:C.accent,background:"rgba(249,115,22,0.1)",padding:"2px 6px",borderRadius:4,flexShrink:0}}>
          {hrs%1===0?hrs:hrs.toFixed(1)}h
        </div>}
      </div>

      {/* ── TIMELINE ── */}
      <div style={{flex:1,position:"relative",cursor:"cell",userSelect:"none"}}
        onClick={e=>{
          const r=e.currentTarget.getBoundingClientRect();
          const hour=Math.floor((e.clientX-r.left)/HOUR_W)+START_H;
          onClickEmpty(member.id,Math.max(START_H,Math.min(END_H-1,hour)));
        }}>
        {/* hour lines */}
        {Array.from({length:HOURS+1},(_,i)=>(
          <div key={i} style={{position:"absolute",top:0,bottom:0,left:i*HOUR_W,width:1,background:C.border,opacity:i===0?0:.6,pointerEvents:"none"}}/>
        ))}
        {/* half-hour lines */}
        {Array.from({length:HOURS},(_,i)=>(
          <div key={"h"+i} style={{position:"absolute",top:"30%",bottom:"30%",left:i*HOUR_W+HOUR_W/2,width:1,background:C.border,opacity:.25,pointerEvents:"none"}}/>
        ))}
        {dayShifts.map(sh=>(
          <ShiftBlock key={sh.id} shift={sh} staffColor={member.color} onClick={onClickShift}/>
        ))}
      </div>
    </div>
  );
}

// ── MODAL ────────────────────────────────────────────────────────────────────
function ShiftModal({ initData, onClose, onSave, onDelete }) {
  const isNew = !initData.shift;
  const [form, setForm] = useState(initData.shift
    ? { staffId:initData.shift.staffId, sh:initData.shift.sh, sm:initData.shift.sm, eh:initData.shift.eh, em:initData.shift.em, type:initData.shift.type, note:initData.shift.note }
    : { staffId:initData.staffId||STAFF[0].id, sh:initData.hour||9, sm:0, eh:(initData.hour||9)+8, em:0, type:"morning", note:"" }
  );
  const s=k=>v=>setForm(p=>({...p,[k]:v}));
  const dur=toM(form.eh,form.em)-toM(form.sh,form.sm);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.card,border:`1px solid ${C.border2}`,borderRadius:16,width:420,maxWidth:"95vw",overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.65)"}}>

        <div style={{padding:"17px 20px 13px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:C.text}}>{isNew?"Add Shift":"Edit Shift"}</div>
            <div style={{fontSize:9,color:C.subtext,fontFamily:"monospace",marginTop:2,letterSpacing:1}}>{isNew?"NEW WORK PERIOD":"UPDATE SHIFT"}</div>
          </div>
          <button onClick={onClose} style={{...sBtn,width:26,height:26,color:C.subtext}}>✕</button>
        </div>

        <div style={{padding:20,display:"flex",flexDirection:"column",gap:13}}>
          <MF label="Staff Member">
            <select value={form.staffId} onChange={e=>s("staffId")(e.target.value)} style={fi}>
              {STAFF.map(x=><option key={x.id} value={x.id}>{x.name} — {x.role}</option>)}
            </select>
          </MF>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <MF label="Start">
              <input type="time" value={`${f2(form.sh)}:${f2(form.sm)}`}
                onChange={e=>{const[h,m]=e.target.value.split(":").map(Number);setForm(p=>({...p,sh:h,sm:m}));}} style={fi}/>
            </MF>
            <MF label="End">
              <input type="time" value={`${f2(form.eh)}:${f2(form.em)}`}
                onChange={e=>{const[h,m]=e.target.value.split(":").map(Number);setForm(p=>({...p,eh:h,em:m}));}} style={fi}/>
            </MF>
          </div>
          {dur>0&&<div style={{fontFamily:"monospace",fontSize:9,color:C.subtext,textAlign:"right",marginTop:-8}}>
            Duration: <span style={{color:C.accent,fontWeight:700}}>{durH(form.sh,form.sm,form.eh,form.em)}</span>
          </div>}
          <MF label="Shift Type">
            <div style={{display:"flex",gap:5}}>
              {Object.entries(SHIFT_TYPES).map(([k,v])=>(
                <div key={k} onClick={()=>s("type")(k)} style={{
                  flex:1,textAlign:"center",padding:"7px 4px",borderRadius:7,cursor:"pointer",
                  fontFamily:"monospace",fontSize:8.5,fontWeight:700,letterSpacing:".5px",
                  border:`1px solid ${form.type===k?v.border:C.border}`,
                  background:form.type===k?v.bg:"transparent",
                  color:form.type===k?v.text:C.muted,transition:"all .12s",
                }}>{v.label.toUpperCase()}</div>
              ))}
            </div>
          </MF>
          <MF label="Note">
            <input value={form.note} onChange={e=>s("note")(e.target.value)} placeholder="Optional note…" style={fi}/>
          </MF>
        </div>

        <div style={{padding:"10px 20px 18px",display:"flex",justifyContent:"space-between",gap:8}}>
          <div>{!isNew&&<button onClick={()=>onDelete(initData.shift.id)}
            style={{...bB,border:`1px solid rgba(239,68,68,0.3)`,color:C.red,background:"rgba(239,68,68,0.07)"}}>Delete</button>}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose} style={{...bB,border:`1px solid ${C.border}`,color:C.subtext,background:C.card}}>Cancel</button>
            <button onClick={()=>onSave(form,initData.shift?.id)}
              style={{...bB,background:C.accent,color:"#fff",border:"none"}}>{isNew?"Add Shift →":"Save →"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function MF({label,children}){return <div><div style={{fontFamily:"monospace",fontSize:8.5,textTransform:"uppercase",letterSpacing:1.2,color:C.muted,marginBottom:5,fontWeight:500}}>{label}</div>{children}</div>;}
const fi={background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 11px",color:C.text,fontFamily:"sans-serif",fontSize:12.5,width:"100%",outline:"none",WebkitAppearance:"none",boxSizing:"border-box"};
const bB={display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,fontFamily:"sans-serif",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Schedule() {
  const [date,   setDate]   = useState(new Date(2026,2,13));
  const [shifts, setShifts] = useState(SHIFTS_INIT);
  const [modal,  setModal]  = useState(null);
  const [roles,  setRoles]  = useState(new Set(["administrator","assistant","doctor"]));
  const [search, setSearch] = useState("");
  const [view,   setView]   = useState("day");

  const week = weekOf(date);
  const now  = new Date();
  const isToday = date.toDateString()===now.toDateString();
  const nowLeft = ((toM(now.getHours(),now.getMinutes())-START_H*60)/60)*HOUR_W;

  const navDay = d=>{const x=new Date(date);x.setDate(x.getDate()+(view==="week"?d*7:d));setDate(x);};

  const dateLabel = view==="week"
    ? `${week[0].toLocaleDateString("en",{month:"short",day:"numeric"})} – ${week[6].toLocaleDateString("en",{month:"short",day:"numeric",year:"numeric"})}`
    : date.toLocaleDateString("en",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).toUpperCase();

  const visible = STAFF.filter(s=>roles.has(s.role)&&(!search||s.name.toLowerCase().includes(search.toLowerCase())));
  const dayShifts = sid => shifts.filter(s=>s.staffId===sid);
  const totalH = shifts.reduce((a,s)=>a+(toM(s.eh,s.em)-toM(s.sh,s.sm))/60,0);

  const toggleRole = r=>setRoles(p=>{const n=new Set(p);n.has(r)?n.delete(r):n.add(r);return n;});

  const openEdit  = sh => setModal({shift:sh, staffId:sh.staffId});
  const openNew   = (staffId, hour) => setModal({shift:null, staffId, hour});
  const closeModal = () => setModal(null);

  const saveShift = (form, eid) => {
    if(eid) setShifts(p=>p.map(s=>s.id===eid?{...form,id:eid}:s));
    else    setShifts(p=>[...p,{...form,id:"sh"+(++uid)}]);
    closeModal();
  };
  const delShift = id => {setShifts(p=>p.filter(s=>s.id!==id));closeModal();};

  const roleCounts = {};
  STAFF.forEach(s=>{roleCounts[s.role]=(roleCounts[s.role]||0)+1;});

  return (
    <div style={{display:"flex",height:"100vh",background:C.bg,overflow:"hidden",color:C.text,fontFamily:"'Syne',system-ui,sans-serif"}}>

      {/* ════ SIDEBAR ════ */}
      <aside style={{width:198,flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,padding:"22px 16px 18px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{width:30,height:30,background:C.accent,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",flexShrink:0}}>M</div>
          <span style={{fontSize:15,fontWeight:700,letterSpacing:-.3}}>Med<span style={{color:C.accent}}>Pay</span></span>
        </div>
        <nav style={{padding:"8px 9px",flex:1,overflowY:"auto"}}>
          {[["⬡","Dashboard"],["↗","Income"],["↙","Expenses"]].map(([ic,lb])=>
            <div key={lb} style={{...nI,color:C.subtext}}><span style={{width:16,textAlign:"center",fontSize:13}}>{ic}</span>{lb}</div>)}
          <div style={nLabel}>Workforce</div>
          {[["◈","Staff"],["◉","Doctors"],["◌","Roles"]].map(([ic,lb])=>
            <div key={lb} style={{...nI,color:C.subtext}}><span style={{width:16,textAlign:"center",fontSize:13}}>{ic}</span>{lb}</div>)}
          <div style={nLabel}>Payroll</div>
          <div style={{...nI,background:"rgba(249,115,22,0.1)",color:C.accent,position:"relative"}}>
            <span style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:16,background:C.accent,borderRadius:"0 2px 2px 0"}}/>
            <span style={{width:16,textAlign:"center",fontSize:13}}>▦</span>Schedule
            <span style={{marginLeft:"auto",background:C.accent,color:"#fff",fontSize:8.5,fontWeight:700,padding:"1px 5px",borderRadius:10,fontFamily:"monospace"}}>{shifts.length}</span>
          </div>
          {[["▣","Timesheets"],["◧","Commissions"],["⊞","Reports"]].map(([ic,lb])=>
            <div key={lb} style={{...nI,color:C.subtext}}><span style={{width:16,textAlign:"center",fontSize:13}}>{ic}</span>{lb}</div>)}
        </nav>
        <div style={{padding:9,borderTop:`1px solid ${C.border}`}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"9px 11px",display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,background:"linear-gradient(135deg,#f97316,#ec4899)",borderRadius:7,fontSize:10,fontWeight:800,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>HC</div>
            <div><div style={{fontSize:11,fontWeight:700}}>HealthCare+</div><div style={{fontSize:9,color:C.subtext,fontFamily:"monospace"}}>MAR 2026</div></div>
          </div>
        </div>
      </aside>

      {/* ════ MAIN ════ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>

        {/* ── TOP BAR ── */}
        <header style={{height:56,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",gap:10,flexShrink:0,background:"rgba(11,12,14,0.9)",backdropFilter:"blur(10px)",zIndex:20}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:10}}>
            <div style={{marginRight:4}}>
              <div style={{fontSize:14,fontWeight:700}}>Schedule</div>
              <div style={{fontSize:9,color:C.subtext,fontFamily:"monospace",marginTop:1,letterSpacing:.5}}>SHIFT TRACKER</div>
            </div>
            <button onClick={()=>navDay(-1)} style={aBtn}>‹</button>
            <div style={{fontFamily:"monospace",fontSize:10,fontWeight:600,minWidth:150,textAlign:"center",padding:"5px 8px",borderRadius:6,color:C.text}}>{dateLabel}</div>
            <button onClick={()=>navDay(1)} style={aBtn}>›</button>
            <button onClick={()=>setDate(new Date())} style={{...aBtn,width:"auto",padding:"0 9px",fontSize:8.5,fontFamily:"monospace",fontWeight:700,letterSpacing:.5}}>TODAY</button>
          </div>

          {/* Role toggles */}
          <div style={{display:"flex",gap:5}}>
            {Object.entries(roleCounts).map(([r,cnt])=>(
              <div key={r} onClick={()=>toggleRole(r)} style={{
                display:"flex",alignItems:"center",gap:5,padding:"4px 9px",borderRadius:6,cursor:"pointer",
                border:`1px solid ${roles.has(r)?ROLE_COLOR[r]:C.border}`,
                background:roles.has(r)?`${ROLE_COLOR[r]}18`:"transparent",
                color:roles.has(r)?ROLE_COLOR[r]:C.muted,
                fontFamily:"monospace",fontSize:8.5,fontWeight:700,letterSpacing:.4,
                transition:"all .12s",whiteSpace:"nowrap",
              }}>
                <div style={{width:6,height:6,borderRadius:2,background:ROLE_COLOR[r]}}/>
                {r.slice(0,3).toUpperCase()} {cnt}
              </div>
            ))}
          </div>

          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search…"
            style={{...fi,width:130,padding:"5px 10px",fontSize:11}}/>

          <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:7,overflow:"hidden"}}>
            {["day","week"].map(v=>(
              <button key={v} onClick={()=>setView(v)} style={{
                padding:"5px 11px",fontSize:8.5,fontWeight:700,fontFamily:"monospace",letterSpacing:.5,
                background:view===v?C.accent:"transparent",color:view===v?"#fff":C.subtext,
                border:"none",cursor:"pointer",textTransform:"uppercase",transition:"all .12s",
              }}>{v}</button>
            ))}
          </div>

          <button onClick={()=>setModal({shift:null,staffId:STAFF[0].id})}
            style={{...bB,background:C.accent,color:"#fff",border:"none",fontSize:12}}>+ Add Shift</button>
          <button style={{...bB,background:C.card,border:`1px solid ${C.border}`,color:C.subtext,fontSize:11}}>⇣ Export</button>
        </header>

        {/* ── STATS ROW ── */}
        <div style={{display:"flex",gap:8,padding:"8px 16px",flexShrink:0,borderBottom:`1px solid ${C.border}`,alignItems:"center",background:C.surface}}>
          {[
            {label:"Shifts today",  val:shifts.length,            color:C.accent},
            {label:"Staff on duty", val:visible.length,           color:C.blue},
            {label:"Hours logged",  val:Math.round(totalH)+"h",   color:C.green},
            {label:"Admins",        val:roleCounts.administrator||0},
            {label:"Assistants",    val:roleCounts.assistant||0},
            {label:"Doctors",       val:roleCounts.doctor||0},
          ].map(({label,val,color})=>(
            <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 12px",minWidth:80}}>
              <div style={{fontFamily:"monospace",fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>{label}</div>
              <div style={{fontSize:17,fontWeight:800,color:color||C.text,letterSpacing:-1}}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── BODY ── */}
        <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>

          {/* ── GRID AREA ── */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

            {/* Hour header — sticky */}
            <div style={{display:"flex",flexShrink:0,position:"sticky",top:0,zIndex:10,background:C.surface,borderBottom:`1px solid ${C.border}`,height:34}}>
              <div style={{width:LABEL_W,flexShrink:0,borderRight:`1px solid ${C.border}`,position:"sticky",left:0,background:C.surface,zIndex:11,display:"flex",alignItems:"center",paddingLeft:14}}>
                {view==="week"&&<span style={{fontFamily:"monospace",fontSize:8,color:C.muted,letterSpacing:.5}}>STAFF / DAY</span>}
              </div>
              {view==="day" && (
                <div style={{position:"relative",width:TOTAL_W,flexShrink:0}}>
                  {Array.from({length:HOURS+1},(_,i)=>(
                    <div key={i} style={{
                      position:"absolute",left:i*HOUR_W,top:0,bottom:0,width:HOUR_W,
                      display:"flex",alignItems:"center",paddingLeft:5,
                      fontFamily:"monospace",fontSize:8.5,color:C.muted,fontWeight:500,
                      borderLeft:i>0?`1px solid ${C.border}`:"none",pointerEvents:"none",
                    }}>{f2(START_H+i)}:00</div>
                  ))}
                  {isToday&&nowLeft>=0&&nowLeft<=TOTAL_W&&(
                    <div style={{position:"absolute",left:nowLeft,top:0,bottom:0,width:1,background:C.accent,opacity:.5,pointerEvents:"none"}}/>
                  )}
                </div>
              )}
              {view==="week" && week.map((d,i)=>{
                const isTd=d.toDateString()===now.toDateString();
                const isSl=d.toDateString()===date.toDateString();
                return (
                  <div key={i} onClick={()=>{setDate(new Date(d));setView("day");}}
                    style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,
                      borderRight:`1px solid ${C.border}`,cursor:"pointer",
                      background:isSl?"rgba(249,115,22,0.07)":"transparent",transition:"background .12s",
                    }}>
                    <span style={{fontFamily:"monospace",fontSize:8.5,color:C.muted}}>{WDAYS[i]}</span>
                    <span style={{
                      fontSize:12,fontWeight:700,width:22,height:22,borderRadius:5,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      background:isTd?C.accent:"transparent",
                      color:isTd?"#fff":isSl?C.accent:C.text,
                    }}>{d.getDate()}</span>
                  </div>
                );
              })}
            </div>

            {/* Scrollable rows */}
            <div style={{flex:1,overflow:"auto",position:"relative"}}>
              <div style={{minWidth:LABEL_W+(view==="day"?TOTAL_W:600)}}>

                {view==="day" && (
                  <>
                    {visible.map((m,i)=>(
                      <StaffRow key={m.id} member={m} dayShifts={dayShifts(m.id)}
                        onClickShift={openEdit} onClickEmpty={openNew} stripe={i%2===1}/>
                    ))}
                    {/* now line */}
                    {isToday&&nowLeft>=0&&nowLeft<=TOTAL_W&&(
                      <div style={{position:"absolute",top:0,bottom:0,left:LABEL_W+nowLeft,width:2,background:C.accent,zIndex:5,pointerEvents:"none",opacity:.8}}>
                        <div style={{position:"absolute",top:4,left:-4,width:10,height:10,background:C.accent,borderRadius:"50%"}}/>
                      </div>
                    )}
                  </>
                )}

                {view==="week" && visible.map((m,i)=>(
                  <div key={m.id} style={{display:"flex",height:ROW_H,borderBottom:`1px solid ${C.border}`,background:i%2===1?"rgba(22,26,34,0.55)":"transparent"}}>
                    {/* label */}
                    <div style={{
                      width:LABEL_W,flexShrink:0,display:"flex",alignItems:"center",gap:9,
                      padding:"0 14px",borderRight:`1px solid ${C.border}`,
                      position:"sticky",left:0,zIndex:3,
                      background:i%2===1?"#13171e":C.surface,
                    }}>
                      <div style={{width:30,height:30,borderRadius:7,background:`linear-gradient(135deg,${m.color},${m.color}77)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0}}>{m.initials}</div>
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>{m.name}</div>
                        <div style={{fontSize:8.5,color:ROLE_COLOR[m.role]||C.subtext,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:.4,marginTop:1}}>{m.role}</div>
                      </div>
                    </div>
                    {/* 7 cells */}
                    {week.map((d,di)=>{
                      const isTd=d.toDateString()===now.toDateString();
                      const sh=dayShifts(m.id)[0];
                      return (
                        <div key={di} onClick={()=>{setDate(new Date(d));setView("day");openNew(m.id,9);}}
                          style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                            borderRight:`1px solid ${C.border}`,cursor:"pointer",
                            background:isTd?"rgba(249,115,22,0.04)":"transparent",
                            transition:"background .12s",position:"relative",
                          }}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,0.07)"}
                          onMouseLeave={e=>e.currentTarget.style.background=isTd?"rgba(249,115,22,0.04)":"transparent"}>
                          {sh&&di===3&&(
                            <div style={{
                              background:SHIFT_TYPES[sh.type].bg,border:`1px solid ${SHIFT_TYPES[sh.type].border}`,
                              borderRadius:5,padding:"2px 6px",fontFamily:"monospace",fontSize:8,fontWeight:700,
                              color:SHIFT_TYPES[sh.type].text,whiteSpace:"nowrap",
                            }}>{f2(sh.sh)}:{f2(sh.sm)}–{f2(sh.eh)}:{f2(sh.em)}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {visible.length===0&&(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:160,color:C.muted,fontFamily:"monospace",fontSize:11}}>No staff matching filters</div>
                )}
              </div>
            </div>
          </div>

          {/* ════ RIGHT PANEL ════ */}
          <aside style={{width:218,flexShrink:0,borderLeft:`1px solid ${C.border}`,background:C.surface,display:"flex",flexDirection:"column",overflow:"hidden"}}>

            {/* Mini calendar */}
            <div style={{padding:13,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={rpLabel}>Calendar</div>
              <MiniCal selected={date} onSelect={d=>{setDate(d);setView("day");}}/>
            </div>

            {/* Shift type legend */}
            <div style={{padding:13,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={rpLabel}>Shift Types</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {Object.entries(SHIFT_TYPES).map(([k,v])=>(
                  <div key={k} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",borderRadius:6,background:v.bg,border:`1px solid ${v.border}22`}}>
                    <div style={{width:8,height:8,borderRadius:2,background:v.border,flexShrink:0}}/>
                    <span style={{fontSize:10,fontWeight:700,color:v.text,flex:1}}>{v.label}</span>
                    <span style={{fontFamily:"monospace",fontSize:8.5,color:v.text,opacity:.7}}>
                      {shifts.filter(s=>s.type===k).length}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Staff list with shift status */}
            <div style={{flex:1,overflowY:"auto",padding:13}}>
              <div style={rpLabel}>Staff on duty</div>
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {STAFF.map(s=>{
                  const on=dayShifts(s.id);
                  const hrs=on.reduce((a,sh)=>a+(toM(sh.eh,sh.em)-toM(sh.sh,sh.sm))/60,0);
                  const isVis=visible.includes(s);
                  return (
                    <div key={s.id}
                      onClick={()=>on.length?openEdit(on[0]):openNew(s.id,9)}
                      style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",borderRadius:7,cursor:"pointer",
                        opacity:isVis?1:.35,transition:"background .12s, opacity .15s",
                      }}
                      onMouseEnter={e=>e.currentTarget.style.background=C.card}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{width:7,height:7,borderRadius:2,background:s.color,flexShrink:0}}/>
                      <span style={{fontSize:10.5,fontWeight:600,flex:1,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</span>
                      {hrs>0
                        ?<span style={{fontFamily:"monospace",fontSize:8.5,color:C.accent,fontWeight:700}}>{Math.round(hrs)}h</span>
                        :<span style={{fontFamily:"monospace",fontSize:8,color:C.muted}}>—</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* MODAL */}
      {modal&&<ShiftModal initData={modal} onClose={closeModal} onSave={saveShift} onDelete={delShift}/>}
    </div>
  );
}

const nI={display:"flex",alignItems:"center",gap:9,padding:"8px 9px",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:500,marginBottom:2,transition:"all .13s"};
const nLabel={fontFamily:"monospace",fontSize:8,color:C.muted,letterSpacing:1.4,textTransform:"uppercase",padding:"13px 9px 5px",fontWeight:500};
const aBtn={width:28,height:28,border:`1px solid ${C.border}`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.subtext,fontSize:13,background:"transparent",transition:"all .12s"};
const rpLabel={fontFamily:"monospace",fontSize:8,color:C.muted,letterSpacing:1.4,textTransform:"uppercase",marginBottom:8,fontWeight:500};
