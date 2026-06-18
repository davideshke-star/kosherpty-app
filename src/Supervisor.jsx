import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import {
  doc, getDoc, collection, onSnapshot,
  updateDoc, addDoc, query, orderBy, writeBatch
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { C, STATUS, btn, nowStr, todayName, todayISO } from "./constants";
import { LogoIcon, LogoText } from "./Logo";
import { subscribeGlobalChecklist, resolveChecklist } from "./checklistStore";
import ChecklistModal from "./ChecklistModal";
import SortableList from "./SortableList";

// ── Shared bits ─────────────────────────────────────────────────────────────
function Badge({ status }) {
  const st = STATUS[status] || STATUS.pending;
  return (
    <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.color+"18", borderRadius:6, padding:"3px 9px", whiteSpace:"nowrap" }}>
      {st.label}
    </span>
  );
}

function Ring({ pct, color, size=44 }) {
  const r=17, circ=2*Math.PI*r, dash=circ*(pct/100);
  return (
    <svg width={size} height={size} viewBox="0 0 42 42">
      <circle cx="21" cy="21" r={r} fill="none" stroke="#E4E9F0" strokeWidth="3"/>
      <circle cx="21" cy="21" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 21 21)"
        style={{ transition:"stroke-dasharray .5s" }}/>
      <text x="21" y="25" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0F172A" fontFamily="'DM Sans',sans-serif">{pct}%</text>
    </svg>
  );
}

// Read-only card used in the Historial tab
function HistoryVisitCard({ stop, visit, visitNum, totalVisits, onAddVisitToday }) {
  const hasIssues = (visit.checklist||[]).filter(c => c.result==="issue");
  return (
    <div style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:8, border:`1.5px solid ${visit.status==="done"?"#6EE7B7":"#FCA5A5"}` }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, color:C.text, fontSize:14 }}>{stop.place}</div>
          <div style={{ fontSize:11, color:C.muted }}>{stop.address}</div>
        </div>
        {totalVisits > 1 && <span style={{ fontSize:10, color:C.primary, fontWeight:700, background:C.primaryLight, borderRadius:6, padding:"2px 8px" }}>Visita #{visitNum}</span>}
        <Badge status={visit.status}/>
      </div>
      {(visit.checkIn||visit.checkOut) && (
        <div style={{ fontSize:11, color:C.subtle, marginBottom:6 }}>
          {visit.checkIn && <span>Entrada: <strong>{visit.checkIn}</strong>{visit.checkInEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>} </span>}
          {visit.checkOut && <span>Salida: <strong>{visit.checkOut}</strong>{visit.checkOutEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>}</span>}
        </div>
      )}
      {visit.checklist && (
        <div style={{ display:"flex", gap:6, marginBottom:hasIssues.length?6:0, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:"#059669", fontWeight:600, background:"#ECFDF5", borderRadius:6, padding:"2px 8px" }}>✅ {visit.checklist.filter(c=>c.result==="ok").length} OK</span>
          {hasIssues.length > 0 && <span style={{ fontSize:11, color:"#DC2626", fontWeight:600, background:"#FEF2F2", borderRadius:6, padding:"2px 8px" }}>❌ {hasIssues.length} problema</span>}
        </div>
      )}
      {hasIssues.map(c => (
        <div key={c.id} style={{ fontSize:11, color:"#DC2626", background:"#FEF9F9", borderRadius:7, padding:"3px 8px", marginTop:3 }}>❌ {c.label}{c.note?`: ${c.note}`:""}</div>
      ))}
      {visit.generalNotes && <div style={{ fontSize:12, color:C.muted, background:"#F8FAFC", borderRadius:8, padding:"5px 9px", marginTop:6 }}>📝 {visit.generalNotes}</div>}
      {visit.status==="closed" && <div style={{ fontSize:11, color:"#DC2626", fontWeight:600, marginTop:6 }}>🔒 Establecimiento cerrado en esta visita</div>}
    </div>
  );
}

export default function Supervisor({ user }) {
  const [supData, setSupData]   = useState(null);
  const [stops,   setStops]     = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab,     setTab]       = useState("route");
  const [clModal, setClModal]   = useState(null);
  const [confirm, setConfirm]   = useState(null);
  const [sugForm, setSugForm]   = useState({});

  const TODAY     = todayName();
  const TODAY_ISO = todayISO();

  useEffect(() => {
    const unsub = subscribeGlobalChecklist(items => setChecklistItems(items));
    return () => unsub();
  }, []);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const uDoc = await getDoc(doc(db,"users",user.uid));
      if (!uDoc.exists()) { setLoading(false); return; }
      const supId = uDoc.data().assignedSupId;
      if (!supId)  { setLoading(false); return; }
      const sDoc = await getDoc(doc(db,"supervisors",supId));
      if (sDoc.exists()) setSupData({ id:supId, ...sDoc.data() });
      unsub = onSnapshot(
        query(collection(db,"supervisors",supId,"stops"), orderBy("order","asc")),
        snap => {
          const stopsList = snap.docs.map(d=>({id:d.id,...d.data()}));
          setStops(stopsList);
          setLoading(false);
          // Migration safety net — see matching comment in Admin.jsx
          stopsList.forEach(stop => {
            if (stop.status === "closed") {
              updateDoc(doc(db,"supervisors",supId,"stops",stop.id), { status:"pending" });
            }
          });
        }
      );
    })();
    return () => unsub();
  }, [user.uid]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const upStop = (id, data) => updateDoc(doc(db,"supervisors",supData.id,"stops",id), data);
  const log    = (place, action) => addDoc(collection(db,"history"), {
    time:nowStr(), timestamp:Date.now(),
    supervisor:supData?.name||"", supColor:supData?.color||C.primary,
    place, action
  });

  // Adds a fresh, blank visit and marks the stop as "today" — used both for
  // brand-new stops and for re-attempting one that was previously closed.
  async function markToday(stopId) {
    const stop = stops.find(s=>s.id===stopId);
    const visits = stop.visits || [];
    await upStop(stopId, {
      status:"today",
      visits:[...visits, { idx:visits.length, status:"today", date:TODAY_ISO, checkIn:null, checkOut:null, checklist:null, generalNotes:"", checkInEdited:false, checkOutEdited:false }]
    });
  }

  async function startVisit(stopId, vIdx) {
    const t = nowStr();
    const stop = stops.find(s=>s.id===stopId);
    const visits = [...(stop.visits||[])];
    visits[vIdx] = { ...visits[vIdx], status:"in-progress", checkIn:t };
    await upStop(stopId, { status:"in-progress", visits });
  }

  // Marking closed reverts the STOP to pending immediately — it is never
  // counted as completed, and reappears under "Pendientes" for a retry.
  async function markClosed(stopId, vIdx) {
    const stop = stops.find(s=>s.id===stopId);
    const visits = [...(stop.visits||[])];
    visits[vIdx] = { ...visits[vIdx], status:"closed", checkOut:nowStr() };
    await upStop(stopId, { status:"pending", visits });
    await log(stop.place, "Cerrado");
    setConfirm(null);
  }

  async function completeVisit(stopId, vIdx, data) {
    const stop = stops.find(s=>s.id===stopId);
    const visits = [...(stop.visits||[])];
    visits[vIdx] = {
      ...visits[vIdx],
      status:"done",
      checkIn:   visits[vIdx].checkIn, // never overwrite — set at Iniciar
      checkOut:  data.checkOut,
      checklist: data.checklist,
      generalNotes: data.generalNotes,
      date:      TODAY_ISO,
      checkInEdited:false, checkOutEdited:false,
    };
    await upStop(stopId, { status:"done", visits });
    await log(stop.place, data.checklist.some(c=>c.result==="issue") ? "Completado con observaciones" : "Completado");
    setClModal(null);
  }

  async function editVisit(stopId, vIdx, data) {
    const stop = stops.find(s=>s.id===stopId);
    const visits = [...(stop.visits||[])];
    visits[vIdx] = {
      ...visits[vIdx],
      status:"done",
      checkIn:  data.checkIn,
      checkOut: data.checkOut,
      checklist:data.checklist,
      generalNotes:data.generalNotes,
      checkInEdited: data.checkInEdited,
      checkOutEdited:data.checkOutEdited,
      edited:true,
    };
    await upStop(stopId, { status:"done", visits });
    await log(stop.place, "Visita editada");
    setClModal(null);
  }

  async function addNextVisit(stopId) {
    const stop = stops.find(s=>s.id===stopId);
    const visits = stop.visits||[];
    await upStop(stopId, {
      status:"today",
      visits:[...visits, { idx:visits.length, status:"today", date:TODAY_ISO, checkIn:null, checkOut:null, checklist:null, generalNotes:"", checkInEdited:false, checkOutEdited:false }]
    });
  }

  async function handleReorder(ordered) {
    const batch = writeBatch(db);
    ordered.forEach((s,i) => batch.update(doc(db,"supervisors",supData.id,"stops",s.id),{order:i}));
    await batch.commit();
  }

  async function sendSuggestion() {
    if (!sugForm.text?.trim()||!sugForm.type) return;
    await addDoc(collection(db,"suggestions"),{
      uid:user.uid, name:supData?.name||"",
      type:sugForm.type, text:sugForm.text.trim(),
      status:"pending", createdAt:Date.now(), timestamp:new Date().toISOString()
    });
    setSugForm({}); setTab("route");
    alert("¡Sugerencia enviada!");
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  // A visit is "active today" if it's unfinished (regardless of how stale its
  // date field is — this is what keeps a forgotten visit from a past day from
  // ever getting stuck), OR it's done and was completed today.
  function isActiveTodayVisit(v) {
    if (v.status === "today" || v.status === "in-progress") return true;
    if (v.status === "done"  && v.date === TODAY_ISO) return true;
    return false;
  }

  const todayStops   = stops.filter(s => (s.visits||[]).some(isActiveTodayVisit));
  const pendingStops = stops.filter(s => s.status === "pending");

  // Flatten stop+visit pairs that belong in "Mi Ruta" today, then sort so
  // completed ones bubble to the top and unfinished ones sink to the bottom.
  const todayCards = [];
  todayStops.forEach(stop => {
    (stop.visits||[]).forEach((visit, vIdx) => {
      if (isActiveTodayVisit(visit)) todayCards.push({ stop, visit, vIdx, totalVisits:(stop.visits||[]).length });
    });
  });
  todayCards.sort((a,b) => (a.visit.status==="done"?0:1) - (b.visit.status==="done"?0:1));

  // History: any visit (done or closed) dated strictly before today.
  const historyStops = stops.filter(s =>
    (s.visits||[]).some(v => v.date && v.date < TODAY_ISO && ["done","closed"].includes(v.status))
  );

  const doneTotal  = stops.filter(s => s.status === "done").length;
  const pct        = stops.length ? Math.round(doneTotal/stops.length*100) : 0;
  const color      = supData?.color || C.primary;
  const todayDone  = todayCards.filter(c => c.visit.status==="done").length;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:32,height:32,border:"3px solid #E4E9F0",borderTop:`3px solid ${C.primary}`,borderRadius:"50%",animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!supData) return (
    <div style={{ minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24 }}>
      <div style={{ fontSize:17,fontWeight:700,color:C.text,marginBottom:8 }}>Sin ruta asignada</div>
      <div style={{ fontSize:13,color:C.muted,textAlign:"center",marginBottom:20 }}>El administrador aún no te ha asignado una ruta.</div>
      <button onClick={()=>signOut(auth)} style={{ ...btn({background:C.primary,color:"#fff",padding:"11px 24px",fontSize:14}) }}>Cerrar sesión</button>
    </div>
  );

  const TABS = [
    { id:"route",   icon:"🗺",  label:"Mi Ruta" },
    { id:"history", icon:"📅",  label:"Historial", badge: historyStops.length },
    { id:"suggest", icon:"💬",  label:"Sugerencias" },
  ];

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F4F6F9", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E4E9F0", padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 3px rgba(0,0,0,.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <LogoIcon size={32}/><LogoText/>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Ring pct={pct} color={color}/>
          <button onClick={()=>signOut(auth)} style={{ ...btn({background:"#F4F6F9",color:C.muted,padding:"6px 12px",fontSize:12,border:"1px solid #E4E9F0"}) }}>Salir</button>
        </div>
      </div>

      <div style={{ padding:"14px 16px 88px", maxWidth:580, margin:"0 auto" }}>

        {/* ── ROUTE TAB ── */}
        {tab==="route" && (
          <>
            <div style={{ background:color, borderRadius:14, padding:"12px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 4px 16px ${color}44` }}>
              <div>
                <div style={{ fontSize:10,color:"rgba(255,255,255,.75)",fontWeight:700,textTransform:"uppercase",letterSpacing:.8 }}>{supData.name} — {TODAY}</div>
                <div style={{ fontSize:14,fontWeight:700,color:"#fff",marginTop:2 }}>{todayDone} de {todayCards.length} completadas hoy</div>
              </div>
              <div style={{ fontSize:24,fontWeight:800,color:"rgba(255,255,255,.9)" }}>
                {todayCards.length?Math.round(todayDone/todayCards.length*100):0}%
              </div>
            </div>

            {todayCards.length > 0 && (
              <>
                <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>Para hoy</div>
                {todayCards.map(({ stop, visit, vIdx, totalVisits }) => {
                  const isDone   = visit.status==="done";
                  const isInProg = visit.status==="in-progress";
                  const isToday  = visit.status==="today";
                  const isLast   = vIdx === totalVisits-1;
                  const items    = resolveChecklist(stop, checklistItems);

                  return (
                    <div key={`${stop.id}-${vIdx}`} style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:10, border:`1.5px solid ${isInProg?"#FDE68A":isDone?"#6EE7B7":"#E4E9F0"}`, boxShadow:isInProg?"0 0 0 3px #FFFBEB":"0 1px 3px rgba(0,0,0,.05)" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700,color:C.text,fontSize:15 }}>{stop.place}</div>
                          <div style={{ fontSize:11,color:C.muted,marginTop:2 }}>{stop.address}</div>
                        </div>
                        {totalVisits>1&&<span style={{ fontSize:10,color:C.primary,fontWeight:700,background:C.primaryLight,borderRadius:6,padding:"2px 8px",whiteSpace:"nowrap",marginTop:2 }}>Visita #{vIdx+1}</span>}
                        <Badge status={visit.status}/>
                      </div>

                      {(visit.checkIn||visit.checkOut)&&(
                        <div style={{ fontSize:11,color:C.subtle,marginBottom:7 }}>
                          {visit.checkIn&&<span>Entrada: <strong>{visit.checkIn}</strong>{visit.checkInEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>} </span>}
                          {visit.checkOut&&<span>Salida: <strong>{visit.checkOut}</strong>{visit.checkOutEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>}</span>}
                        </div>
                      )}

                      {visit.checklist&&(
                        <div style={{ display:"flex",gap:6,marginBottom:7,flexWrap:"wrap" }}>
                          <span style={{ fontSize:11,color:"#059669",fontWeight:600,background:"#ECFDF5",borderRadius:6,padding:"2px 8px" }}>✅ {visit.checklist.filter(c=>c.result==="ok").length} OK</span>
                          {visit.checklist.filter(c=>c.result==="issue").length>0&&<span style={{ fontSize:11,color:"#DC2626",fontWeight:600,background:"#FEF2F2",borderRadius:6,padding:"2px 8px" }}>❌ {visit.checklist.filter(c=>c.result==="issue").length} problema</span>}
                        </div>
                      )}

                      {visit.generalNotes&&<div style={{ fontSize:12,color:C.muted,background:"#F8FAFC",borderRadius:8,padding:"5px 9px",marginBottom:7 }}>📝 {visit.generalNotes}</div>}

                      <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:8 }}>
                        {isToday&&(
                          <button onClick={()=>startVisit(stop.id,vIdx)} style={{ ...btn({background:C.primary,color:"#fff",padding:"9px 20px",fontSize:14,boxShadow:`0 2px 8px ${C.primary}44`}) }}>▶ Iniciar</button>
                        )}
                        {isInProg&&<>
                          <button onClick={()=>setConfirm({stopId:stop.id,visitIdx:vIdx})} style={{ ...btn({background:"#FEF2F2",color:"#DC2626",padding:"9px 14px",fontSize:13,border:"1px solid #FCA5A5"}) }}>🔒 Cerrado</button>
                          <button onClick={()=>setClModal({stopId:stop.id,visitIdx:vIdx,mode:"new",items})} style={{ ...btn({background:C.primaryLight,color:C.primary,padding:"9px 14px",fontSize:13}) }}>📋 Checklist</button>
                        </>}
                        {isDone&&<>
                          <button onClick={()=>setClModal({stopId:stop.id,visitIdx:vIdx,mode:"edit",items})} style={{ ...btn({background:"#F4F6F9",color:C.muted,padding:"8px 14px",fontSize:13,border:"1px solid #E4E9F0"}) }}>✏️ Editar{totalVisits>1?` #${vIdx+1}`:""}</button>
                          {isLast&&<button onClick={()=>addNextVisit(stop.id)} style={{ ...btn({background:"#ECFDF5",color:"#059669",padding:"8px 14px",fontSize:13}) }}>+ {totalVisits===1?"2ª visita":totalVisits===2?"3ª visita":`Visita #${totalVisits+1}`}</button>}
                        </>}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {pendingStops.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10 }}>
                  Pendientes esta semana ({pendingStops.length}) · <span style={{ fontWeight:400,color:C.subtle }}>mantén ⠿ para reordenar</span>
                </div>
                <SortableList
                  items={pendingStops}
                  keyExtractor={s => s.id}
                  onOrderChange={handleReorder}
                  renderItem={stop => (
                    <button onClick={()=>markToday(stop.id)}
                      style={{ background:C.primaryLight,color:C.primary,border:"none",borderRadius:10,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer",flexShrink:0 }}>
                      + Hoy
                    </button>
                  )}
                />
              </div>
            )}

            {pendingStops.length===0 && todayCards.every(c=>c.visit.status==="done") && stops.length>0 && (
              <div style={{ background:"#ECFDF5",border:"1px solid #A7F3D0",borderRadius:14,padding:28,textAlign:"center",marginTop:10 }}>
                <div style={{ fontSize:32,marginBottom:8 }}>✅</div>
                <div style={{ fontWeight:800,color:"#059669",fontSize:17 }}>¡Semana completada!</div>
              </div>
            )}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab==="history" && (
          <>
            <div style={{ fontSize:16,fontWeight:800,color:C.text,marginBottom:4 }}>Historial de visitas</div>
            <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.5 }}>Visitas de días anteriores — solo lectura.</div>
            {historyStops.length===0
              ? <div style={{ textAlign:"center",color:C.muted,padding:40,fontSize:14 }}>No hay visitas de días anteriores aún.</div>
              : historyStops.map(stop => {
                  const pastVisits = (stop.visits||[]).filter(v=>v.date&&v.date<TODAY_ISO&&["done","closed"].includes(v.status));
                  const hasActiveOrToday = (stop.visits||[]).some(isActiveTodayVisit);
                  return (
                    <div key={stop.id} style={{ marginBottom:20 }}>
                      <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:6,paddingLeft:2 }}>
                        {stop.place} <span style={{ fontSize:11,color:C.muted,fontWeight:400 }}>{stop.address}</span>
                      </div>
                      {pastVisits.map((v,i) => (
                        <HistoryVisitCard key={i} stop={stop} visit={v} visitNum={i+1} totalVisits={pastVisits.length} onAddVisitToday={markToday}/>
                      ))}
                      {!hasActiveOrToday && (
                        <button onClick={()=>{ markToday(stop.id); setTab("route"); }}
                          style={{ ...btn({background:"#ECFDF5",color:"#059669",padding:"8px 16px",fontSize:13,marginTop:4}) }}>
                          + Visitar hoy
                        </button>
                      )}
                      {hasActiveOrToday && (
                        <div style={{ fontSize:11,color:C.primary,fontWeight:600,marginTop:4,paddingLeft:2 }}>✓ Ya tiene actividad hoy — revisa "Mi Ruta"</div>
                      )}
                    </div>
                  );
                })}
          </>
        )}

        {/* ── SUGGEST TAB ── */}
        {tab==="suggest" && (
          <div>
            <div style={{ fontSize:16,fontWeight:800,color:C.text,marginBottom:14 }}>Sugerencias</div>
            <div style={{ background:"#fff",borderRadius:16,padding:20,boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize:12,fontWeight:600,color:C.muted,marginBottom:8 }}>Tipo</div>
              <div style={{ display:"flex",gap:7,marginBottom:14 }}>
                {["Mejora","Error","Otro"].map(t=>(
                  <button key={t} onClick={()=>setSugForm(p=>({...p,type:t}))}
                    style={{ ...btn({flex:1,padding:"8px 4px",fontSize:13,background:sugForm.type===t?C.primary:"#F4F6F9",color:sugForm.type===t?"#fff":C.muted,border:`1.5px solid ${sugForm.type===t?C.primary:"#E4E9F0"}`}) }}>
                    {t==="Mejora"?"💡":t==="Error"?"🐛":"💬"} {t}
                  </button>
                ))}
              </div>
              <textarea value={sugForm.text||""} onChange={e=>setSugForm(p=>({...p,text:e.target.value}))}
                placeholder="Describe tu sugerencia..."
                style={{ width:"100%",border:"1.5px solid #E4E9F0",borderRadius:12,padding:"10px 12px",fontSize:13,outline:"none",resize:"none",minHeight:100,color:C.text,boxSizing:"border-box",marginBottom:14 }}/>
              <button onClick={sendSuggestion} disabled={!sugForm.text?.trim()||!sugForm.type}
                style={{ ...btn({width:"100%",padding:"12px",fontSize:14,background:sugForm.text?.trim()&&sugForm.type?C.primary:"#E5E7EB",color:"#fff"}) }}>
                Enviar sugerencia
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #E4E9F0",display:"flex",zIndex:50,boxShadow:"0 -2px 12px rgba(0,0,0,.06)" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ ...btn({flex:1,padding:"10px 4px",background:"none",color:tab===t.id?C.primary:C.muted,fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:3,borderRadius:0,borderTop:tab===t.id?`2px solid ${C.primary}`:"2px solid transparent",fontWeight:tab===t.id?700:500,position:"relative"}) }}>
            <span style={{ fontSize:20 }}>{t.icon}</span>
            {t.label}
            {t.badge>0&&<span style={{ position:"absolute",top:4,right:"50%",transform:"translateX(12px)",background:C.danger,color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Checklist modal */}
      {clModal&&(()=>{
        const stop  = stops.find(s=>s.id===clModal.stopId);
        const visit = (stop?.visits||[])[clModal.visitIdx];
        const isEdit = clModal.mode==="edit";
        return (
          <ChecklistModal
            items={clModal.items}
            checkInTime={!isEdit?visit?.checkIn:null}
            existingData={isEdit?visit:null}
            isEditing={isEdit}
            onSave={data=>isEdit?editVisit(clModal.stopId,clModal.visitIdx,data):completeVisit(clModal.stopId,clModal.visitIdx,data)}
            onCancel={()=>setClModal(null)}
          />
        );
      })()}

      {/* Closed confirm */}
      {confirm&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300,padding:16 }}
          onClick={()=>setConfirm(null)}>
          <div style={{ background:"#fff",borderRadius:"20px 20px 16px 16px",padding:24,width:"100%",maxWidth:460,marginBottom:8 }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:800,color:"#DC2626",fontSize:16,marginBottom:6 }}>🔒 Marcar como cerrado</div>
            <div style={{ fontSize:13,color:C.muted,marginBottom:8 }}>¿Confirmas que el establecimiento estaba cerrado?</div>
            <div style={{ fontSize:12,color:C.warning,background:C.warningLight,borderRadius:8,padding:"7px 10px",marginBottom:20 }}>
              Esta parada volverá a Pendientes para que puedas reintentarla — no se contará como completada.
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={()=>setConfirm(null)} style={{ ...btn({flex:1,padding:"11px",background:"#F4F6F9",color:C.muted,border:"1px solid #E4E9F0",fontSize:14}) }}>Cancelar</button>
              <button onClick={()=>markClosed(confirm.stopId,confirm.visitIdx)} style={{ ...btn({flex:2,padding:"11px",background:"#DC2626",color:"#fff",fontSize:14}) }}>Sí, estaba cerrado</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
