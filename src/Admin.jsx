import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, getDocs, query, orderBy } from "firebase/firestore";
import { auth, db } from "./firebase";
import { APP_NAME, APP_SUB } from "./App";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:"#F7F8FA", surface:"#FFFFFF", border:"#E8ECF0",
  primary:"#2563EB", primaryLight:"#EFF6FF",
  success:"#16A34A", successLight:"#F0FDF4",
  warning:"#D97706", warningLight:"#FFFBEB",
  danger:"#DC2626", dangerLight:"#FEF2F2",
  purple:"#7C3AED", purpleLight:"#F5F3FF",
  text:"#0F172A", muted:"#64748B", subtle:"#94A3B8",
};
const COLORS = ["#2563EB","#16A34A","#D97706","#DC2626","#7C3AED","#0891B2","#DB2777","#65A30D"];
const STATUS = {
  pending:      { label:"Pendiente",  color:C.muted,   dot:"#CBD5E1" },
  today:        { label:"Para hoy",   color:C.primary, dot:C.primary },
  "in-progress":{ label:"En curso",  color:C.warning, dot:C.warning },
  done:         { label:"Completado",color:C.success, dot:C.success },
  issue:        { label:"Incidencia",color:C.danger,  dot:C.danger  },
  skipped:      { label:"Omitido",   color:C.purple,  dot:C.purple  },
};
const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

const nowStr   = () => new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
const dateStr  = () => new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"});
const todayStr = () => new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});
const weekRange= () => { const d=new Date(),day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1),mon=new Date(d.setDate(diff)),fri=new Date(mon);fri.setDate(mon.getDate()+4);return `${mon.getDate()}/${mon.getMonth()+1} — ${fri.getDate()}/${fri.getMonth()+1}`; };
const initials = n => n.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
const minAgo   = t => { if(!t)return 0; const[h,m]=t.split(":").map(Number),now=new Date(),then=new Date();then.setHours(h,m,0,0);return Math.floor((now-then)/60000); };

const btn = (ex={}) => ({border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,borderRadius:10,...ex});
const LS = {fontSize:12,color:C.muted,marginBottom:5,display:"block",fontWeight:500};
const IS = {width:"100%",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",outline:"none",boxSizing:"border-box",marginBottom:12,color:C.text,background:C.surface};

function Badge({status}){
  const st=STATUS[status]||STATUS.pending;
  return <span style={{fontSize:11,fontWeight:600,color:st.color,background:st.color+"18",borderRadius:6,padding:"3px 9px",whiteSpace:"nowrap"}}>{st.label}</span>;
}
function Ring({pct,color,size=52}){
  const r=20,circ=2*Math.PI*r,dash=circ*(pct/100);
  return(<svg width={size} height={size} viewBox="0 0 48 48"><circle cx="24" cy="24" r={r} fill="none" stroke={C.border} strokeWidth="4"/><circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 24 24)" style={{transition:"stroke-dasharray .5s ease"}}/><text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.text} fontFamily="Inter,sans-serif">{pct}%</text></svg>);
}

function exportCSV(supervisors,routes){
  const rows=[["Supervisor","Parada","Dirección","Estado","Día programado","Entrada","Salida","Notas"]];
  supervisors.forEach(sup=>(routes[sup.id]||[]).forEach(s=>rows.push([sup.name,s.place,s.address,STATUS[s.status]?.label||s.status,s.scheduledDay||"—",s.checkIn||"—",s.checkOut||"—",s.notes||""])));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));a.download=`KosherShevet_${dateStr().replace(/\//g,"-")}.csv`;a.click();
}
function exportPDF(supervisors,routes){
  const w=window.open("","_blank");
  const rows=supervisors.map(sup=>{
    const stops=routes[sup.id]||[];
    const done=stops.filter(s=>["done","skipped"].includes(s.status)).length;
    const pct=stops.length?Math.round(done/stops.length*100):0;
    const tr=stops.map((s,i)=>`<tr><td>${i+1}. ${s.place}</td><td>${s.address}</td><td style="color:${STATUS[s.status]?.color||C.muted};font-weight:600">${STATUS[s.status]?.label||s.status}</td><td>${s.scheduledDay||"—"}</td><td>${s.checkIn||"—"}</td><td>${s.checkOut||"—"}</td><td>${s.notes||""}</td></tr>`).join("");
    return `<h3 style="margin:24px 0 8px;color:#0F172A;font-family:sans-serif">${sup.name} — ${pct}% completado</h3><table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;font-family:sans-serif"><thead style="background:#F7F8FA"><tr><th>Lugar</th><th>Dirección</th><th>Estado</th><th>Día</th><th>Entrada</th><th>Salida</th><th>Notas</th></tr></thead><tbody>${tr}</tbody></table>`;
  }).join("");
  w.document.write(`<!DOCTYPE html><html><head><title>Kosher Shevet Ahim — ${dateStr()}</title></head><body style="font-family:sans-serif;padding:32px;color:#0F172A"><h1 style="color:#2563EB;font-size:20px">📍 ${APP_NAME} — Semana ${weekRange()}</h1>${rows}<p style="color:#94A3B8;font-size:11px;margin-top:32px">Generado el ${dateStr()}</p></body></html>`);
  w.document.close();w.print();
}

export default function Admin({ user }) {
  const [supervisors, setSupervisors] = useState([]);
  const [routes, setRoutes]           = useState({});
  const [pendingUsers, setPendingUsers]= useState([]);
  const [historyLog, setHistoryLog]   = useState([]);
  const [alerts, setAlerts]           = useState([]);
  const [view, setView]               = useState("dashboard");
  const [selectedSup, setSelectedSup] = useState(null);
  const [modal, setModal]             = useState(null);
  const [form, setForm]               = useState({});
  const [nextId, setNextId]           = useState(100);
  const fileRef = useRef();

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"supervisors"),snap=>setSupervisors(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u2=onSnapshot(collection(db,"users"),snap=>setPendingUsers(snap.docs.map(d=>d.data()).filter(u=>u.role==="pending")));
    const u3=onSnapshot(query(collection(db,"history"),orderBy("timestamp","desc")),snap=>setHistoryLog(snap.docs.map(d=>({id:d.id,...d.data()})).slice(0,100)));
    return()=>{u1();u2();u3();};
  },[]);

  useEffect(()=>{
    if(!supervisors.length) return;
    const unsubs=supervisors.map(sup=>onSnapshot(query(collection(db,"supervisors",sup.id,"stops"),orderBy("order","asc")),snap=>{
      setRoutes(prev=>({...prev,[sup.id]:snap.docs.map(d=>({id:d.id,...d.data()}))}));
    }));
    return()=>unsubs.forEach(u=>u());
  },[supervisors]);

  useEffect(()=>{
    const check=()=>{
      supervisors.forEach(sup=>(routes[sup.id]||[]).forEach(stop=>{
        if(stop.status==="in-progress"&&stop.checkIn&&!stop.alertSent&&minAgo(stop.checkIn)>=30){
          setAlerts(prev=>[{supId:sup.id,supName:sup.name,place:stop.place,minutes:minAgo(stop.checkIn)},...prev].slice(0,20));
          updateDoc(doc(db,"supervisors",sup.id,"stops",stop.id),{alertSent:true});
        }
      }));
    };
    check();const t=setInterval(check,60000);return()=>clearInterval(t);
  },[routes,supervisors]);

  const getProgress = supId => {
    const stops=routes[supId]||[];
    if(!stops.length)return{done:0,total:0,pct:0,todayTotal:0,todayDone:0};
    const done=stops.filter(s=>["done","skipped"].includes(s.status)).length;
    const todayStops=stops.filter(s=>["today","in-progress","done","issue","skipped"].includes(s.status));
    const todayDone=todayStops.filter(s=>["done","skipped"].includes(s.status)).length;
    return{done,total:stops.length,pct:Math.round(done/stops.length*100),todayTotal:todayStops.length,todayDone};
  };

  async function addSupervisor(){
    if(!form.name?.trim())return;
    const ref=doc(collection(db,"supervisors"));
    await setDoc(ref,{name:form.name.trim(),avatar:initials(form.name),color:form.color||COLORS[0],email:form.email||"",createdAt:Date.now()});
    setRoutes(prev=>({...prev,[ref.id]:[]}));closeModal();
  }
  async function editSupervisor(){
    await updateDoc(doc(db,"supervisors",form.id),{name:form.name.trim(),avatar:initials(form.name),color:form.color,email:form.email||""});closeModal();
  }
  async function deleteSupervisor(id){
    if(!confirm("¿Eliminar supervisor y todas sus paradas?"))return;
    const stops=await getDocs(collection(db,"supervisors",id,"stops"));
    await Promise.all(stops.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(db,"supervisors",id));
    if(selectedSup===id){setSelectedSup(null);setView("dashboard");}
  }
  async function addStop(){
    if(!form.place?.trim())return;
    const stops=routes[form.supId]||[];
    await addDoc(collection(db,"supervisors",form.supId,"stops"),{place:form.place.trim(),address:(form.address||"").trim(),status:"pending",checkIn:null,checkOut:null,notes:"",photos:[],alertSent:false,scheduledDay:null,order:stops.length});
    closeModal();
  }
  async function editStop(){
    await updateDoc(doc(db,"supervisors",form.supId,"stops",form.stopId),{place:form.place.trim(),address:(form.address||"").trim()});closeModal();
  }
  async function deleteStop(supId,stopId){ await deleteDoc(doc(db,"supervisors",supId,"stops",stopId)); }
  async function reorderStop(supId,idx,dir){
    const arr=[...(routes[supId]||[])];const to=idx+dir;
    if(to<0||to>=arr.length)return;
    await updateDoc(doc(db,"supervisors",supId,"stops",arr[idx].id),{order:to});
    await updateDoc(doc(db,"supervisors",supId,"stops",arr[to].id),{order:idx});
  }
  async function saveNote(){
    await updateDoc(doc(db,"supervisors",form.supId,"stops",form.stopId),{notes:form.text||""});closeModal();
  }
  async function handlePhoto(e){
    Array.from(e.target.files).forEach(file=>{
      const reader=new FileReader();
      reader.onload=async ev=>{
        const stop=(routes[form.supId]||[]).find(s=>s.id===form.stopId);
        const photos=[...(stop?.photos||[]),{url:ev.target.result,name:file.name,time:nowStr()}];
        await updateDoc(doc(db,"supervisors",form.supId,"stops",form.stopId),{photos});
      };reader.readAsDataURL(file);
    });closeModal();
  }
  async function approveUser(uid,supId){await updateDoc(doc(db,"users",uid),{role:"supervisor",assignedSupId:supId||""});}
  async function rejectUser(uid){await deleteDoc(doc(db,"users",uid));}
  async function resetWeek(supId){
    const stops=routes[supId]||[];
    await Promise.all(stops.map(s=>updateDoc(doc(db,"supervisors",supId,"stops",s.id),{status:"pending",checkIn:null,checkOut:null,scheduledDay:null,alertSent:false,notes:""})));
  }

  function openModal(type,data={}){setModal(type);setForm(data);}
  function closeModal(){setModal(null);setForm({});}

  const sup=selectedSup?supervisors.find(s=>s.id===selectedSup):null;
  const allStops=Object.values(routes).flat();

  const NAV=[
    {id:"dashboard",icon:"📊",label:"Panel"},
    {id:"manage",icon:"⚙️",label:"Gestión"},
    {id:"users",icon:"👥",label:"Usuarios",badge:pendingUsers.length},
    {id:"history",icon:"📋",label:"Historial"},
  ];

  return(
    <div style={{fontFamily:"Inter,sans-serif",background:C.bg,minHeight:"100vh"}}>

      {/* Top nav */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {selectedSup&&view==="dashboard"&&<button onClick={()=>setSelectedSup(null)} style={{...btn({background:C.bg,color:C.muted,padding:"7px 12px",border:`1px solid ${C.border}`,fontSize:13,marginRight:4})}}>←</button>}
          <div style={{width:34,height:34,background:C.primary,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📍</div>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:C.text,letterSpacing:"-.3px"}}>{APP_NAME}</div>
            <div style={{fontSize:10,color:C.muted,fontWeight:500,textTransform:"capitalize"}}>{todayStr()}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {alerts.length>0&&<button onClick={()=>openModal("alerts")} style={{...btn({background:C.dangerLight,color:C.danger,padding:"7px 12px",fontSize:12})}}>🔔 {alerts.length}</button>}
          <button onClick={()=>exportCSV(supervisors,routes)} style={{...btn({background:C.successLight,color:C.success,padding:"7px 12px",fontSize:12})}}>⬇ CSV</button>
          <button onClick={()=>exportPDF(supervisors,routes)} style={{...btn({background:C.primaryLight,color:C.primary,padding:"7px 12px",fontSize:12})}}>🖨 PDF</button>
          <button onClick={()=>signOut(auth)} style={{...btn({background:C.bg,color:C.muted,padding:"7px 12px",fontSize:12,border:`1px solid ${C.border}`})}}>Salir</button>
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:50}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>{setView(n.id);setSelectedSup(null);}} style={{...btn({flex:1,padding:"10px 4px",background:"none",color:view===n.id?C.primary:C.muted,fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:2,borderRadius:0,borderTop:view===n.id?`2px solid ${C.primary}`:"2px solid transparent",fontWeight:view===n.id?700:500})}}>
            <span style={{fontSize:18}}>{n.icon}</span>
            {n.label}{n.badge>0?` (${n.badge})`:""}
          </button>
        ))}
      </div>

      <div style={{padding:"16px 16px 80px",maxWidth:800,margin:"0 auto"}}>

        {/* ── DASHBOARD LIST ── */}
        {view==="dashboard"&&!selectedSup&&(
          <>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
              {[
                {icon:"✅",val:allStops.filter(s=>s.status==="done").length,label:"Completadas hoy"},
                {icon:"⚠️",val:allStops.filter(s=>s.status==="issue").length,label:"Incidencias"},
                {icon:"📋",val:allStops.filter(s=>s.status==="pending").length,label:"Pendientes semana"},
                {icon:"⏳",val:allStops.filter(s=>s.status==="in-progress").length,label:"En curso ahora"},
              ].map(c=>(
                <div key={c.label} style={{background:C.surface,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:20,marginBottom:4}}>{c.icon}</div>
                  <div style={{fontSize:26,fontWeight:800,color:C.text,lineHeight:1}}>{c.val}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2,fontWeight:500}}>{c.label}</div>
                </div>
              ))}
            </div>

            {supervisors.length===0&&<div style={{textAlign:"center",color:C.muted,padding:48,fontSize:14}}>No hay supervisores. Ve a ⚙️ Gestión para agregar.</div>}

            {supervisors.map(s=>{
              const p=getProgress(s.id);
              const stops=routes[s.id]||[];
              const inProg=stops.find(x=>x.status==="in-progress");
              const hasAlert=alerts.some(a=>a.supId===s.id);
              return(
                <div key={s.id} onClick={()=>setSelectedSup(s.id)}
                  style={{background:C.surface,borderRadius:16,padding:18,marginBottom:10,border:`1px solid ${hasAlert?C.danger:C.border}`,cursor:"pointer",transition:"box-shadow .2s"}}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.08)"}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:44,height:44,borderRadius:12,background:s.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,color:"#fff",flexShrink:0}}>{s.avatar}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:15,color:C.text}}>{s.name}</div>
                      <div style={{fontSize:12,color:inProg?C.warning:C.muted,marginTop:2,fontWeight:500}}>
                        {hasAlert?"🔴 Atraso detectado":inProg?`En: ${inProg.place}`:p.done===p.total&&p.total>0?"✅ Semana completa":`Hoy: ${p.todayDone}/${p.todayTotal} · Semana: ${p.done}/${p.total}`}
                      </div>
                    </div>
                    <Ring pct={p.pct} color={s.color}/>
                  </div>
                  {/* Day strip */}
                  <div style={{display:"flex",gap:3,marginTop:12}}>
                    {DAYS.slice(0,5).map(day=>{
                      const dayStops=stops.filter(st=>st.scheduledDay===day||["in-progress","done","issue","skipped"].includes(st.status)&&st.scheduledDay===day);
                      const dayDone=dayStops.filter(st=>["done","skipped"].includes(st.status)).length;
                      return(
                        <div key={day} style={{flex:1,textAlign:"center"}}>
                          <div style={{fontSize:9,color:C.subtle,marginBottom:3,fontWeight:600}}>{day.slice(0,2).toUpperCase()}</div>
                          <div style={{height:4,borderRadius:99,background:dayStops.length===0?C.border:dayDone===dayStops.length?C.success:dayDone>0?C.warning:C.primary}}/>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── DASHBOARD DETAIL ── */}
        {view==="dashboard"&&selectedSup&&sup&&(()=>{
          const stops=routes[selectedSup]||[];
          const p=getProgress(selectedSup);
          const todayStops=stops.filter(s=>["today","in-progress","done","issue","skipped"].includes(s.status));
          const pendingStops=stops.filter(s=>s.status==="pending");
          return(
            <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                <div style={{width:48,height:48,borderRadius:13,background:sup.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,color:"#fff"}}>{sup.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:18,fontWeight:800,color:C.text}}>{sup.name}</div>
                  <div style={{fontSize:12,color:C.muted}}>Semana {weekRange()} · {p.done}/{p.total} completadas</div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>openModal("addStop",{supId:selectedSup})} style={{...btn({background:C.primaryLight,color:C.primary,padding:"8px 14px",fontSize:13})}}>+ Parada</button>
                  <button onClick={()=>{if(confirm("¿Reiniciar semana? Se borrarán todos los check-ins y estados."))resetWeek(selectedSup);}} style={{...btn({background:C.bg,color:C.muted,padding:"8px 12px",fontSize:12,border:`1px solid ${C.border}`})}}>🔄</button>
                </div>
              </div>

              {/* Today section */}
              {todayStops.length>0&&(
                <>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Para hoy</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                    {todayStops.map((stop,i)=>{
                      const sc=STATUS[stop.status]||STATUS.pending;
                      return(
                        <div key={stop.id} style={{background:C.surface,borderRadius:13,padding:14,border:`1px solid ${stop.status==="in-progress"?C.warning:C.border}`}}>
                          <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:sc.dot,flexShrink:0,marginTop:6}}/>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                                <span style={{fontWeight:700,color:C.text,fontSize:14}}>{stop.place}</span>
                                <Badge status={stop.status}/>
                              </div>
                              <div style={{fontSize:11,color:C.muted}}>{stop.address}</div>
                              {(stop.checkIn||stop.checkOut)&&<div style={{fontSize:11,color:C.subtle,marginTop:2}}>{stop.checkIn&&`Entrada: ${stop.checkIn}`}{stop.checkOut&&` · Salida: ${stop.checkOut}`}</div>}
                              {stop.notes&&<div style={{fontSize:12,color:C.warning,background:C.warningLight,borderRadius:7,padding:"5px 9px",marginTop:6}}>📝 {stop.notes}</div>}
                              {stop.photos?.length>0&&<div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>{stop.photos.map((p,pi)=><img key={pi} src={p.url} alt="" style={{width:48,height:48,objectFit:"cover",borderRadius:7,border:`1px solid ${C.border}`}}/>)}</div>}
                              <div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}>
                                <button onClick={()=>openModal("note",{supId:selectedSup,stopId:stop.id,text:stop.notes})} style={{...btn({background:C.bg,color:C.warning,padding:"6px 11px",fontSize:12,border:`1px solid ${C.border}`})}}>📝</button>
                                <button onClick={()=>openModal("photo",{supId:selectedSup,stopId:stop.id})} style={{...btn({background:C.bg,color:C.primary,padding:"6px 11px",fontSize:12,border:`1px solid ${C.border}`})}}>📷</button>
                                <button onClick={()=>openModal("editStop",{supId:selectedSup,stopId:stop.id,place:stop.place,address:stop.address})} style={{...btn({background:C.bg,color:C.muted,padding:"6px 10px",fontSize:12,border:`1px solid ${C.border}`})}}>✎</button>
                                <button onClick={()=>deleteStop(selectedSup,stop.id)} style={{...btn({background:C.bg,color:C.danger,padding:"6px 10px",fontSize:12,border:`1px solid ${C.border}`})}}>🗑</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Pending section */}
              {pendingStops.length>0&&(
                <>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Pendientes esta semana ({pendingStops.length})</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {pendingStops.map((stop,i)=>(
                      <div key={stop.id} style={{background:C.surface,borderRadius:12,padding:"11px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:"#CBD5E1",flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,color:C.text,fontSize:13}}>{stop.place}</div>
                          <div style={{fontSize:11,color:C.muted}}>{stop.address}</div>
                        </div>
                        <div style={{display:"flex",gap:5}}>
                          <button onClick={()=>openModal("editStop",{supId:selectedSup,stopId:stop.id,place:stop.place,address:stop.address})} style={{...btn({background:C.bg,color:C.muted,padding:"5px 9px",fontSize:12,border:`1px solid ${C.border}`})}}>✎</button>
                          <button onClick={()=>deleteStop(selectedSup,stop.id)} style={{...btn({background:C.bg,color:C.danger,padding:"5px 9px",fontSize:12,border:`1px solid ${C.border}`})}}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          );
        })()}

        {/* ── GESTIÓN ── */}
        {view==="manage"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>⚙️ Gestión</div>
              <button onClick={()=>openModal("addSup")} style={{...btn({background:C.primary,color:"#fff",padding:"9px 16px",fontSize:13})}}>+ Supervisor</button>
            </div>
            {supervisors.map(s=>{
              const stops=routes[s.id]||[];const p=getProgress(s.id);
              return(
                <div key={s.id} style={{background:C.surface,borderRadius:16,padding:16,marginBottom:10,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <div style={{width:40,height:40,borderRadius:10,background:s.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff",fontSize:13}}>{s.avatar}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:C.text}}>{s.name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{stops.length} paradas · {p.pct}% semana · {s.email||"sin email"}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>openModal("editSup",{id:s.id,name:s.name,color:s.color,email:s.email||""})} style={{...btn({background:C.bg,color:C.muted,padding:"7px 12px",fontSize:12,border:`1px solid ${C.border}`})}}>✎ Editar</button>
                      <button onClick={()=>deleteSupervisor(s.id)} style={{...btn({background:C.dangerLight,color:C.danger,padding:"7px 12px",fontSize:12})}}>🗑</button>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {stops.map((st,i)=>(
                      <div key={st.id} style={{display:"flex",alignItems:"center",gap:8,background:C.bg,borderRadius:8,padding:"7px 10px"}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:STATUS[st.status]?.dot||"#CBD5E1",flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,color:C.text,fontWeight:500}}>{i+1}. {st.place}</span>
                        <span style={{fontSize:11,color:C.muted}}>{st.address}</span>
                        <button onClick={()=>reorderStop(s.id,i,-1)} disabled={i===0} style={{...btn({background:"none",color:C.subtle,padding:"2px 5px",fontSize:11})}}>▲</button>
                        <button onClick={()=>reorderStop(s.id,i,1)} disabled={i===stops.length-1} style={{...btn({background:"none",color:C.subtle,padding:"2px 5px",fontSize:11})}}>▼</button>
                        <button onClick={()=>openModal("editStop",{supId:s.id,stopId:st.id,place:st.place,address:st.address})} style={{...btn({background:"none",color:C.muted,padding:"2px 6px",fontSize:12})}}>✎</button>
                        <button onClick={()=>deleteStop(s.id,st.id)} style={{...btn({background:"none",color:C.danger,padding:"2px 6px",fontSize:12})}}>🗑</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>openModal("addStop",{supId:s.id})} style={{...btn({background:C.bg,color:C.muted,marginTop:8,width:"100%",padding:"8px",textAlign:"center",fontSize:12,border:`1px dashed ${C.border}`})}}>+ Agregar parada</button>
                </div>
              );
            })}
          </>
        )}

        {/* ── USUARIOS ── */}
        {view==="users"&&(
          <>
            <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:14}}>👥 Usuarios pendientes</div>
            {pendingUsers.length===0
              ?<div style={{textAlign:"center",color:C.muted,padding:48,fontSize:14}}>No hay usuarios pendientes de aprobación.</div>
              :pendingUsers.map(u=>(
                <div key={u.uid} style={{background:C.surface,borderRadius:14,padding:16,marginBottom:8,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:C.muted,fontSize:14}}>{initials(u.name||u.email)}</div>
                    <div><div style={{fontWeight:700,color:C.text}}>{u.name}</div><div style={{fontSize:11,color:C.muted}}>{u.email}</div></div>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8,fontWeight:500}}>Asignar como supervisor de:</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {supervisors.map(s=><button key={s.id} onClick={()=>approveUser(u.uid,s.id)} style={{...btn({background:s.color+"18",color:s.color,padding:"7px 14px",fontSize:13})}}>{s.name}</button>)}
                    <button onClick={()=>rejectUser(u.uid)} style={{...btn({background:C.dangerLight,color:C.danger,padding:"7px 14px",fontSize:13})}}>✕ Rechazar</button>
                  </div>
                </div>
              ))}
          </>
        )}

        {/* ── HISTORIAL ── */}
        {view==="history"&&(
          <>
            <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:14}}>📋 Historial</div>
            {historyLog.length===0
              ?<div style={{textAlign:"center",color:C.muted,padding:40,fontSize:14}}>Sin actividad registrada.</div>
              :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                {historyLog.map((h,i)=>(
                  <div key={i} style={{background:C.surface,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,color:C.subtle,minWidth:38,fontVariantNumeric:"tabular-nums"}}>{h.time}</div>
                    <div style={{width:7,height:7,borderRadius:"50%",background:h.supColor||C.primary,flexShrink:0}}/>
                    <div style={{flex:1,fontSize:13}}><span style={{fontWeight:700,color:C.text}}>{h.supervisor}</span><span style={{color:C.muted}}> → </span><span style={{color:C.text}}>{h.place}</span></div>
                    <span style={{fontSize:11,color:C.muted,background:C.bg,borderRadius:6,padding:"2px 8px",border:`1px solid ${C.border}`}}>{h.action}</span>
                  </div>
                ))}
              </div>}
            {/* Summary */}
            {historyLog.length>0&&(
              <div style={{marginTop:24}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Resumen semanal</div>
                {supervisors.map(s=>{
                  const p=getProgress(s.id);const stops=routes[s.id]||[];
                  return(
                    <div key={s.id} style={{background:C.surface,borderRadius:12,padding:"12px 14px",marginBottom:6,border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div style={{fontWeight:700,color:C.text,fontSize:14}}>{s.name}</div>
                        <div style={{fontWeight:800,color:p.pct===100?C.success:C.text}}>{p.pct}%</div>
                      </div>
                      <div style={{display:"flex",gap:8,fontSize:11,flexWrap:"wrap"}}>
                        {Object.entries(STATUS).map(([key,cfg])=>{
                          const count=stops.filter(st=>st.status===key).length;
                          if(!count)return null;
                          return <span key={key} style={{color:cfg.color,fontWeight:500}}>{cfg.label}: <strong>{count}</strong></span>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── MODALS ── */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,padding:16}} onClick={closeModal}>
          <div style={{background:C.surface,borderRadius:20,padding:24,width:"100%",maxWidth:480,marginBottom:8,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>

            {modal==="note"&&<>
              <div style={{fontWeight:700,color:C.text,fontSize:16,marginBottom:12}}>📝 Nota de parada</div>
              <textarea value={form.text||""} onChange={e=>setForm(p=>({...p,text:e.target.value}))} placeholder="Describe lo encontrado..."
                style={{...IS,minHeight:90,resize:"vertical"}}/>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={closeModal} style={{...btn({background:C.bg,color:C.muted,padding:"10px 18px",border:`1px solid ${C.border}`})}}>Cancelar</button>
                <button onClick={saveNote} style={{...btn({background:C.primary,color:"#fff",padding:"10px 18px"})}}>Guardar</button>
              </div>
            </>}

            {modal==="photo"&&<>
              <div style={{fontWeight:700,color:C.text,fontSize:16,marginBottom:14}}>📷 Adjuntar foto</div>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current.click()} style={{...btn({background:C.primary,color:"#fff",padding:"14px",fontSize:14,width:"100%",textAlign:"center"})}}>Tomar foto / Seleccionar</button>
              <button onClick={closeModal} style={{...btn({background:C.bg,color:C.muted,padding:"12px",fontSize:13,width:"100%",textAlign:"center",marginTop:8,border:`1px solid ${C.border}`})}}>Cancelar</button>
            </>}

            {(modal==="addSup"||modal==="editSup")&&<>
              <div style={{fontWeight:700,color:C.text,fontSize:16,marginBottom:14}}>{modal==="addSup"?"Nuevo supervisor":"Editar supervisor"}</div>
              <label style={LS}>Nombre</label>
              <input value={form.name||""} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej: Ana García" style={IS}/>
              <label style={LS}>Email (opcional)</label>
              <input value={form.email||""} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="supervisor@email.com" style={IS}/>
              <label style={LS}>Color</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                {COLORS.map(c=><div key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:form.color===c?`3px solid ${C.text}`:`3px solid transparent`,transition:"border .15s"}}/>)}
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={closeModal} style={{...btn({background:C.bg,color:C.muted,padding:"10px 18px",border:`1px solid ${C.border}`})}}>Cancelar</button>
                <button onClick={modal==="addSup"?addSupervisor:editSupervisor} style={{...btn({background:C.primary,color:"#fff",padding:"10px 18px"})}}>{modal==="addSup"?"Agregar":"Guardar"}</button>
              </div>
            </>}

            {(modal==="addStop"||modal==="editStop")&&<>
              <div style={{fontWeight:700,color:C.text,fontSize:16,marginBottom:14}}>{modal==="addStop"?"Nueva parada":"Editar parada"}</div>
              <label style={LS}>Nombre del lugar</label>
              <input value={form.place||""} onChange={e=>setForm(p=>({...p,place:e.target.value}))} placeholder="Ej: Almacén Norte" style={IS}/>
              <label style={LS}>Dirección</label>
              <input value={form.address||""} onChange={e=>setForm(p=>({...p,address:e.target.value}))} placeholder="Ej: Av. Principal 100" style={IS}/>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={closeModal} style={{...btn({background:C.bg,color:C.muted,padding:"10px 18px",border:`1px solid ${C.border}`})}}>Cancelar</button>
                <button onClick={modal==="addStop"?addStop:editStop} style={{...btn({background:C.primary,color:"#fff",padding:"10px 18px"})}}>{modal==="addStop"?"Agregar":"Guardar"}</button>
              </div>
            </>}

            {modal==="alerts"&&<>
              <div style={{fontWeight:700,color:C.danger,fontSize:16,marginBottom:12}}>🔔 Alertas activas</div>
              {alerts.map((a,i)=>(
                <div key={i} style={{background:C.dangerLight,borderRadius:10,padding:"10px 14px",marginBottom:8}}>
                  <div style={{fontWeight:700,color:C.text,fontSize:14}}>{a.supName}</div>
                  <div style={{fontSize:12,color:C.danger,marginTop:2}}>{a.place} — lleva +{a.minutes} minutos en curso</div>
                </div>
              ))}
              <button onClick={()=>{setAlerts([]);closeModal();}} style={{...btn({background:C.bg,color:C.muted,padding:"10px",width:"100%",textAlign:"center",marginTop:8,border:`1px solid ${C.border}`})}}>Limpiar alertas</button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
