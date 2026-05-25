import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import {
  collection, doc, onSnapshot, setDoc, updateDoc,
  deleteDoc, addDoc, getDocs, query, orderBy
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = ["#E8703A","#4A90D9","#5CB85C","#9B59B6","#E74C3C","#1ABC9C","#F39C12","#2980B9"];
const ALERT_MINUTES = 30;

const STATUS_CFG = {
  pending:      { label: "Pendiente",  color: "#94a3b8", icon: "○" },
  "in-progress":{ label: "En curso",  color: "#f59e0b", icon: "◉" },
  done:         { label: "Completado",color: "#22c55e", icon: "✓" },
  issue:        { label: "Incidencia",color: "#ef4444", icon: "!" },
  skipped:      { label: "Omitido",   color: "#8b5cf6", icon: "—" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const nowStr  = () => new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
const todayStr= () => new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});
const dateStr = () => new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"});
const initials= n => n.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
const minutesAgo = t => { if(!t) return 0; const [h,m]=t.split(":").map(Number),now=new Date(),then=new Date(); then.setHours(h,m,0,0); return Math.floor((now-then)/60000); };

const btn = (ex={}) => ({padding:"6px 13px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,...ex});
const labelS = {fontSize:12,color:"#64748b",marginBottom:4,display:"block"};
const inputS  = {width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:10,color:"#f8fafc",padding:"9px 12px",fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:12};

function Progress({value,color}){
  return <div style={{background:"#0f172a",borderRadius:99,height:7,overflow:"hidden"}}>
    <div style={{width:`${value}%`,background:color,height:"100%",borderRadius:99,transition:"width .6s ease"}}/>
  </div>;
}
function Badge({status}){
  const c=STATUS_CFG[status]||STATUS_CFG.pending;
  return <span style={{fontSize:11,fontWeight:700,color:c.color,background:c.color+"22",border:`1px solid ${c.color}44`,borderRadius:6,padding:"2px 8px",whiteSpace:"nowrap"}}>{c.icon} {c.label}</span>;
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportCSV(supervisors, routes){
  const rows=[["Supervisor","Parada","Dirección","Estado","Entrada","Salida","Notas","Fotos"]];
  supervisors.forEach(sup=>{
    (routes[sup.id]||[]).forEach(s=>{
      rows.push([sup.name,s.place,s.address,STATUS_CFG[s.status]?.label||s.status,
        s.checkIn||"—",s.checkOut||"—",s.notes||"",s.photos?.length||0]);
    });
  });
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  a.download=`KOSHERPTY_${dateStr().replace(/\//g,"-")}.csv`; a.click();
}

function exportPDF(supervisors, routes){
  const w=window.open("","_blank");
  const rows=supervisors.map(sup=>{
    const stops=routes[sup.id]||[];
    const done=stops.filter(s=>s.status==="done"||s.status==="skipped").length;
    const pct=stops.length?Math.round(done/stops.length*100):0;
    const stopsHtml=stops.map((s,i)=>`<tr>
      <td>${i+1}. ${s.place}</td><td>${s.address}</td>
      <td style="color:${STATUS_CFG[s.status]?.color||"#94a3b8"};font-weight:700">${STATUS_CFG[s.status]?.label||s.status}</td>
      <td>${s.checkIn||"—"}</td><td>${s.checkOut||"—"}</td><td>${s.notes||""}</td>
    </tr>`).join("");
    return `<h3 style="margin:24px 0 8px;color:#1e293b">${sup.name} — ${pct}% completado</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px">
        <thead style="background:#f1f5f9"><tr><th>Lugar</th><th>Dirección</th><th>Estado</th><th>Entrada</th><th>Salida</th><th>Notas</th></tr></thead>
        <tbody>${stopsHtml}</tbody></table>`;
  }).join("");
  w.document.write(`<!DOCTYPE html><html><head><title>KOSHERPTY ${dateStr()}</title>
    <style>body{font-family:sans-serif;padding:32px}h1{color:#3b82f6}td,th{text-align:left;padding:6px 10px}</style></head>
    <body><h1>📍 Rutas KOSHERPTY — ${dateStr()}</h1>${rows}
    <p style="margin-top:32px;color:#94a3b8;font-size:11px">Generado por Rutas KOSHERPTY</p></body></html>`);
  w.document.close(); w.print();
}

// ─── Main Admin Component ─────────────────────────────────────────────────────
export default function AdminApp({ user }) {
  const [supervisors, setSupervisors] = useState([]);
  const [routes, setRoutes]           = useState({});   // { supId: [stops] }
  const [pendingUsers, setPendingUsers]= useState([]);
  const [view, setView]               = useState("dashboard");
  const [selectedSup, setSelectedSup] = useState(null);
  const [modal, setModal]             = useState(null);
  const [alerts, setAlerts]           = useState([]);
  const [historyLog, setHistoryLog]   = useState([]);
  const [formData, setFormData]       = useState({});
  const fileRef = useRef();

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    // Supervisors
    const unsubSup = onSnapshot(collection(db,"supervisors"), snap => {
      setSupervisors(snap.docs.map(d=>({id:d.id,...d.data()})));
    });
    // Pending users
    const unsubUsers = onSnapshot(collection(db,"users"), snap => {
      setPendingUsers(snap.docs.map(d=>d.data()).filter(u=>u.role==="pending"));
    });
    // History
    const unsubHist = onSnapshot(
      query(collection(db,"history"), orderBy("timestamp","desc")),
      snap => setHistoryLog(snap.docs.map(d=>({id:d.id,...d.data()})).slice(0,100))
    );
    return () => { unsubSup(); unsubUsers(); unsubHist(); };
  }, []);

  useEffect(() => {
    if (!supervisors.length) return;
    const unsubs = supervisors.map(sup => {
      return onSnapshot(
        query(collection(db,"supervisors",sup.id,"stops"), orderBy("order","asc")),
        snap => {
          const stops = snap.docs.map(d=>({id:d.id,...d.data()}));
          setRoutes(prev=>({...prev,[sup.id]:stops}));
        }
      );
    });
    return () => unsubs.forEach(u=>u());
  }, [supervisors]);

  // Alert checker
  useEffect(() => {
    const check = () => {
      supervisors.forEach(sup => {
        (routes[sup.id]||[]).forEach(stop => {
          if(stop.status==="in-progress"&&stop.checkIn&&!stop.alertSent){
            const mins=minutesAgo(stop.checkIn);
            if(mins>=ALERT_MINUTES){
              setAlerts(prev=>[{supId:sup.id,supName:sup.name,place:stop.place,minutes:mins},...prev].slice(0,20));
              updateDoc(doc(db,"supervisors",sup.id,"stops",stop.id),{alertSent:true});
            }
          }
        });
      });
    };
    check();
    const t=setInterval(check,60000);
    return ()=>clearInterval(t);
  },[routes,supervisors]);

  // ── Status update ────────────────────────────────────────────────────────────
  async function updateStatus(supId, stopId, status){
    const t=nowStr();
    const sup=supervisors.find(s=>s.id===supId);
    const stop=(routes[supId]||[]).find(s=>s.id===stopId);
    const updates={status};
    if(status==="in-progress"&&!stop.checkIn) updates.checkIn=t;
    if(["done","issue","skipped"].includes(status)&&stop?.checkIn) updates.checkOut=t;
    await updateDoc(doc(db,"supervisors",supId,"stops",stopId),updates);
    await addDoc(collection(db,"history"),{
      time:t, timestamp:Date.now(), supervisor:sup?.name||"",
      supColor:sup?.color||"#64748b", place:stop?.place||"", action:STATUS_CFG[status]?.label||status
    });
  }

  // ── Supervisor CRUD ──────────────────────────────────────────────────────────
  async function addSupervisor(){
    const {name,color,email}=formData;
    if(!name?.trim()) return;
    const ref=doc(collection(db,"supervisors"));
    await setDoc(ref,{name:name.trim(),avatar:initials(name),color:color||COLORS[0],email:email||"",createdAt:Date.now()});
    closeModal();
  }
  async function editSupervisor(){
    const {id,name,color,email}=formData;
    await updateDoc(doc(db,"supervisors",id),{name:name.trim(),avatar:initials(name),color,email:email||""});
    closeModal();
  }
  async function deleteSupervisor(id){
    if(!confirm("¿Eliminar supervisor y todas sus paradas?")) return;
    const stops=await getDocs(collection(db,"supervisors",id,"stops"));
    await Promise.all(stops.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(db,"supervisors",id));
    if(selectedSup===id){setSelectedSup(null);setView("dashboard");}
  }

  // ── Stop CRUD ────────────────────────────────────────────────────────────────
  async function addStop(){
    const {supId,place,address}=formData;
    if(!place?.trim()) return;
    const stops=routes[supId]||[];
    await addDoc(collection(db,"supervisors",supId,"stops"),{
      place:place.trim(), address:(address||"").trim(),
      status:"pending", checkIn:null, checkOut:null,
      notes:"", photos:[], alertSent:false, order:stops.length
    });
    closeModal();
  }
  async function editStop(){
    const {supId,stopId,place,address}=formData;
    await updateDoc(doc(db,"supervisors",supId,"stops",stopId),{place:place.trim(),address:(address||"").trim()});
    closeModal();
  }
  async function deleteStop(supId,stopId){
    await deleteDoc(doc(db,"supervisors",supId,"stops",stopId));
  }
  async function reorderStop(supId,idx,dir){
    const stops=[...(routes[supId]||[])];
    const to=idx+dir;
    if(to<0||to>=stops.length) return;
    await updateDoc(doc(db,"supervisors",supId,"stops",stops[idx].id),{order:to});
    await updateDoc(doc(db,"supervisors",supId,"stops",stops[to].id),{order:idx});
  }

  // ── Note ─────────────────────────────────────────────────────────────────────
  async function saveNote(){
    const {supId,stopId,text}=formData;
    await updateDoc(doc(db,"supervisors",supId,"stops",stopId),{notes:text||""});
    closeModal();
  }

  // ── Photo ─────────────────────────────────────────────────────────────────────
  function handlePhotoUpload(e){
    const files=Array.from(e.target.files);
    files.forEach(file=>{
      const reader=new FileReader();
      reader.onload=async ev=>{
        const {supId,stopId}=formData;
        const stop=(routes[supId]||[]).find(s=>s.id===stopId);
        const photos=[...(stop?.photos||[]),{url:ev.target.result,name:file.name,time:nowStr()}];
        await updateDoc(doc(db,"supervisors",supId,"stops",stopId),{photos});
      };
      reader.readAsDataURL(file);
    });
    closeModal();
  }
  async function removePhoto(supId,stopId,photoIdx){
    const stop=(routes[supId]||[]).find(s=>s.id===stopId);
    const photos=(stop?.photos||[]).filter((_,i)=>i!==photoIdx);
    await updateDoc(doc(db,"supervisors",supId,"stops",stopId),{photos});
  }

  // ── User approval ─────────────────────────────────────────────────────────────
  async function approveUser(uid, supId){
    await updateDoc(doc(db,"users",uid),{role:"supervisor", assignedSupId: supId||""});
  }
  async function rejectUser(uid){
    await deleteDoc(doc(db,"users",uid));
  }

  function openModal(type,data={}){setModal(type);setFormData(data);}
  function closeModal(){setModal(null);setFormData({});}

  const sup = selectedSup ? supervisors.find(s=>s.id===selectedSup) : null;

  function getProgress(supId){
    const stops=routes[supId]||[];
    if(!stops.length) return {done:0,total:0,pct:0};
    const done=stops.filter(s=>s.status==="done"||s.status==="skipped").length;
    return {done,total:stops.length,pct:Math.round(done/stops.length*100)};
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return(
    <div style={{fontFamily:"'DM Sans','Segoe UI',sans-serif",background:"#0f172a",minHeight:"100vh",color:"#e2e8f0"}}>

      {/* NAV */}
      <div style={{background:"#1e293b",borderBottom:"1px solid #334155",padding:"10px 16px",
        display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {selectedSup&&view==="dashboard"&&
            <button onClick={()=>setSelectedSup(null)} style={{...btn({background:"#334155",color:"#94a3b8",padding:"5px 10px"})}}>←</button>}
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#f8fafc",letterSpacing:-.5}}>📍 KOSHERPTY</div>
            <div style={{fontSize:10,color:"#64748b",textTransform:"capitalize"}}>{todayStr()}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {[{id:"dashboard",label:"📊 Panel"},{id:"manage",label:"⚙️ Gestión"},{id:"users",label:"👥 Usuarios"},{id:"history",label:"📋 Historial"}].map(v=>(
            <button key={v.id} onClick={()=>{setView(v.id);setSelectedSup(null);}}
              style={{...btn({background:view===v.id?"#3b82f6":"#334155",color:view===v.id?"#fff":"#94a3b8"})}}>
              {v.label}{v.id==="users"&&pendingUsers.length>0?` (${pendingUsers.length})`:""}
            </button>
          ))}
          {alerts.length>0&&<button onClick={()=>openModal("alerts")} style={{...btn({background:"#ef4444",color:"#fff"})}}>🔔 {alerts.length}</button>}
          <button onClick={()=>exportCSV(supervisors,routes)} style={{...btn({background:"#0f4c2e",color:"#22c55e"})}}>⬇ CSV</button>
          <button onClick={()=>exportPDF(supervisors,routes)} style={{...btn({background:"#1e1b4b",color:"#818cf8"})}}>🖨 PDF</button>
          <button onClick={()=>signOut(auth)} style={{...btn({background:"#334155",color:"#94a3b8"})}}>Salir</button>
        </div>
      </div>

      {/* ── DASHBOARD LIST ── */}
      {view==="dashboard"&&!selectedSup&&(
        <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
            {[
              {icon:"👥",val:supervisors.length,label:"Supervisores"},
              {icon:"✅",val:Object.values(routes).flat().filter(s=>s.status==="done").length,label:"Completados"},
              {icon:"⚠️",val:Object.values(routes).flat().filter(s=>s.status==="issue").length,label:"Incidencias"},
              {icon:"⏳",val:Object.values(routes).flat().filter(s=>s.status==="in-progress").length,label:"En curso"},
            ].map(c=>(
              <div key={c.label} style={{background:"#1e293b",borderRadius:12,padding:"12px 14px",border:"1px solid #334155"}}>
                <div style={{fontSize:20}}>{c.icon}</div>
                <div style={{fontSize:24,fontWeight:800,color:"#f8fafc",lineHeight:1.1}}>{c.val}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{c.label}</div>
              </div>
            ))}
          </div>
          {supervisors.length===0&&<div style={{textAlign:"center",color:"#64748b",padding:48}}>No hay supervisores. Ve a ⚙️ Gestión.</div>}
          {supervisors.map(s=>{
            const prog=getProgress(s.id);
            const stops=routes[s.id]||[];
            const inProg=stops.find(x=>x.status==="in-progress");
            const hasAlert=alerts.some(a=>a.supId===s.id);
            return(
              <div key={s.id} onClick={()=>setSelectedSup(s.id)}
                style={{background:"#1e293b",borderRadius:14,padding:16,marginBottom:10,
                  border:`1px solid ${hasAlert?"#ef4444":"#334155"}`,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=s.color}
                onMouseLeave={e=>e.currentTarget.style.borderColor=hasAlert?"#ef4444":"#334155"}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                  <div style={{width:42,height:42,borderRadius:11,background:s.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,color:"#fff",flexShrink:0}}>{s.avatar}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:15,color:"#f8fafc"}}>{s.name}</div>
                    <div style={{fontSize:11,color:inProg?"#f59e0b":"#64748b"}}>
                      {hasAlert&&"🔴 ALERTA · "}{inProg?`En: ${inProg.place}`:prog.done===prog.total&&prog.total>0?"✅ Completo":"⏳ Sin actividad"}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:22,fontWeight:800,color:prog.pct===100?"#22c55e":"#f8fafc"}}>{prog.pct}%</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{prog.done}/{prog.total}</div>
                  </div>
                </div>
                <Progress value={prog.pct} color={s.color}/>
                <div style={{display:"flex",gap:3,marginTop:8,flexWrap:"wrap"}}>
                  {stops.map(st=><div key={st.id} title={st.place}
                    style={{height:5,flex:1,minWidth:10,maxWidth:30,borderRadius:99,background:STATUS_CFG[st.status]?.color||"#94a3b8"}}/>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DASHBOARD DETAIL ── */}
      {view==="dashboard"&&selectedSup&&sup&&(()=>{
        const stops=routes[selectedSup]||[];
        const prog=getProgress(selectedSup);
        return(
          <div style={{padding:16,maxWidth:720,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <div style={{width:48,height:48,borderRadius:12,background:sup.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,color:"#fff"}}>{sup.avatar}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:18,fontWeight:800,color:"#f8fafc"}}>{sup.name}</div>
                <div style={{fontSize:12,color:"#64748b"}}>{prog.done}/{prog.total} · {prog.pct}%</div>
              </div>
              <button onClick={()=>openModal("addStop",{supId:selectedSup})}
                style={{...btn({background:"#1d4ed8",color:"#fff"})}}>+ Parada</button>
            </div>
            <Progress value={prog.pct} color={sup.color}/>
            <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
              {stops.map((stop,i)=>{
                const sc=STATUS_CFG[stop.status]||STATUS_CFG.pending;
                const overdue=stop.status==="in-progress"&&stop.checkIn&&minutesAgo(stop.checkIn)>=ALERT_MINUTES;
                return(
                  <div key={stop.id} style={{background:"#1e293b",borderRadius:12,padding:14,
                    border:`1px solid ${overdue?"#ef4444":stop.status!=="pending"?sc.color+"44":"#334155"}`}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                      <div style={{display:"flex",flexDirection:"column",gap:3,paddingTop:2}}>
                        <button onClick={()=>reorderStop(selectedSup,i,-1)} disabled={i===0}
                          style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:11,padding:0}}>▲</button>
                        <button onClick={()=>reorderStop(selectedSup,i,1)} disabled={i===stops.length-1}
                          style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:11,padding:0}}>▼</button>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontWeight:700,color:"#f8fafc",fontSize:14}}>{i+1}. {stop.place}</span>
                          <Badge status={stop.status}/>
                          {overdue&&<span style={{fontSize:11,color:"#ef4444",fontWeight:700}}>⏱ ATRASO</span>}
                        </div>
                        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{stop.address}</div>
                        {(stop.checkIn||stop.checkOut)&&<div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                          {stop.checkIn&&`Entrada: ${stop.checkIn}`}{stop.checkOut&&` · Salida: ${stop.checkOut}`}
                        </div>}
                        {stop.notes&&<div style={{fontSize:12,color:"#fbbf24",background:"#1c1400",borderRadius:6,padding:"4px 8px",marginTop:5}}>📝 {stop.notes}</div>}
                        {stop.photos?.length>0&&<div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                          {stop.photos.map((p,pi)=>(
                            <div key={pi} style={{position:"relative"}}>
                              <img src={p.url} alt={p.name} style={{width:52,height:52,objectFit:"cover",borderRadius:7,border:"1px solid #334155"}}/>
                              <button onClick={()=>removePhoto(selectedSup,stop.id,pi)}
                                style={{position:"absolute",top:-5,right:-5,background:"#ef4444",border:"none",borderRadius:"50%",width:16,height:16,color:"#fff",cursor:"pointer",fontSize:10,padding:0}}>×</button>
                            </div>
                          ))}
                        </div>}
                        <div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}>
                          {stop.status==="pending"&&<button onClick={()=>updateStatus(selectedSup,stop.id,"in-progress")} style={{...btn({background:"#d97706",color:"#fff"})}}>▶ Iniciar</button>}
                          {stop.status==="in-progress"&&<>
                            <button onClick={()=>updateStatus(selectedSup,stop.id,"done")} style={{...btn({background:"#16a34a",color:"#fff"})}}>✓ Completar</button>
                            <button onClick={()=>updateStatus(selectedSup,stop.id,"issue")} style={{...btn({background:"#dc2626",color:"#fff"})}}>⚠ Incidencia</button>
                          </>}
                          {stop.status==="pending"&&<button onClick={()=>updateStatus(selectedSup,stop.id,"skipped")} style={{...btn({background:"#334155",color:"#94a3b8"})}}>— Omitir</button>}
                          {["done","issue","skipped"].includes(stop.status)&&<button onClick={()=>updateStatus(selectedSup,stop.id,"pending")} style={{...btn({background:"#334155",color:"#94a3b8"})}}>↩ Reiniciar</button>}
                          <button onClick={()=>openModal("note",{supId:selectedSup,stopId:stop.id,text:stop.notes})} style={{...btn({background:"#1c1400",color:"#fbbf24"})}}>📝</button>
                          <button onClick={()=>{openModal("photo",{supId:selectedSup,stopId:stop.id});}} style={{...btn({background:"#0c1a2e",color:"#60a5fa"})}}>📷</button>
                          <button onClick={()=>openModal("editStop",{supId:selectedSup,stopId:stop.id,place:stop.place,address:stop.address})} style={{...btn({background:"#1e293b",color:"#94a3b8"})}}>✎</button>
                          <button onClick={()=>deleteStop(selectedSup,stop.id)} style={{...btn({background:"#1e293b",color:"#ef4444"})}}>🗑</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {stops.length===0&&<div style={{textAlign:"center",color:"#64748b",padding:32}}>Sin paradas. Agrega con + Parada.</div>}
            </div>
          </div>
        );
      })()}

      {/* ── GESTIÓN ── */}
      {view==="manage"&&(
        <div style={{padding:16,maxWidth:700,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>⚙️ Gestión</div>
            <button onClick={()=>openModal("addSup")} style={{...btn({background:"#1d4ed8",color:"#fff"})}}>+ Supervisor</button>
          </div>
          {supervisors.map(s=>{
            const stops=routes[s.id]||[];
            const prog=getProgress(s.id);
            return(
              <div key={s.id} style={{background:"#1e293b",borderRadius:14,padding:14,marginBottom:10,border:"1px solid #334155"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:38,height:38,borderRadius:9,background:s.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff"}}>{s.avatar}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:"#f8fafc"}}>{s.name}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{stops.length} paradas · {prog.pct}% · {s.email||"sin email"}</div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button onClick={()=>openModal("editSup",{id:s.id,name:s.name,color:s.color,email:s.email||""})} style={{...btn({background:"#334155",color:"#94a3b8"})}}>✎</button>
                    <button onClick={()=>deleteSupervisor(s.id)} style={{...btn({background:"#2d0707",color:"#ef4444"})}}>🗑</button>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {stops.map((st,i)=>(
                    <div key={st.id} style={{display:"flex",alignItems:"center",gap:7,background:"#0f172a",borderRadius:7,padding:"6px 10px"}}>
                      <span style={{color:STATUS_CFG[st.status]?.color||"#94a3b8",fontSize:12}}>{STATUS_CFG[st.status]?.icon}</span>
                      <span style={{flex:1,fontSize:12,color:"#cbd5e1"}}>{i+1}. {st.place}</span>
                      <span style={{fontSize:10,color:"#475569"}}>{st.address}</span>
                      <button onClick={()=>openModal("editStop",{supId:s.id,stopId:st.id,place:st.place,address:st.address})} style={{...btn({background:"none",color:"#64748b",padding:"2px 6px"})}}>✎</button>
                      <button onClick={()=>deleteStop(s.id,st.id)} style={{...btn({background:"none",color:"#ef4444",padding:"2px 6px"})}}>🗑</button>
                    </div>
                  ))}
                </div>
                <button onClick={()=>openModal("addStop",{supId:s.id})} style={{...btn({background:"#0f172a",color:"#64748b",marginTop:8,width:"100%",textAlign:"center"})}}>+ Agregar parada</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── USUARIOS PENDIENTES ── */}
      {view==="users"&&(
        <div style={{padding:16,maxWidth:700,margin:"0 auto"}}>
          <div style={{fontSize:16,fontWeight:800,color:"#f8fafc",marginBottom:14}}>👥 Usuarios pendientes</div>
          {pendingUsers.length===0
            ?<div style={{color:"#64748b",textAlign:"center",padding:40}}>No hay usuarios pendientes de aprobación.</div>
            :pendingUsers.map(u=>(
              <div key={u.uid} style={{background:"#1e293b",borderRadius:12,padding:14,marginBottom:8,border:"1px solid #334155"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:"#334155",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#f8fafc",fontSize:14}}>
                    {initials(u.name||u.email)}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:"#f8fafc"}}>{u.name}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{u.email}</div>
                  </div>
                </div>
                <div style={{marginTop:10}}>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Asignar como supervisor de:</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {supervisors.map(s=>(
                      <button key={s.id} onClick={()=>approveUser(u.uid,s.id)}
                        style={{...btn({background:s.color+"33",color:s.color,border:`1px solid ${s.color}44`})}}>
                        ✓ {s.name}
                      </button>
                    ))}
                    <button onClick={()=>rejectUser(u.uid)} style={{...btn({background:"#2d0707",color:"#ef4444"})}}>✕ Rechazar</button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── HISTORIAL ── */}
      {view==="history"&&(
        <div style={{padding:16,maxWidth:700,margin:"0 auto"}}>
          <div style={{fontSize:16,fontWeight:800,color:"#f8fafc",marginBottom:12}}>📋 Historial</div>
          {alerts.length>0&&(
            <div style={{background:"#2d0707",border:"1px solid #ef4444",borderRadius:10,padding:12,marginBottom:12}}>
              <div style={{fontWeight:700,color:"#ef4444",marginBottom:6}}>🔔 Alertas por atraso</div>
              {alerts.map((a,i)=><div key={i} style={{fontSize:12,color:"#fca5a5",marginBottom:3}}>{a.supName} — {a.place} lleva +{a.minutes} min</div>)}
            </div>
          )}
          {historyLog.length===0
            ?<div style={{color:"#64748b",textAlign:"center",paddingTop:32}}>Sin actividad aún.</div>
            :<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {historyLog.map((h,i)=>(
                <div key={i} style={{background:"#1e293b",borderRadius:9,padding:"9px 13px",display:"flex",alignItems:"center",gap:10,border:"1px solid #334155"}}>
                  <div style={{fontSize:11,color:"#64748b",minWidth:38}}>{h.time}</div>
                  <div style={{width:6,height:6,borderRadius:"50%",background:h.supColor||"#64748b",flexShrink:0}}/>
                  <div style={{flex:1,fontSize:12}}>
                    <span style={{fontWeight:700,color:"#f8fafc"}}>{h.supervisor}</span>
                    <span style={{color:"#475569"}}> → </span>
                    <span style={{color:"#cbd5e1"}}>{h.place}</span>
                  </div>
                  <span style={{fontSize:11,color:"#94a3b8",background:"#0f172a",borderRadius:5,padding:"2px 7px"}}>{h.action}</span>
                </div>
              ))}
            </div>}

          {historyLog.length>0&&(
            <div style={{marginTop:24}}>
              <div style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Resumen</div>
              {supervisors.map(s=>{
                const prog=getProgress(s.id);
                const stops=routes[s.id]||[];
                return(
                  <div key={s.id} style={{background:"#1e293b",borderRadius:9,padding:"11px 13px",marginBottom:6,border:"1px solid #334155"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <div style={{fontWeight:700,color:"#f8fafc"}}>{s.name}</div>
                      <div style={{fontWeight:800,color:prog.pct===100?"#22c55e":"#f8fafc"}}>{prog.pct}%</div>
                    </div>
                    <div style={{display:"flex",gap:8,fontSize:11,flexWrap:"wrap"}}>
                      {Object.entries(STATUS_CFG).map(([key,cfg])=>{
                        const count=stops.filter(st=>st.status===key).length;
                        if(!count) return null;
                        return <span key={key} style={{color:cfg.color}}>{cfg.icon} {cfg.label}: <strong>{count}</strong></span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ── */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}} onClick={closeModal}>
          <div style={{background:"#1e293b",borderRadius:16,padding:22,width:"100%",maxWidth:400,border:"1px solid #334155",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>

            {modal==="note"&&<>
              <div style={{fontWeight:800,color:"#f8fafc",marginBottom:10}}>📝 Nota</div>
              <textarea value={formData.text||""} onChange={e=>setFormData(p=>({...p,text:e.target.value}))}
                placeholder="Describe lo encontrado..."
                style={{...inputS,minHeight:90,resize:"vertical"}}/>
              <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
                <button onClick={closeModal} style={{...btn({background:"#334155",color:"#94a3b8"})}}>Cancelar</button>
                <button onClick={saveNote} style={{...btn({background:"#3b82f6",color:"#fff"})}}>Guardar</button>
              </div>
            </>}

            {modal==="photo"&&<>
              <div style={{fontWeight:800,color:"#f8fafc",marginBottom:12}}>📷 Adjuntar foto</div>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoUpload} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current.click()} style={{...btn({background:"#1d4ed8",color:"#fff",padding:"12px",fontSize:14,width:"100%",textAlign:"center"})}}>
                📷 Tomar foto / Seleccionar
              </button>
              <button onClick={closeModal} style={{...btn({background:"#334155",color:"#94a3b8",marginTop:10,width:"100%"})}}>Cancelar</button>
            </>}

            {(modal==="addSup"||modal==="editSup")&&<>
              <div style={{fontWeight:800,color:"#f8fafc",marginBottom:12}}>{modal==="addSup"?"➕ Nuevo supervisor":"✎ Editar supervisor"}</div>
              <label style={labelS}>Nombre</label>
              <input value={formData.name||""} onChange={e=>setFormData(p=>({...p,name:e.target.value}))} placeholder="Ej: Ana García" style={inputS}/>
              <label style={labelS}>Email (opcional)</label>
              <input value={formData.email||""} onChange={e=>setFormData(p=>({...p,email:e.target.value}))} placeholder="supervisor@email.com" style={inputS}/>
              <label style={labelS}>Color</label>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
                {COLORS.map(c=><div key={c} onClick={()=>setFormData(p=>({...p,color:c}))}
                  style={{width:26,height:26,borderRadius:"50%",background:c,cursor:"pointer",border:formData.color===c?"3px solid #fff":"3px solid transparent"}}/>)}
              </div>
              <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
                <button onClick={closeModal} style={{...btn({background:"#334155",color:"#94a3b8"})}}>Cancelar</button>
                <button onClick={modal==="addSup"?addSupervisor:editSupervisor} style={{...btn({background:"#3b82f6",color:"#fff"})}}>{modal==="addSup"?"Agregar":"Guardar"}</button>
              </div>
            </>}

            {(modal==="addStop"||modal==="editStop")&&<>
              <div style={{fontWeight:800,color:"#f8fafc",marginBottom:12}}>{modal==="addStop"?"➕ Nueva parada":"✎ Editar parada"}</div>
              <label style={labelS}>Nombre del lugar</label>
              <input value={formData.place||""} onChange={e=>setFormData(p=>({...p,place:e.target.value}))} placeholder="Ej: Almacén Norte" style={inputS}/>
              <label style={labelS}>Dirección</label>
              <input value={formData.address||""} onChange={e=>setFormData(p=>({...p,address:e.target.value}))} placeholder="Ej: Av. Principal 100" style={inputS}/>
              <div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:4}}>
                <button onClick={closeModal} style={{...btn({background:"#334155",color:"#94a3b8"})}}>Cancelar</button>
                <button onClick={modal==="addStop"?addStop:editStop} style={{...btn({background:"#3b82f6",color:"#fff"})}}>{modal==="addStop"?"Agregar":"Guardar"}</button>
              </div>
            </>}

            {modal==="alerts"&&<>
              <div style={{fontWeight:800,color:"#ef4444",marginBottom:10}}>🔔 Alertas activas</div>
              {alerts.length===0?<div style={{color:"#64748b",textAlign:"center",padding:16}}>Sin alertas.</div>
                :alerts.map((a,i)=>(
                  <div key={i} style={{background:"#2d0707",borderRadius:9,padding:"9px 12px",marginBottom:7,border:"1px solid #ef444455"}}>
                    <div style={{fontWeight:700,color:"#f8fafc"}}>{a.supName}</div>
                    <div style={{fontSize:12,color:"#fca5a5"}}>{a.place} — +{a.minutes} min en curso</div>
                  </div>
                ))}
              <button onClick={()=>{setAlerts([]);closeModal();}} style={{...btn({background:"#334155",color:"#94a3b8",marginTop:8,width:"100%"})}}>Limpiar</button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
