import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, getDocs, query, orderBy } from "firebase/firestore";
import { auth, db } from "./firebase";
import { APP_NAME, APP_SUB, ADMIN_EMAIL, C, COLORS, CHECKLIST_ITEMS, STATUS, btn, nowStr, dateStr, todayStr, weekRange, initials, minAgo } from "./constants";

function Badge({ status }) {
  const st = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.color+"18", borderRadius:6, padding:"3px 9px", whiteSpace:"nowrap" }}>{st.label}</span>;
}

function Ring({ pct, color, size=52 }) {
  const r=19, circ=2*Math.PI*r, dash=circ*(pct/100);
  return (
    <svg width={size} height={size} viewBox="0 0 46 46">
      <circle cx="23" cy="23" r={r} fill="none" stroke={C.border} strokeWidth="3.5"/>
      <circle cx="23" cy="23" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 23 23)"
        style={{transition:"stroke-dasharray .5s ease"}}/>
      <text x="23" y="27" textAnchor="middle" fontSize="10" fontWeight="700" fill={C.text} fontFamily="'DM Sans',sans-serif">{pct}%</text>
    </svg>
  );
}

// ── Export helpers ─────────────────────────────────────────────────────────────
function exportCSV(supervisors, routes) {
  const rows = [["Supervisor","Establecimiento","Dirección","Estado","Visita #","Entrada","Salida","Entrada Manual","Checklist OK","Checklist Problemas","Notas","Incidencia","Reporte"]];
  supervisors.forEach(sup => {
    (routes[sup.id]||[]).forEach(stop => {
      const visits = stop.visits || [];
      if (visits.length === 0) {
        rows.push([sup.name, stop.place, stop.address, STATUS[stop.status]?.label||stop.status, "—","—","—","—","—","—","—","—","—"]);
      } else {
        visits.forEach((v, i) => {
          const ok  = (v.checklist||[]).filter(c=>c.result==="ok").map(c=>c.label).join("; ");
          const bad = (v.checklist||[]).filter(c=>c.result==="issue").map(c=>`${c.label}${c.note?": "+c.note:""}`).join("; ");
          rows.push([sup.name, stop.place, stop.address, STATUS[v.status]?.label||v.status, i+1, v.checkIn||"—", v.checkOut||"—", v.checkInManual?"Sí":"No", ok||"—", bad||"—", v.generalNotes||"—", v.incidencia||"—", v.reporte||"—"]);
        });
      }
    });
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  a.download = `KosherShevet_${dateStr().replace(/\//g,"-")}.csv`; a.click();
}

function buildReportText(supervisors, routes) {
  let text = `REPORTE SEMANAL — KOSHER SHEVET AHIM\nSemana: ${weekRange()}\n\n`;
  supervisors.forEach(sup => {
    const stops = routes[sup.id]||[];
    const done = stops.filter(s=>["done","issue","skipped"].includes(s.status)).length;
    text += `SUPERVISOR: ${sup.name}\nCompletadas: ${done}/${stops.length}\n\n`;
    stops.forEach(stop => {
      const visits = stop.visits||[];
      text += `  ESTABLECIMIENTO: ${stop.place} (${stop.address})\n`;
      text += `  Estado: ${STATUS[stop.status]?.label||stop.status}\n`;
      visits.forEach((v,i) => {
        text += `  Visita ${i+1}: Entrada ${v.checkIn||"—"} Salida ${v.checkOut||"—"}${v.checkInManual?" [MANUAL]":""}\n`;
        if (v.checklist) {
          const ok  = v.checklist.filter(c=>c.result==="ok").map(c=>c.label).join(", ");
          const bad = v.checklist.filter(c=>c.result==="issue").map(c=>`${c.label}${c.note?": "+c.note:""}`).join(", ");
          if (ok)  text += `    ✅ Revisado OK: ${ok}\n`;
          if (bad) text += `    ❌ Con problemas: ${bad}\n`;
        }
        if (v.incidencia) text += `    ⚠️ INCIDENCIA: ${v.incidencia}\n`;
        if (v.reporte)    text += `    📋 REPORTE: ${v.reporte}\n`;
        if (v.generalNotes) text += `    📝 Notas: ${v.generalNotes}\n`;
      });
      text += "\n";
    });
    text += "\n";
  });
  return text;
}

async function analyzeWithAI(supervisors, routes, setAiResult, setAiLoading) {
  setAiLoading(true);
  setAiResult(null);
  const reportText = buildReportText(supervisors, routes);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Eres un experto en supervisión de establecimientos kosher. Analiza este reporte semanal de supervisión y proporciona un análisis estructurado en español con: 1) PUNTOS FUERTES, 2) PUNTOS DÉBILES, 3) RECOMENDACIONES DE MEJORA. Sé específico, mencionando establecimientos y supervisores por nombre. Responde en formato limpio y claro.\n\nREPORTE:\n${reportText}`
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.map(i => i.text||"").join("") || "Sin respuesta.";
    setAiResult(text);
  } catch(e) {
    setAiResult("Error al conectar con el análisis AI. Intenta de nuevo.");
  }
  setAiLoading(false);
}

// ── Main Admin Component ───────────────────────────────────────────────────────
export default function Admin({ user }) {
  const [supervisors, setSupervisors] = useState([]);
  const [routes, setRoutes]           = useState({});
  const [pendingUsers, setPendingUsers]= useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [historyLog, setHistoryLog]   = useState([]);
  const [alerts, setAlerts]           = useState([]);
  const [navTab, setNavTab]           = useState("dashboard");
  const [selectedSup, setSelectedSup] = useState(null);
  const [modal, setModal]             = useState(null);
  const [form, setForm]               = useState({});
  const [aiResult, setAiResult]       = useState(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    const u1 = onSnapshot(collection(db,"supervisors"), snap => setSupervisors(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(collection(db,"users"), snap => setPendingUsers(snap.docs.map(d=>d.data()).filter(u=>u.role==="pending")));
    const u3 = onSnapshot(query(collection(db,"history"),orderBy("timestamp","desc")), snap => setHistoryLog(snap.docs.map(d=>({id:d.id,...d.data()})).slice(0,100)));
    const u4 = onSnapshot(query(collection(db,"suggestions"),orderBy("timestamp","desc")), snap => setSuggestions(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  useEffect(() => {
    if (!supervisors.length) return;
    const unsubs = supervisors.map(sup =>
      onSnapshot(query(collection(db,"supervisors",sup.id,"stops"),orderBy("order","asc")), snap =>
        setRoutes(prev => ({ ...prev, [sup.id]: snap.docs.map(d=>({id:d.id,...d.data()})) }))
      )
    );
    return () => unsubs.forEach(u => u());
  }, [supervisors]);

  useEffect(() => {
    const check = () => {
      supervisors.forEach(sup => (routes[sup.id]||[]).forEach(stop => {
        const activeVisit = (stop.visits||[]).find(v=>v.status==="in-progress");
        if (activeVisit?.checkIn && !stop.alertSent && minAgo(activeVisit.checkIn) >= 30) {
          setAlerts(prev => [{supId:sup.id,supName:sup.name,place:stop.place,minutes:minAgo(activeVisit.checkIn)},...prev].slice(0,20));
          updateDoc(doc(db,"supervisors",sup.id,"stops",stop.id),{alertSent:true});
        }
      }));
    };
    check(); const t = setInterval(check, 60000); return () => clearInterval(t);
  }, [routes, supervisors]);

  const getProgress = supId => {
    const stops = routes[supId]||[];
    if (!stops.length) return {done:0,total:0,pct:0};
    const done = stops.filter(s=>["done","issue","skipped"].includes(s.status)).length;
    return {done, total:stops.length, pct:Math.round(done/stops.length*100)};
  };

  // CRUD
  async function addSupervisor() {
    if (!form.name?.trim()) return;
    const ref = doc(collection(db,"supervisors"));
    await setDoc(ref, {name:form.name.trim(),avatar:initials(form.name),color:form.color||COLORS[0],email:form.email||"",createdAt:Date.now()});
    setRoutes(prev=>({...prev,[ref.id]:[]})); closeModal();
  }
  async function editSupervisor() {
    await updateDoc(doc(db,"supervisors",form.id),{name:form.name.trim(),avatar:initials(form.name),color:form.color,email:form.email||""}); closeModal();
  }
  async function deleteSupervisor(id) {
    if (!confirm("¿Eliminar supervisor y todas sus paradas?")) return;
    const stops = await getDocs(collection(db,"supervisors",id,"stops"));
    await Promise.all(stops.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(db,"supervisors",id));
    if (selectedSup===id) { setSelectedSup(null); setNavTab("dashboard"); }
  }
  async function addStop() {
    if (!form.place?.trim()) return;
    const stops = routes[form.supId]||[];
    await addDoc(collection(db,"supervisors",form.supId,"stops"),{place:form.place.trim(),address:(form.address||"").trim(),status:"pending",visits:[],photos:[],alertSent:false,scheduledDay:null,order:stops.length});
    closeModal();
  }
  async function editStop() {
    await updateDoc(doc(db,"supervisors",form.supId,"stops",form.stopId),{place:form.place.trim(),address:(form.address||"").trim()}); closeModal();
  }
  async function deleteStop(supId,stopId) { await deleteDoc(doc(db,"supervisors",supId,"stops",stopId)); }
  async function reorderStop(supId,idx,dir) {
    const arr=[...(routes[supId]||[])]; const to=idx+dir;
    if(to<0||to>=arr.length) return;
    await updateDoc(doc(db,"supervisors",supId,"stops",arr[idx].id),{order:to});
    await updateDoc(doc(db,"supervisors",supId,"stops",arr[to].id),{order:idx});
  }
  async function approveUser(uid,supId) { await updateDoc(doc(db,"users",uid),{role:"supervisor",assignedSupId:supId||""}); }
  async function rejectUser(uid) { await deleteDoc(doc(db,"users",uid)); }
  async function resolveSuggestion(id) { await updateDoc(doc(db,"suggestions",id),{status:"resolved"}); }
  async function resetWeek(supId) {
    const stops = routes[supId]||[];
    await Promise.all(stops.map(s => updateDoc(doc(db,"supervisors",supId,"stops",s.id),{status:"pending",visits:[],photos:[],scheduledDay:null,alertSent:false})));
  }

  function openModal(type,data={}) { setModal(type); setForm(data); }
  function closeModal() { setModal(null); setForm({}); }

  const sup = selectedSup ? supervisors.find(s=>s.id===selectedSup) : null;
  const allStops = Object.values(routes).flat();
  const pendingSuggestions = suggestions.filter(s=>s.status==="pending");

  const LS = {fontSize:12,color:C.muted,marginBottom:5,display:"block",fontWeight:500};
  const IS = {width:"100%",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"'DM Sans',sans-serif",outline:"none",boxSizing:"border-box",marginBottom:12,color:C.text,background:C.surface};

  const NAV = [
    {id:"dashboard", icon:"📊", label:"Panel"},
    {id:"settings",  icon:"⚙️", label:"Settings"},
    {id:"users",     icon:"👥", label:"Usuarios", badge: pendingUsers.length + pendingSuggestions.length},
    {id:"history",   icon:"📋", label:"Historial"},
    {id:"ai",        icon:"🤖", label:"Análisis AI"},
    {id:"exports",   icon:"📤", label:"Exportar"},
  ];

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:C.bg, minHeight:"100vh" }}>

      {/* Header — only title + logout */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, boxShadow:C.shadow }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {selectedSup && navTab==="dashboard" &&
            <button onClick={() => setSelectedSup(null)} style={{ ...btn({ background:C.bg, color:C.muted, padding:"6px 11px", fontSize:13, border:`1px solid ${C.border}`, marginRight:4 }) }}>←</button>}
          <div style={{ width:32, height:32, background:C.primary, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📍</div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.primary, textTransform:"uppercase", letterSpacing:1.2 }}>{APP_NAME}</div>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{APP_SUB}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {alerts.length > 0 && <button onClick={() => openModal("alerts")} style={{ ...btn({ background:C.dangerLight, color:C.danger, padding:"6px 11px", fontSize:12 }) }}>🔔 {alerts.length}</button>}
          <button onClick={() => signOut(auth)} style={{ ...btn({ background:C.bg, color:C.muted, padding:"6px 12px", fontSize:12, border:`1px solid ${C.border}` }) }}>Salir</button>
        </div>
      </div>

      <div style={{ padding:"14px 16px 90px", maxWidth:800, margin:"0 auto" }}>

        {/* ── DASHBOARD LIST ── */}
        {navTab==="dashboard" && !selectedSup && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:14 }}>
              {[
                {icon:"✅", val:allStops.filter(s=>s.status==="done").length,    label:"Completados"},
                {icon:"⚠️", val:allStops.filter(s=>s.status==="issue").length,   label:"Incidencias"},
                {icon:"📋", val:allStops.filter(s=>s.status==="pending").length, label:"Pendientes semana"},
                {icon:"⏳", val:allStops.filter(s=>s.status==="in-progress").length, label:"En curso"},
              ].map(c => (
                <div key={c.label} style={{ background:C.surface, borderRadius:14, padding:"13px 16px", boxShadow:C.shadow }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{c.icon}</div>
                  <div style={{ fontSize:26, fontWeight:800, color:C.text, lineHeight:1 }}>{c.val}</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2, fontWeight:500 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {supervisors.length === 0 && <div style={{ textAlign:"center", color:C.muted, padding:48, fontSize:14 }}>No hay supervisores. Ve a ⚙️ Settings.</div>}

            {supervisors.map(s => {
              const p = getProgress(s.id);
              const stops = routes[s.id]||[];
              const inProg = stops.find(x=>x.status==="in-progress");
              const hasAlert = alerts.some(a=>a.supId===s.id);
              return (
                <div key={s.id} onClick={() => setSelectedSup(s.id)}
                  style={{ background:C.surface, borderRadius:16, padding:16, marginBottom:10, border:`1px solid ${hasAlert?C.danger:C.border}`, cursor:"pointer", boxShadow:C.shadow, transition:"box-shadow .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow=C.shadowMd}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow=C.shadow}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:"#fff", flexShrink:0 }}>{s.avatar}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{s.name}</div>
                      <div style={{ fontSize:12, color:inProg?C.warning:C.muted, marginTop:2, fontWeight:500 }}>
                        {hasAlert?"🔴 Atraso detectado":inProg?`En: ${inProg.place}`:p.done===p.total&&p.total>0?"✅ Semana completa":`${p.done}/${p.total} completadas`}
                      </div>
                    </div>
                    <Ring pct={p.pct} color={s.color}/>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── DASHBOARD DETAIL ── */}
        {navTab==="dashboard" && selectedSup && sup && (() => {
          const stops = routes[selectedSup]||[];
          const p = getProgress(selectedSup);
          const todayStops = stops.filter(s=>["today","in-progress","done","issue"].includes(s.status));
          const pendingStops = stops.filter(s=>s.status==="pending");
          return (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <div style={{ width:46, height:46, borderRadius:12, background:sup.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:"#fff" }}>{sup.avatar}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:17, fontWeight:800, color:C.text }}>{sup.name}</div>
                  <div style={{ fontSize:12, color:C.muted }}>Semana {weekRange()} · {p.done}/{p.total}</div>
                </div>
                <button onClick={() => openModal("addStop",{supId:selectedSup})} style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"8px 13px", fontSize:13 }) }}>+ Parada</button>
                <button onClick={() => { if(confirm("¿Reiniciar semana?")) resetWeek(selectedSup); }} style={{ ...btn({ background:C.bg, color:C.muted, padding:"8px 10px", fontSize:13, border:`1px solid ${C.border}` }) }}>🔄</button>
              </div>

              {todayStops.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Para hoy</div>
                  {todayStops.map(stop => {
                    const visits = stop.visits||[];
                    return visits.map((v,vi) => (
                      <div key={`${stop.id}-${vi}`} style={{ background:C.surface, borderRadius:13, padding:14, marginBottom:7, border:`1px solid ${v.status==="in-progress"?C.warning+"66":C.border}`, boxShadow:C.shadow }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          <div style={{ flex:1 }}>
                            <span style={{ fontWeight:700, color:C.text, fontSize:14 }}>{stop.place}</span>
                            {visits.length>1 && <span style={{ fontSize:11, color:C.primary, fontWeight:600, marginLeft:6 }}>Visita #{vi+1}</span>}
                          </div>
                          <Badge status={v.status||"pending"}/>
                        </div>
                        <div style={{ fontSize:11, color:C.muted, marginBottom:v.checkIn?4:0 }}>{stop.address}</div>
                        {v.checkIn && <div style={{ fontSize:11, color:C.subtle }}>Entrada: {v.checkIn}{v.checkInManual&&<span style={{ color:C.warning }}> ⚠ Manual</span>}{v.checkOut&&` · Salida: ${v.checkOut}`}</div>}
                        {v.checklist && (
                          <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                            <span style={{ fontSize:11, color:C.success, fontWeight:600 }}>✅ {v.checklist.filter(c=>c.result==="ok").length} bien</span>
                            {v.checklist.filter(c=>c.result==="issue").length>0 && <span style={{ fontSize:11, color:C.danger, fontWeight:600 }}>❌ {v.checklist.filter(c=>c.result==="issue").length} problema</span>}
                          </div>
                        )}
                        {v.incidencia && <div style={{ fontSize:11, color:C.danger, background:C.dangerLight, borderRadius:7, padding:"4px 8px", marginTop:5 }}>⚠️ {v.incidencia}</div>}
                        {v.reporte    && <div style={{ fontSize:11, color:C.primary, background:C.primaryLight, borderRadius:7, padding:"4px 8px", marginTop:4 }}>📋 {v.reporte}</div>}
                        {v.generalNotes && <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>📝 {v.generalNotes}</div>}
                        <div style={{ display:"flex", gap:5, marginTop:8 }}>
                          <button onClick={() => openModal("editStop",{supId:selectedSup,stopId:stop.id,place:stop.place,address:stop.address})} style={{ ...btn({ background:C.bg, color:C.muted, padding:"5px 9px", fontSize:12, border:`1px solid ${C.border}` }) }}>✎</button>
                          <button onClick={() => deleteStop(selectedSup,stop.id)} style={{ ...btn({ background:C.bg, color:C.danger, padding:"5px 9px", fontSize:12, border:`1px solid ${C.border}` }) }}>🗑</button>
                        </div>
                      </div>
                    ));
                  })}
                </>
              )}

              {pendingStops.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8, marginTop:14 }}>Pendientes ({pendingStops.length})</div>
                  {pendingStops.map((stop,i) => (
                    <div key={stop.id} style={{ background:C.surface, borderRadius:12, padding:"11px 14px", marginBottom:6, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, boxShadow:C.shadow }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:"#D1D5DB", flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, color:C.text, fontSize:13 }}>{stop.place}</div>
                        <div style={{ fontSize:11, color:C.muted }}>{stop.address}</div>
                      </div>
                      <button onClick={()=>reorderStop(selectedSup,i,-1)} disabled={i===0} style={{ ...btn({ background:"none", color:C.subtle, padding:"4px 7px", fontSize:12 }) }}>▲</button>
                      <button onClick={()=>reorderStop(selectedSup,i,1)} disabled={i===pendingStops.length-1} style={{ ...btn({ background:"none", color:C.subtle, padding:"4px 7px", fontSize:12 }) }}>▼</button>
                      <button onClick={()=>openModal("editStop",{supId:selectedSup,stopId:stop.id,place:stop.place,address:stop.address})} style={{ ...btn({ background:C.bg, color:C.muted, padding:"5px 9px", fontSize:12, border:`1px solid ${C.border}` }) }}>✎</button>
                      <button onClick={()=>deleteStop(selectedSup,stop.id)} style={{ ...btn({ background:C.bg, color:C.danger, padding:"5px 9px", fontSize:12, border:`1px solid ${C.border}` }) }}>🗑</button>
                    </div>
                  ))}
                </>
              )}
            </>
          );
        })()}

        {/* ── SETTINGS ── */}
        {navTab==="settings" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:16, fontWeight:800, color:C.text }}>Supervisores</div>
              <button onClick={() => openModal("addSup")} style={{ ...btn({ background:C.primary, color:"#fff", padding:"9px 16px", fontSize:13 }) }}>+ Agregar</button>
            </div>
            {supervisors.map(s => {
              const stops = routes[s.id]||[]; const p = getProgress(s.id);
              return (
                <div key={s.id} style={{ background:C.surface, borderRadius:16, padding:16, marginBottom:10, boxShadow:C.shadow }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, color:"#fff", fontSize:13 }}>{s.avatar}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, color:C.text }}>{s.name}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{stops.length} paradas · {s.email||"sin email"}</div>
                    </div>
                    <button onClick={() => openModal("editSup",{id:s.id,name:s.name,color:s.color,email:s.email||""})} style={{ ...btn({ background:C.bg, color:C.muted, padding:"7px 12px", fontSize:12, border:`1px solid ${C.border}` }) }}>✎</button>
                    <button onClick={() => deleteSupervisor(s.id)} style={{ ...btn({ background:C.dangerLight, color:C.danger, padding:"7px 12px", fontSize:12 }) }}>🗑</button>
                  </div>
                  {stops.map((st,i) => (
                    <div key={st.id} style={{ display:"flex", alignItems:"center", gap:7, background:C.bg, borderRadius:8, padding:"7px 10px", marginBottom:4 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:STATUS[st.status]?.dot||"#D1D5DB", flexShrink:0 }}/>
                      <span style={{ flex:1, fontSize:12, color:C.text, fontWeight:500 }}>{i+1}. {st.place}</span>
                      <span style={{ fontSize:11, color:C.muted }}>{st.address}</span>
                      <button onClick={()=>reorderStop(s.id,i,-1)} disabled={i===0} style={{ ...btn({ background:"none", color:C.subtle, padding:"2px 5px", fontSize:11 }) }}>▲</button>
                      <button onClick={()=>reorderStop(s.id,i,1)} disabled={i===stops.length-1} style={{ ...btn({ background:"none", color:C.subtle, padding:"2px 5px", fontSize:11 }) }}>▼</button>
                      <button onClick={()=>openModal("editStop",{supId:s.id,stopId:st.id,place:st.place,address:st.address})} style={{ ...btn({ background:"none", color:C.muted, padding:"2px 6px", fontSize:12 }) }}>✎</button>
                      <button onClick={()=>deleteStop(s.id,st.id)} style={{ ...btn({ background:"none", color:C.danger, padding:"2px 6px", fontSize:12 }) }}>🗑</button>
                    </div>
                  ))}
                  <button onClick={() => openModal("addStop",{supId:s.id})} style={{ ...btn({ background:C.bg, color:C.muted, marginTop:8, width:"100%", padding:"8px", textAlign:"center", fontSize:12, border:`1px dashed ${C.border}` }) }}>+ Agregar parada</button>
                </div>
              );
            })}
          </>
        )}

        {/* ── USUARIOS + SUGERENCIAS ── */}
        {navTab==="users" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>Usuarios pendientes</div>
            {pendingUsers.length===0 ? <div style={{ textAlign:"center", color:C.muted, padding:32, fontSize:14 }}>No hay usuarios pendientes.</div>
              : pendingUsers.map(u => (
                <div key={u.uid} style={{ background:C.surface, borderRadius:14, padding:16, marginBottom:8, boxShadow:C.shadow }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <div style={{ width:38, height:38, borderRadius:"50%", background:C.border, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:C.muted, fontSize:14 }}>{initials(u.name||u.email)}</div>
                    <div><div style={{ fontWeight:700, color:C.text }}>{u.name}</div><div style={{ fontSize:11, color:C.muted }}>{u.email}</div></div>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:8, fontWeight:500 }}>Asignar como supervisor de:</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {supervisors.map(s => <button key={s.id} onClick={() => approveUser(u.uid,s.id)} style={{ ...btn({ background:s.color+"18", color:s.color, padding:"7px 14px", fontSize:13 }) }}>{s.name}</button>)}
                    <button onClick={() => rejectUser(u.uid)} style={{ ...btn({ background:C.dangerLight, color:C.danger, padding:"7px 14px", fontSize:13 }) }}>✕ Rechazar</button>
                  </div>
                </div>
              ))}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <>
                <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:12, marginTop:24 }}>💬 Sugerencias</div>
                {suggestions.map(s => (
                  <div key={s.id} style={{ background:C.surface, borderRadius:14, padding:14, marginBottom:8, boxShadow:C.shadow, opacity:s.status==="resolved"?.6:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:s.type==="Error"?C.danger:s.type==="Mejora"?C.primary:C.muted, background:s.type==="Error"?C.dangerLight:s.type==="Mejora"?C.primaryLight:C.bg, borderRadius:6, padding:"2px 8px" }}>{s.type==="Error"?"🐛":s.type==="Mejora"?"💡":"💬"} {s.type}</span>
                      <span style={{ fontSize:11, color:C.muted }}>{s.name}</span>
                      {s.status==="resolved" && <span style={{ fontSize:11, color:C.success, fontWeight:600 }}>✓ Resuelto</span>}
                    </div>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.5, marginBottom:s.status!=="resolved"?10:0 }}>{s.text}</div>
                    {s.status !== "resolved" && <button onClick={() => resolveSuggestion(s.id)} style={{ ...btn({ background:C.successLight, color:C.success, padding:"6px 14px", fontSize:12 }) }}>Marcar resuelto</button>}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ── HISTORIAL ── */}
        {navTab==="history" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>Historial</div>
            {historyLog.length===0 ? <div style={{ textAlign:"center", color:C.muted, padding:40 }}>Sin actividad.</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {historyLog.map((h,i) => (
                  <div key={i} style={{ background:C.surface, borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:10, boxShadow:C.shadow }}>
                    <div style={{ fontSize:11, color:C.subtle, minWidth:38 }}>{h.time}</div>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:h.supColor||C.primary, flexShrink:0 }}/>
                    <div style={{ flex:1, fontSize:13 }}><span style={{ fontWeight:700, color:C.text }}>{h.supervisor}</span><span style={{ color:C.muted }}> → </span><span style={{ color:C.text }}>{h.place}</span></div>
                    <span style={{ fontSize:11, color:C.muted, background:C.bg, borderRadius:6, padding:"2px 8px" }}>{h.action}</span>
                  </div>
                ))}
              </div>}
            {/* Resumen */}
            {historyLog.length>0 && (
              <div style={{ marginTop:24 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Resumen semanal</div>
                {supervisors.map(s => {
                  const p = getProgress(s.id); const stops = routes[s.id]||[];
                  return (
                    <div key={s.id} style={{ background:C.surface, borderRadius:12, padding:"12px 14px", marginBottom:6, boxShadow:C.shadow }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <div style={{ fontWeight:700, color:C.text }}>{s.name}</div>
                        <div style={{ fontWeight:800, color:p.pct===100?C.success:C.text }}>{p.pct}%</div>
                      </div>
                      <div style={{ display:"flex", gap:8, fontSize:11, flexWrap:"wrap" }}>
                        {Object.entries(STATUS).map(([key,cfg]) => { const count=stops.filter(st=>st.status===key).length; return count?<span key={key} style={{ color:cfg.color, fontWeight:500 }}>{cfg.label}: <strong>{count}</strong></span>:null; })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── AI ANALYSIS ── */}
        {navTab==="ai" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>🤖 Análisis AI</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:18, lineHeight:1.5 }}>Genera un análisis inteligente de la semana: puntos fuertes, débiles y recomendaciones por establecimiento.</div>
            <button onClick={() => analyzeWithAI(supervisors, routes, setAiResult, setAiLoading)}
              disabled={aiLoading}
              style={{ ...btn({ width:"100%", padding:"14px", fontSize:15, background:aiLoading?"#D1D5DB":C.primary, color:"#fff", marginBottom:16 }) }}>
              {aiLoading ? "Analizando... ⏳" : "✨ Generar análisis semanal"}
            </button>
            {aiResult && (
              <div style={{ background:C.surface, borderRadius:16, padding:20, boxShadow:C.shadow }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.primary, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Resultado del análisis</div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.8, whiteSpace:"pre-wrap" }}>{aiResult}</div>
              </div>
            )}
          </>
        )}

        {/* ── EXPORTAR ── */}
        {navTab==="exports" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>Exportar datos</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <button onClick={() => exportCSV(supervisors, routes)}
                style={{ ...btn({ background:C.surface, color:C.text, padding:"16px 20px", fontSize:14, boxShadow:C.shadow, textAlign:"left", display:"flex", alignItems:"center", gap:12 }) }}>
                <span style={{ fontSize:24 }}>📊</span>
                <div><div style={{ fontWeight:700 }}>Exportar CSV</div><div style={{ fontSize:12, color:C.muted, fontWeight:400, marginTop:2 }}>Compatible con Excel — incluye checklist completo</div></div>
              </button>
              <button onClick={() => { const text = buildReportText(supervisors, routes); const blob = new Blob([text],{type:"text/plain"}); const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`KosherShevet_${dateStr().replace(/\//g,"-")}.txt`;a.click(); }}
                style={{ ...btn({ background:C.surface, color:C.text, padding:"16px 20px", fontSize:14, boxShadow:C.shadow, textAlign:"left", display:"flex", alignItems:"center", gap:12 }) }}>
                <span style={{ fontSize:24 }}>📄</span>
                <div><div style={{ fontWeight:700 }}>Exportar reporte TXT</div><div style={{ fontSize:12, color:C.muted, fontWeight:400, marginTop:2 }}>Reporte legible para imprimir o compartir</div></div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:C.surface, borderTop:`1px solid ${C.border}`, display:"flex", zIndex:50, boxShadow:"0 -2px 12px rgba(0,0,0,.06)" }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => { setNavTab(n.id); setSelectedSup(null); }}
            style={{ ...btn({ flex:1, padding:"9px 2px", background:"none", color:navTab===n.id?C.primary:C.muted, fontSize:9, display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRadius:0, borderTop:navTab===n.id?`2px solid ${C.primary}`:"2px solid transparent", fontWeight:navTab===n.id?700:500, position:"relative" }) }}>
            <span style={{ fontSize:18 }}>{n.icon}</span>
            {n.label}
            {n.badge>0 && <span style={{ position:"absolute", top:4, right:"50%", transform:"translateX(12px)", background:C.danger, color:"#fff", borderRadius:"50%", width:14, height:14, fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{n.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── MODALS ── */}
      {modal && modal !== "alerts" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:200, padding:0 }} onClick={closeModal}>
          <div style={{ background:C.surface, borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>

            {(modal==="addSup"||modal==="editSup") && <>
              <div style={{ fontWeight:800, color:C.text, fontSize:16, marginBottom:14 }}>{modal==="addSup"?"Nuevo supervisor":"Editar supervisor"}</div>
              <label style={LS}>Nombre</label>
              <input value={form.name||""} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej: Ana García" style={IS}/>
              <label style={LS}>Email (opcional)</label>
              <input value={form.email||""} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="supervisor@email.com" style={IS}/>
              <label style={LS}>Color</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                {COLORS.map(c => <div key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer", border:form.color===c?`3px solid ${C.text}`:`3px solid transparent` }}/>)}
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={closeModal} style={{ ...btn({ background:C.bg, color:C.muted, padding:"10px 18px", border:`1px solid ${C.border}` }) }}>Cancelar</button>
                <button onClick={modal==="addSup"?addSupervisor:editSupervisor} style={{ ...btn({ background:C.primary, color:"#fff", padding:"10px 18px" }) }}>{modal==="addSup"?"Agregar":"Guardar"}</button>
              </div>
            </>}

            {(modal==="addStop"||modal==="editStop") && <>
              <div style={{ fontWeight:800, color:C.text, fontSize:16, marginBottom:14 }}>{modal==="addStop"?"Nueva parada":"Editar parada"}</div>
              <label style={LS}>Nombre del lugar</label>
              <input value={form.place||""} onChange={e=>setForm(p=>({...p,place:e.target.value}))} placeholder="Ej: Restaurante La Mesa" style={IS}/>
              <label style={LS}>Dirección</label>
              <input value={form.address||""} onChange={e=>setForm(p=>({...p,address:e.target.value}))} placeholder="Ej: Av. Principal 100" style={IS}/>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={closeModal} style={{ ...btn({ background:C.bg, color:C.muted, padding:"10px 18px", border:`1px solid ${C.border}` }) }}>Cancelar</button>
                <button onClick={modal==="addStop"?addStop:editStop} style={{ ...btn({ background:C.primary, color:"#fff", padding:"10px 18px" }) }}>{modal==="addStop"?"Agregar":"Guardar"}</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {modal === "alerts" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:200, padding:0 }} onClick={closeModal}>
          <div style={{ background:C.surface, borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:800, color:C.danger, fontSize:16, marginBottom:12 }}>🔔 Alertas activas</div>
            {alerts.map((a,i) => (
              <div key={i} style={{ background:C.dangerLight, borderRadius:10, padding:"10px 14px", marginBottom:8 }}>
                <div style={{ fontWeight:700, color:C.text }}>{a.supName}</div>
                <div style={{ fontSize:12, color:C.danger, marginTop:2 }}>{a.place} — lleva +{a.minutes} minutos en curso</div>
              </div>
            ))}
            <button onClick={() => { setAlerts([]); closeModal(); }} style={{ ...btn({ background:C.bg, color:C.muted, padding:"11px", width:"100%", marginTop:8, border:`1px solid ${C.border}` }) }}>Limpiar alertas</button>
          </div>
        </div>
      )}
    </div>
  );
}
