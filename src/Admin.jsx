import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import {
  collection, doc, onSnapshot, setDoc, updateDoc,
  deleteDoc, addDoc, getDocs, query, orderBy, writeBatch
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  APP_NAME, APP_SUB, C, COLORS, CHECKLIST_ITEMS,
  STATUS, btn, nowStr, dateStr, todayFull, weekRange,
  initials, minAgo
} from "./constants";
import { LogoIcon, LogoText } from "./Logo";

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const st = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.color+"18", borderRadius:6, padding:"3px 9px", whiteSpace:"nowrap" }}>{st.label}</span>;
}

function Ring({ pct, color, size=50 }) {
  const r=18, circ=2*Math.PI*r, dash=circ*(pct/100);
  return (
    <svg width={size} height={size} viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#E4E9F0" strokeWidth="3.5"/>
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 22 22)"
        style={{ transition:"stroke-dasharray .5s" }}/>
      <text x="22" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0F172A" fontFamily="'DM Sans',sans-serif">{pct}%</text>
    </svg>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV(supervisors, routes) {
  const rows = [["Supervisor","Establecimiento","Dirección","Estado","Visita","Fecha","Entrada","EntradaEditada","Salida","SalidaEditada","CheckOK","CheckProblemas","Notas"]];
  supervisors.forEach(sup => {
    (routes[sup.id]||[]).forEach(stop => {
      const visits = stop.visits||[];
      if (!visits.length) {
        rows.push([sup.name, stop.place, stop.address, STATUS[stop.status]?.label||stop.status, ...Array(10).fill("—")]);
      } else {
        visits.forEach((v, i) => {
          const ok  = (v.checklist||[]).filter(c=>c.result==="ok").map(c=>c.label).join("; ");
          const bad = (v.checklist||[]).filter(c=>c.result==="issue").map(c=>`${c.label}${c.note?": "+c.note:""}`).join("; ");
          rows.push([sup.name, stop.place, stop.address, STATUS[v.status]?.label||v.status, i+1, v.date||"—", v.checkIn||"—", v.checkInEdited?"⚠️Sí":"No", v.checkOut||"—", v.checkOutEdited?"⚠️Sí":"No", ok||"—", bad||"—", v.generalNotes||"—"]);
        });
      }
    });
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  a.download = `KosherShevet_${dateStr().replace(/\//g,"-")}.csv`;
  a.click();
}

function buildTXT(supervisors, routes) {
  let t = `REPORTE SEMANAL — KOSHER SHEVET AHIM\nSemana: ${weekRange()}\n\n`;
  supervisors.forEach(sup => {
    const stops = routes[sup.id]||[];
    const done  = stops.filter(s=>["done","closed"].includes(s.status)).length;
    t += `SUPERVISOR: ${sup.name}\nCompletadas: ${done}/${stops.length}\n\n`;
    stops.forEach(stop => {
      t += `  ESTABLECIMIENTO: ${stop.place} (${stop.address})\n`;
      t += `  Estado: ${STATUS[stop.status]?.label||stop.status}\n`;
      (stop.visits||[]).forEach((v,i) => {
        t += `  Visita ${i+1} [${v.date||"—"}]: Entrada ${v.checkIn||"—"}${v.checkInEdited?" ⚠️EDITADO":""} Salida ${v.checkOut||"—"}${v.checkOutEdited?" ⚠️EDITADO":""}\n`;
        if (v.checklist) {
          const ok  = v.checklist.filter(c=>c.result==="ok").map(c=>c.label).join(", ");
          const bad = v.checklist.filter(c=>c.result==="issue").map(c=>`${c.label}${c.note?": "+c.note:""}`).join(", ");
          if (ok)  t += `    ✅ OK: ${ok}\n`;
          if (bad) t += `    ❌ Problemas: ${bad}\n`;
        }
        if (v.generalNotes) t += `    📝 Notas: ${v.generalNotes}\n`;
        if (v.status==="closed") t += `    🔒 ESTABLECIMIENTO CERRADO\n`;
      });
      t += "\n";
    });
    t += "\n";
  });
  return t;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Admin({ user }) {
  const [supervisors,   setSupervisors]   = useState([]);
  const [routes,        setRoutes]        = useState({});
  const [pendingUsers,  setPendingUsers]  = useState([]);
  const [suggestions,   setSuggestions]  = useState([]);
  const [historyLog,    setHistoryLog]    = useState([]);
  const [alerts,        setAlerts]        = useState([]);
  const [tab,           setTab]           = useState("dashboard");
  const [selectedSup,   setSelectedSup]  = useState(null);
  const [modal,         setModal]         = useState(null);
  const [form,          setForm]          = useState({});

  // ── Firestore listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const u1 = onSnapshot(collection(db,"supervisors"), snap => setSupervisors(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(collection(db,"users"),       snap => setPendingUsers(snap.docs.map(d=>d.data()).filter(u=>u.role==="pending")));
    const u3 = onSnapshot(query(collection(db,"history"),orderBy("timestamp","desc")), snap => setHistoryLog(snap.docs.map(d=>({id:d.id,...d.data()})).slice(0,100)));
    const u4 = onSnapshot(query(collection(db,"suggestions"),orderBy("createdAt","desc")), snap => setSuggestions(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  useEffect(() => {
    if (!supervisors.length) return;
    const unsubs = supervisors.map(sup =>
      onSnapshot(query(collection(db,"supervisors",sup.id,"stops"),orderBy("order","asc")), snap =>
        setRoutes(prev => ({ ...prev, [sup.id]: snap.docs.map(d=>({id:d.id,...d.data()})) }))
      )
    );
    return () => unsubs.forEach(u=>u());
  }, [supervisors]);

  // Alert checker every minute
  useEffect(() => {
    const check = () => {
      supervisors.forEach(sup => {
        (routes[sup.id]||[]).forEach(stop => {
          const active = (stop.visits||[]).find(v=>v.status==="in-progress");
          if (active?.checkIn && !stop.alertSent && minAgo(active.checkIn) >= 30) {
            setAlerts(prev => [{supId:sup.id, supName:sup.name, place:stop.place, minutes:minAgo(active.checkIn)}, ...prev].slice(0,20));
            updateDoc(doc(db,"supervisors",sup.id,"stops",stop.id), { alertSent:true });
          }
        });
      });
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [routes, supervisors]);

  // ── Progress ──────────────────────────────────────────────────────────────
  const getProgress = supId => {
    const stops = routes[supId]||[];
    if (!stops.length) return { done:0, total:0, pct:0 };
    const done = stops.filter(s=>["done","closed"].includes(s.status)).length;
    return { done, total:stops.length, pct:Math.round(done/stops.length*100) };
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function addSupervisor() {
    if (!form.name?.trim()) return;
    const ref = doc(collection(db,"supervisors"));
    await setDoc(ref, { name:form.name.trim(), avatar:initials(form.name), color:form.color||COLORS[0], email:form.email||"", createdAt:Date.now() });
    setRoutes(prev => ({ ...prev, [ref.id]:[] }));
    closeModal();
  }

  async function editSupervisor() {
    await updateDoc(doc(db,"supervisors",form.id), { name:form.name.trim(), avatar:initials(form.name), color:form.color, email:form.email||"" });
    closeModal();
  }

  async function deleteSupervisor(id) {
    if (!confirm("¿Eliminar supervisor y todas sus paradas?")) return;
    const stops = await getDocs(collection(db,"supervisors",id,"stops"));
    await Promise.all(stops.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(db,"supervisors",id));
    if (selectedSup===id) { setSelectedSup(null); setTab("dashboard"); }
  }

  async function addStop() {
    if (!form.place?.trim()) return;
    const stops = routes[form.supId]||[];
    await addDoc(collection(db,"supervisors",form.supId,"stops"), {
      place:    form.place.trim(),
      address:  (form.address||"").trim(),
      status:   "pending",
      visits:   [],
      alertSent:false,
      scheduledDay:null,
      order:    stops.length,
    });
    closeModal();
  }

  async function editStop() {
    await updateDoc(doc(db,"supervisors",form.supId,"stops",form.stopId), {
      place:   form.place.trim(),
      address: (form.address||"").trim(),
    });
    closeModal();
  }

  async function deleteStop(supId, stopId) {
    await deleteDoc(doc(db,"supervisors",supId,"stops",stopId));
  }

  async function reorderStop(supId, idx, dir) {
    const arr = [...(routes[supId]||[])];
    const to  = idx + dir;
    if (to < 0 || to >= arr.length) return;
    await updateDoc(doc(db,"supervisors",supId,"stops",arr[idx].id), { order:to });
    await updateDoc(doc(db,"supervisors",supId,"stops",arr[to].id),  { order:idx });
  }

  async function resetWeek(supId) {
    const stops = routes[supId]||[];
    const batch = writeBatch(db);
    stops.forEach(s => batch.update(doc(db,"supervisors",supId,"stops",s.id), { status:"pending", visits:[], scheduledDay:null, alertSent:false }));
    await batch.commit();
  }

  async function approveUser(uid, supId) {
    await updateDoc(doc(db,"users",uid), { role:"supervisor", assignedSupId:supId||"" });
  }

  async function approveAsAdmin(uid) {
    await updateDoc(doc(db,"users",uid), { role:"admin", assignedSupId:"" });
  }

  async function rejectUser(uid) {
    await deleteDoc(doc(db,"users",uid));
  }

  async function resolveSuggestion(id) {
    await updateDoc(doc(db,"suggestions",id), { status:"resolved" });
  }

  function openModal(type, data={}) { setModal(type); setForm(data); }
  function closeModal()             { setModal(null);  setForm({}); }

  // ── Derived ───────────────────────────────────────────────────────────────
  const sup        = selectedSup ? supervisors.find(s=>s.id===selectedSup) : null;
  const allStops   = Object.values(routes).flat();
  const pendingSug = suggestions.filter(s=>s.status==="pending");

  const LS = { fontSize:12, color:C.muted, marginBottom:5, display:"block", fontWeight:500 };
  const IS = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 12px", fontSize:14, outline:"none", boxSizing:"border-box", marginBottom:12, color:C.text, background:"#fff" };

  const TABS = [
    { id:"dashboard", icon:"📊", label:"Panel" },
    { id:"settings",  icon:"⚙️", label:"Settings" },
    { id:"users",     icon:"👥", label:"Usuarios", badge: pendingUsers.length + pendingSug.length },
    { id:"history",   icon:"📋", label:"Historial" },
    { id:"exports",   icon:"📤", label:"Exportar" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F4F6F9", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E4E9F0", padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 3px rgba(0,0,0,.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {selectedSup && tab==="dashboard" && (
            <button onClick={()=>setSelectedSup(null)} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"6px 10px", fontSize:13, border:"1px solid #E4E9F0", marginRight:4 }) }}>←</button>
          )}
          <LogoIcon size={30}/><LogoText/>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {alerts.length>0 && (
            <button onClick={()=>openModal("alerts")} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"6px 11px", fontSize:12 }) }}>🔔 {alerts.length}</button>
          )}
          <button onClick={()=>signOut(auth)} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"6px 12px", fontSize:12, border:"1px solid #E4E9F0" }) }}>Salir</button>
        </div>
      </div>

      <div style={{ padding:"14px 16px 90px", maxWidth:800, margin:"0 auto" }}>

        {/* ── DASHBOARD LIST ── */}
        {tab==="dashboard" && !selectedSup && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:14 }}>
              {[
                { icon:"✅", val:allStops.filter(s=>s.status==="done").length,       label:"Completados" },
                { icon:"🔒", val:allStops.filter(s=>s.status==="closed").length,     label:"Cerrados" },
                { icon:"📋", val:allStops.filter(s=>s.status==="pending").length,    label:"Pendientes semana" },
                { icon:"⏳", val:allStops.filter(s=>s.status==="in-progress").length,label:"En curso" },
              ].map(c => (
                <div key={c.label} style={{ background:"#fff", borderRadius:14, padding:"13px 16px", boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{c.icon}</div>
                  <div style={{ fontSize:26, fontWeight:800, color:C.text, lineHeight:1 }}>{c.val}</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2, fontWeight:500 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {supervisors.length===0 && <div style={{ textAlign:"center", color:C.muted, padding:48 }}>No hay supervisores. Ve a ⚙️ Settings.</div>}

            {supervisors.map(s => {
              const p       = getProgress(s.id);
              const stops   = routes[s.id]||[];
              const inProg  = stops.find(x=>x.status==="in-progress");
              const hasAlert= alerts.some(a=>a.supId===s.id);
              return (
                <div key={s.id} onClick={()=>setSelectedSup(s.id)}
                  style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:10, border:`1px solid ${hasAlert?"#DC2626":"#E4E9F0"}`, cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,.06)", transition:"box-shadow .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.08)"}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.06)"}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:"#fff", flexShrink:0 }}>{s.avatar}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{s.name}</div>
                      <div style={{ fontSize:12, color:inProg?C.warning:C.muted, fontWeight:500, marginTop:2 }}>
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
        {tab==="dashboard" && selectedSup && sup && (() => {
          const stops       = routes[selectedSup]||[];
          const p           = getProgress(selectedSup);
          const todayStops  = stops.filter(s=>["today","in-progress","done","closed"].includes(s.status));
          const pendStops   = stops.filter(s=>s.status==="pending");
          return (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <div style={{ width:46, height:46, borderRadius:12, background:sup.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:"#fff" }}>{sup.avatar}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:17, fontWeight:800, color:C.text }}>{sup.name}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{weekRange()} · {p.done}/{p.total}</div>
                </div>
                <button onClick={()=>openModal("addStop",{supId:selectedSup})} style={{ ...btn({ background:"#EFF6FF", color:C.primary, padding:"8px 12px", fontSize:13 }) }}>+ Parada</button>
                <button onClick={()=>{ if(confirm("¿Reiniciar semana? Se borran todos los check-ins.")) resetWeek(selectedSup); }} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"8px 10px", fontSize:13, border:"1px solid #E4E9F0" }) }}>🔄</button>
              </div>

              {todayStops.map(stop => {
                const visits = stop.visits||[];
                return visits.map((v,vi) => (
                  <div key={`${stop.id}-${vi}`} style={{ background:"#fff", borderRadius:13, padding:14, marginBottom:7, border:`1px solid ${v.status==="in-progress"?"#FDE68A":v.status==="closed"?"#FCA5A5":v.status==="done"?"#6EE7B7":"#E4E9F0"}`, boxShadow:"0 1px 3px rgba(0,0,0,.05)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                      <div style={{ flex:1 }}>
                        <span style={{ fontWeight:700, color:C.text, fontSize:14 }}>{stop.place}</span>
                        {visits.length>1&&<span style={{ fontSize:11, color:C.primary, fontWeight:700, marginLeft:6 }}>Visita #{vi+1}</span>}
                      </div>
                      <Badge status={v.status||"pending"}/>
                    </div>
                    <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>{stop.address}</div>
                    {(v.checkIn||v.checkOut)&&<div style={{ fontSize:11, color:C.subtle, marginBottom:4 }}>
                      {v.checkIn&&<span>Entrada: {v.checkIn}{v.checkInEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>} </span>}
                      {v.checkOut&&<span>Salida: {v.checkOut}{v.checkOutEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>}</span>}
                    </div>}
                    {v.checklist&&<div style={{ display:"flex", gap:6, marginBottom:4, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, color:"#059669", fontWeight:600, background:"#ECFDF5", borderRadius:6, padding:"2px 8px" }}>✅ {v.checklist.filter(c=>c.result==="ok").length} OK</span>
                      {v.checklist.filter(c=>c.result==="issue").length>0&&<span style={{ fontSize:11, color:"#DC2626", fontWeight:600, background:"#FEF2F2", borderRadius:6, padding:"2px 8px" }}>❌ {v.checklist.filter(c=>c.result==="issue").length} problema</span>}
                    </div>}
                    {v.generalNotes&&<div style={{ fontSize:11, color:C.muted, marginTop:3 }}>📝 {v.generalNotes}</div>}
                    <div style={{ display:"flex", gap:5, marginTop:8 }}>
                      <button onClick={()=>openModal("editStop",{supId:selectedSup,stopId:stop.id,place:stop.place,address:stop.address})} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"5px 9px", fontSize:12, border:"1px solid #E4E9F0" }) }}>✎</button>
                      <button onClick={()=>deleteStop(selectedSup,stop.id)} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"5px 9px", fontSize:12 }) }}>🗑</button>
                    </div>
                  </div>
                ));
              })}

              {pendStops.length>0&&(
                <>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8, marginTop:14 }}>Pendientes ({pendStops.length})</div>
                  {pendStops.map((stop,i) => (
                    <div key={stop.id} style={{ background:"#fff", borderRadius:12, padding:"10px 14px", marginBottom:6, border:"1px solid #E4E9F0", display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 2px rgba(0,0,0,.04)" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, color:C.text, fontSize:13 }}>{stop.place}</div>
                        <div style={{ fontSize:11, color:C.muted }}>{stop.address}</div>
                      </div>
                      <button onClick={()=>reorderStop(selectedSup,i,-1)} disabled={i===0} style={{ ...btn({ background:"none", color:i===0?"#E4E9F0":C.muted, padding:"3px 7px", fontSize:13 }) }}>▲</button>
                      <button onClick={()=>reorderStop(selectedSup,i,1)} disabled={i===pendStops.length-1} style={{ ...btn({ background:"none", color:i===pendStops.length-1?"#E4E9F0":C.muted, padding:"3px 7px", fontSize:13 }) }}>▼</button>
                      <button onClick={()=>openModal("editStop",{supId:selectedSup,stopId:stop.id,place:stop.place,address:stop.address})} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"5px 9px", fontSize:12, border:"1px solid #E4E9F0" }) }}>✎</button>
                      <button onClick={()=>deleteStop(selectedSup,stop.id)} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"5px 9px", fontSize:12 }) }}>🗑</button>
                    </div>
                  ))}
                </>
              )}
            </>
          );
        })()}

        {/* ── SETTINGS ── */}
        {tab==="settings" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:16, fontWeight:800, color:C.text }}>Supervisores</div>
              <button onClick={()=>openModal("addSup")} style={{ ...btn({ background:C.primary, color:"#fff", padding:"9px 16px", fontSize:13 }) }}>+ Agregar</button>
            </div>
            {supervisors.map(s => {
              const stops = routes[s.id]||[];
              const p = getProgress(s.id);
              return (
                <div key={s.id} style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:10, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, color:"#fff", fontSize:13 }}>{s.avatar}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, color:C.text }}>{s.name}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{stops.length} paradas · {s.email||"sin email"}</div>
                    </div>
                    <button onClick={()=>openModal("editSup",{id:s.id,name:s.name,color:s.color,email:s.email||""})} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"7px 12px", fontSize:12, border:"1px solid #E4E9F0" }) }}>✎</button>
                    <button onClick={()=>deleteSupervisor(s.id)} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"7px 12px", fontSize:12 }) }}>🗑</button>
                  </div>
                  {stops.map((st,i) => (
                    <div key={st.id} style={{ display:"flex", alignItems:"center", gap:7, background:"#F4F6F9", borderRadius:8, padding:"6px 10px", marginBottom:3 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:STATUS[st.status]?.color||"#D1D5DB", flexShrink:0 }}/>
                      <span style={{ flex:1, fontSize:12, color:C.text, fontWeight:500 }}>{i+1}. {st.place}</span>
                      <span style={{ fontSize:11, color:C.muted }}>{st.address}</span>
                      <button onClick={()=>reorderStop(s.id,i,-1)} disabled={i===0} style={{ ...btn({ background:"none", color:i===0?"#E4E9F0":C.muted, padding:"1px 5px", fontSize:12 }) }}>▲</button>
                      <button onClick={()=>reorderStop(s.id,i,1)} disabled={i===stops.length-1} style={{ ...btn({ background:"none", color:i===stops.length-1?"#E4E9F0":C.muted, padding:"1px 5px", fontSize:12 }) }}>▼</button>
                      <button onClick={()=>openModal("editStop",{supId:s.id,stopId:st.id,place:st.place,address:st.address})} style={{ ...btn({ background:"none", color:C.muted, padding:"2px 6px", fontSize:12 }) }}>✎</button>
                      <button onClick={()=>deleteStop(s.id,st.id)} style={{ ...btn({ background:"none", color:"#DC2626", padding:"2px 6px", fontSize:12 }) }}>🗑</button>
                    </div>
                  ))}
                  <button onClick={()=>openModal("addStop",{supId:s.id})} style={{ ...btn({ background:"#F4F6F9", color:C.muted, marginTop:8, width:"100%", padding:"7px", textAlign:"center", fontSize:12, border:"1px dashed #E4E9F0" }) }}>+ Agregar parada</button>
                </div>
              );
            })}
          </>
        )}

        {/* ── USUARIOS ── */}
        {tab==="users" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>Usuarios pendientes</div>
            {pendingUsers.length===0
              ? <div style={{ textAlign:"center", color:C.muted, padding:32, fontSize:14 }}>No hay usuarios pendientes.</div>
              : pendingUsers.map(u => (
                <div key={u.uid} style={{ background:"#fff", borderRadius:14, padding:16, marginBottom:8, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <div style={{ width:40, height:40, borderRadius:"50%", background:"#E4E9F0", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:C.muted, fontSize:14 }}>{initials(u.name||u.email)}</div>
                    <div>
                      <div style={{ fontWeight:700, color:C.text }}>{u.name}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{u.email}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:8, fontWeight:600 }}>Asignar como supervisor de:</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                    {supervisors.map(s => (
                      <button key={s.id} onClick={()=>approveUser(u.uid,s.id)}
                        style={{ ...btn({ background:s.color+"18", color:s.color, padding:"7px 14px", fontSize:13 }) }}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                  <div style={{ borderTop:"1px solid #F1F5F9", paddingTop:10, display:"flex", gap:6 }}>
                    <button onClick={()=>approveAsAdmin(u.uid)} style={{ ...btn({ background:"#EFF6FF", color:C.primary, padding:"7px 14px", fontSize:13, fontWeight:700 }) }}>👑 Aprobar como Admin</button>
                    <button onClick={()=>rejectUser(u.uid)} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"7px 14px", fontSize:13 }) }}>✕ Rechazar</button>
                  </div>
                </div>
              ))}

            {suggestions.length > 0 && (
              <>
                <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:12, marginTop:24 }}>💬 Sugerencias</div>
                {suggestions.map(s => (
                  <div key={s.id} style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:8, boxShadow:"0 1px 3px rgba(0,0,0,.06)", opacity:s.status==="resolved"?.6:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:s.type==="Error"?"#DC2626":s.type==="Mejora"?C.primary:C.muted, background:s.type==="Error"?"#FEF2F2":s.type==="Mejora"?"#EFF6FF":"#F4F6F9", borderRadius:6, padding:"2px 8px" }}>
                        {s.type==="Error"?"🐛":s.type==="Mejora"?"💡":"💬"} {s.type}
                      </span>
                      <span style={{ fontSize:11, color:C.muted }}>{s.name}</span>
                      {s.status==="resolved"&&<span style={{ fontSize:11, color:"#059669", fontWeight:600 }}>✓ Resuelto</span>}
                    </div>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.5, marginBottom:s.status!=="resolved"?10:0 }}>{s.text}</div>
                    {s.status!=="resolved"&&<button onClick={()=>resolveSuggestion(s.id)} style={{ ...btn({ background:"#ECFDF5", color:"#059669", padding:"6px 14px", fontSize:12 }) }}>Marcar resuelto</button>}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ── HISTORIAL ── */}
        {tab==="history" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>Historial</div>
            {historyLog.length===0
              ? <div style={{ textAlign:"center", color:C.muted, padding:40 }}>Sin actividad.</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {historyLog.map((h,i) => (
                  <div key={i} style={{ background:"#fff", borderRadius:10, padding:"9px 13px", display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 2px rgba(0,0,0,.04)" }}>
                    <div style={{ fontSize:11, color:C.subtle, minWidth:36 }}>{h.time}</div>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:h.supColor||C.primary, flexShrink:0 }}/>
                    <div style={{ flex:1, fontSize:13 }}><span style={{ fontWeight:700, color:C.text }}>{h.supervisor}</span><span style={{ color:C.muted }}> → </span><span>{h.place}</span></div>
                    <span style={{ fontSize:11, color:C.muted, background:"#F4F6F9", borderRadius:6, padding:"2px 7px" }}>{h.action}</span>
                  </div>
                ))}
              </div>}
            {historyLog.length>0&&(
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Resumen semanal</div>
                {supervisors.map(s => {
                  const p=getProgress(s.id); const stops=routes[s.id]||[];
                  return (
                    <div key={s.id} style={{ background:"#fff", borderRadius:12, padding:"12px 14px", marginBottom:6, boxShadow:"0 1px 2px rgba(0,0,0,.04)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <div style={{ fontWeight:700, color:C.text }}>{s.name}</div>
                        <div style={{ fontWeight:800, color:p.pct===100?"#059669":C.text }}>{p.pct}%</div>
                      </div>
                      <div style={{ display:"flex", gap:8, fontSize:11, flexWrap:"wrap" }}>
                        {Object.entries(STATUS).map(([key,cfg])=>{ const count=stops.filter(st=>st.status===key).length; return count?<span key={key} style={{ color:cfg.color, fontWeight:500 }}>{cfg.label}: <strong>{count}</strong></span>:null; })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── EXPORTAR ── */}
        {tab==="exports" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>Exportar datos</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <button onClick={()=>exportCSV(supervisors,routes)}
                style={{ ...btn({ background:"#fff", color:C.text, padding:"16px 18px", fontSize:14, boxShadow:"0 1px 3px rgba(0,0,0,.06)", textAlign:"left", display:"flex", alignItems:"center", gap:12, width:"100%" }) }}>
                <span style={{ fontSize:24 }}>📊</span>
                <div><div style={{ fontWeight:700 }}>Exportar CSV</div><div style={{ fontSize:12, color:C.muted, fontWeight:400, marginTop:2 }}>Compatible con Excel — incluye checklist completo</div></div>
              </button>
              <button onClick={()=>{ const t=buildTXT(supervisors,routes); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([t],{type:"text/plain"})); a.download=`KosherShevet_${dateStr().replace(/\//g,"-")}.txt`; a.click(); }}
                style={{ ...btn({ background:"#fff", color:C.text, padding:"16px 18px", fontSize:14, boxShadow:"0 1px 3px rgba(0,0,0,.06)", textAlign:"left", display:"flex", alignItems:"center", gap:12, width:"100%" }) }}>
                <span style={{ fontSize:24 }}>📄</span>
                <div><div style={{ fontWeight:700 }}>Exportar TXT</div><div style={{ fontSize:12, color:C.muted, fontWeight:400, marginTop:2 }}>Reporte legible para compartir o analizar</div></div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #E4E9F0", display:"flex", zIndex:50, boxShadow:"0 -2px 12px rgba(0,0,0,.06)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>{ setTab(t.id); setSelectedSup(null); }}
            style={{ ...btn({ flex:1, padding:"9px 2px", background:"none", color:tab===t.id?C.primary:C.muted, fontSize:9, display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRadius:0, borderTop:tab===t.id?`2px solid ${C.primary}`:"2px solid transparent", fontWeight:tab===t.id?700:500, position:"relative" }) }}>
            <span style={{ fontSize:17 }}>{t.icon}</span>
            {t.label}
            {t.badge>0&&<span style={{ position:"absolute", top:4, right:"50%", transform:"translateX(12px)", background:"#DC2626", color:"#fff", borderRadius:"50%", width:14, height:14, fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── MODALS ── */}
      {modal && modal!=="alerts" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:200 }} onClick={closeModal}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>

            {(modal==="addSup"||modal==="editSup") && <>
              <div style={{ fontWeight:800, color:C.text, fontSize:16, marginBottom:14 }}>{modal==="addSup"?"Nuevo supervisor":"Editar supervisor"}</div>
              <label style={LS}>Nombre</label>
              <input value={form.name||""} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej: Ana García" style={IS}/>
              <label style={LS}>Email (opcional)</label>
              <input value={form.email||""} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="supervisor@email.com" style={IS}/>
              <label style={LS}>Color</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                {COLORS.map(c=>(
                  <div key={c} onClick={()=>setForm(p=>({...p,color:c}))}
                    style={{ width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer", border:form.color===c?"3px solid #0F172A":"3px solid transparent" }}/>
                ))}
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={closeModal} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"10px 18px", border:"1px solid #E4E9F0" }) }}>Cancelar</button>
                <button onClick={modal==="addSup"?addSupervisor:editSupervisor} style={{ ...btn({ background:C.primary, color:"#fff", padding:"10px 18px" }) }}>{modal==="addSup"?"Agregar":"Guardar"}</button>
              </div>
            </>}

            {(modal==="addStop"||modal==="editStop") && <>
              <div style={{ fontWeight:800, color:C.text, fontSize:16, marginBottom:14 }}>{modal==="addStop"?"Nueva parada":"Editar parada"}</div>
              <label style={LS}>Nombre del lugar</label>
              <input value={form.place||""} onChange={e=>setForm(p=>({...p,place:e.target.value}))} placeholder="Ej: Restaurante Kosher" style={IS}/>
              <label style={LS}>Dirección</label>
              <input value={form.address||""} onChange={e=>setForm(p=>({...p,address:e.target.value}))} placeholder="Ej: Av. Principal 100" style={IS}/>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={closeModal} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"10px 18px", border:"1px solid #E4E9F0" }) }}>Cancelar</button>
                <button onClick={modal==="addStop"?addStop:editStop} style={{ ...btn({ background:C.primary, color:"#fff", padding:"10px 18px" }) }}>{modal==="addStop"?"Agregar":"Guardar"}</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {modal==="alerts" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:200 }} onClick={closeModal}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:800, color:"#DC2626", fontSize:16, marginBottom:12 }}>🔔 Alertas activas</div>
            {alerts.map((a,i)=>(
              <div key={i} style={{ background:"#FEF2F2", borderRadius:10, padding:"10px 14px", marginBottom:8 }}>
                <div style={{ fontWeight:700, color:C.text }}>{a.supName}</div>
                <div style={{ fontSize:12, color:"#DC2626", marginTop:2 }}>{a.place} — lleva +{a.minutes} min en curso</div>
              </div>
            ))}
            <button onClick={()=>{ setAlerts([]); closeModal(); }} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"11px", width:"100%", marginTop:8, border:"1px solid #E4E9F0" }) }}>Limpiar alertas</button>
          </div>
        </div>
      )}
    </div>
  );
}
