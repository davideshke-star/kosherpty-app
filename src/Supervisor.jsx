import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, updateDoc, addDoc, query, orderBy, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { C, STATUS, btn, nowStr, todayName, todayDate, weekRange } from "./constants";
import { LogoIcon, LogoText } from "./Logo";
import ChecklistModal from "./ChecklistModal";
import DragList from "./DragList";

function Badge({ status }) {
  const st = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.color+"18", borderRadius:6, padding:"3px 10px", whiteSpace:"nowrap" }}>{st.label}</span>;
}

function Ring({ pct, color, size=44 }) {
  const r=17, circ=2*Math.PI*r, dash=circ*(pct/100);
  return (
    <svg width={size} height={size} viewBox="0 0 42 42">
      <circle cx="21" cy="21" r={r} fill="none" stroke="#E4E9F0" strokeWidth="3"/>
      <circle cx="21" cy="21" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 21 21)"
        style={{ transition:"stroke-dasharray .5s ease" }}/>
      <text x="21" y="25" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0F172A" fontFamily="'DM Sans',sans-serif">{pct}%</text>
    </svg>
  );
}

// Read-only visit card for history view
function HistoryVisitCard({ stop, visit, visitNumber, totalVisits, onAddVisit, isToday }) {
  const isDone   = visit.status === "done";
  const isClosed = visit.status === "closed";
  const isLast   = visitNumber === totalVisits;

  return (
    <div style={{
      background:"#fff", borderRadius:14, padding:14, marginBottom:8,
      border:`1.5px solid ${isDone?"#6EE7B7":isClosed?"#FCA5A5":"#E4E9F0"}`,
      opacity: isToday ? 1 : 0.85
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, color:C.text, fontSize:14 }}>{stop.place}</div>
          <div style={{ fontSize:11, color:C.muted }}>{stop.address}</div>
        </div>
        {totalVisits > 1 && (
          <span style={{ fontSize:10, color:C.primary, fontWeight:700, background:C.primaryLight, borderRadius:6, padding:"2px 8px" }}>Visita #{visitNumber}</span>
        )}
        <Badge status={visit.status}/>
      </div>

      {(visit.checkIn||visit.checkOut) && (
        <div style={{ fontSize:11, color:C.subtle, marginBottom:6 }}>
          {visit.checkIn&&<span>Entrada: <strong>{visit.checkIn}</strong>{visit.checkInEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>} </span>}
          {visit.checkOut&&<span>Salida: <strong>{visit.checkOut}</strong>{visit.checkOutEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>}</span>}
        </div>
      )}

      {visit.checklist && (
        <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:"#059669", fontWeight:600, background:"#ECFDF5", borderRadius:6, padding:"2px 8px" }}>
            ✅ {visit.checklist.filter(c=>c.result==="ok").length} OK
          </span>
          {visit.checklist.filter(c=>c.result==="issue").length > 0 && (
            <span style={{ fontSize:11, color:"#DC2626", fontWeight:600, background:"#FEF2F2", borderRadius:6, padding:"2px 8px" }}>
              ❌ {visit.checklist.filter(c=>c.result==="issue").length} problema
            </span>
          )}
        </div>
      )}

      {/* Checklist detail — collapsed by default */}
      {visit.checklist && visit.checklist.filter(c=>c.result==="issue").map(c => (
        <div key={c.id} style={{ fontSize:11, color:"#DC2626", background:"#FEF9F9", borderRadius:7, padding:"4px 8px", marginBottom:4 }}>
          ❌ {c.label}{c.note && `: ${c.note}`}
        </div>
      ))}

      {visit.generalNotes && (
        <div style={{ fontSize:12, color:C.muted, background:"#F8FAFC", borderRadius:8, padding:"6px 10px", marginBottom:6, lineHeight:1.5 }}>
          📝 {visit.generalNotes}
        </div>
      )}

      {/* Only show "add visit" on last visit of completed stops — read only otherwise */}
      {!isToday && isLast && (isDone || isClosed) && (
        <button onClick={() => onAddVisit(stop.id)}
          style={{ ...btn({ background:"#ECFDF5", color:"#059669", padding:"7px 14px", fontSize:12, marginTop:6 }) }}>
          + Nueva visita hoy
        </button>
      )}
    </div>
  );
}

export default function Supervisor({ user }) {
  const [supData, setSupData]           = useState(null);
  const [stops, setStops]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [navTab, setNavTab]             = useState("route");
  const [checklistModal, setChecklistModal] = useState(null);
  const [form, setForm]                 = useState({});
  const [confirmModal, setConfirmModal] = useState(null);
  const today = todayName();
  const todayISO = todayDate(); // e.g. "2026-05-26"

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) { setLoading(false); return; }
      const supId = userDoc.data().assignedSupId;
      if (!supId) { setLoading(false); return; }
      const supDoc = await getDoc(doc(db, "supervisors", supId));
      if (supDoc.exists()) setSupData({ id: supId, ...supDoc.data() });
      unsub = onSnapshot(
        query(collection(db, "supervisors", supId, "stops"), orderBy("order","asc")),
        snap => { setStops(snap.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); }
      );
    })();
    return () => unsub();
  }, [user.uid]);

  async function updateStop(stopId, data) {
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), data);
  }
  async function log(place, action) {
    await addDoc(collection(db, "history"), {
      time: nowStr(), timestamp: Date.now(),
      supervisor: supData?.name||"", supColor: supData?.color||C.primary,
      place, action
    });
  }

  async function markToday(stopId) {
    await updateStop(stopId, {
      status:"today", scheduledDay:today,
      visits:[{ idx:0, status:"today", scheduledDay:today, date:todayISO, checkIn:null, checkOut:null, checklist:null, generalNotes:"", checkInEdited:false, checkOutEdited:false }]
    });
  }

  async function startVisit(stopId, visitIdx) {
    const entryTime = nowStr();
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits||[])];
    visits[visitIdx] = { ...visits[visitIdx], status:"in-progress", checkIn:entryTime };
    await updateStop(stopId, { status:"in-progress", visits });
  }

  async function markClosed(stopId, visitIdx) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits||[])];
    visits[visitIdx] = { ...visits[visitIdx], status:"closed", checkOut:nowStr() };
    await updateStop(stopId, { status:"closed", visits });
    await log(stop.place, "Cerrado");
    setConfirmModal(null);
  }

  async function resetVisit(stopId, visitIdx) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits||[])];
    visits[visitIdx] = { ...visits[visitIdx], status:"today", checkIn:null, checkOut:null };
    await updateStop(stopId, { status:"today", visits });
  }

  async function completeVisit(stopId, visitIdx, data) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits||[])];
    const hasIssue = data.checklist.some(c => c.result === "issue");
    visits[visitIdx] = {
      ...visits[visitIdx],
      status:       "done",
      checkIn:      visits[visitIdx].checkIn, // NEVER overwrite
      checkOut:     data.checkOut,
      checklist:    data.checklist,
      generalNotes: data.generalNotes,
      date:         todayISO,
      checkInEdited:  false,
      checkOutEdited: false,
    };
    await updateStop(stopId, { status:"done", visits });
    await log(stop.place, hasIssue?"Completado con observaciones":"Completado");
    setChecklistModal(null);
  }

  async function editVisit(stopId, visitIdx, data) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits||[])];
    visits[visitIdx] = {
      ...visits[visitIdx],
      status:         "done",
      checkIn:        data.checkIn,
      checkOut:       data.checkOut,
      checklist:      data.checklist,
      generalNotes:   data.generalNotes,
      checkInEdited:  data.checkInEdited,
      checkOutEdited: data.checkOutEdited,
      edited:         true,
    };
    await updateStop(stopId, { status:"done", visits });
    await log(stop.place, "Visita editada");
    setChecklistModal(null);
  }

  // Add a new visit today (from history view)
  async function addVisitToday(stopId) {
    const stop = stops.find(s => s.id === stopId);
    const visits = stop.visits||[];
    await updateStop(stopId, {
      status:"today",
      visits:[...visits, { idx:visits.length, status:"today", scheduledDay:today, date:todayISO, checkIn:null, checkOut:null, checklist:null, generalNotes:"", checkInEdited:false, checkOutEdited:false }]
    });
    setNavTab("route"); // Switch to route tab to see the new visit
  }

  async function addNextVisit(stopId) {
    const stop = stops.find(s => s.id === stopId);
    const visits = stop.visits||[];
    await updateStop(stopId, {
      status:"today",
      visits:[...visits, { idx:visits.length, status:"today", scheduledDay:today, date:todayISO, checkIn:null, checkOut:null, checklist:null, generalNotes:"", checkInEdited:false, checkOutEdited:false }]
    });
  }

  async function handleReorder(orderedStops) {
    const batch = writeBatch(db);
    orderedStops.forEach((stop, i) => {
      batch.update(doc(db, "supervisors", supData.id, "stops", stop.id), { order: i });
    });
    await batch.commit();
  }

  async function sendSuggestion() {
    if (!form.text?.trim()||!form.type) return;
    await addDoc(collection(db,"suggestions"),{
      uid:user.uid, name:supData?.name||"",
      type:form.type, text:form.text.trim(),
      status:"pending", createdAt:Date.now(), timestamp:new Date().toISOString()
    });
    setForm({}); setNavTab("route");
    alert("¡Sugerencia enviada!");
  }

  // Stops for today's route tab — only those with visits scheduled today
  const todayStops   = stops.filter(s => ["today","in-progress","done","closed"].includes(s.status) &&
    (s.visits||[]).some(v => v.date === todayISO || !v.date));
  const pendingStops = stops.filter(s => s.status === "pending");

  // History: stops with completed visits from PREVIOUS days
  const historyStops = stops.filter(s => {
    const visits = s.visits||[];
    return visits.some(v => v.date && v.date !== todayISO && ["done","closed"].includes(v.status));
  });

  const doneCount = stops.filter(s => ["done","closed"].includes(s.status)).length;
  const pct       = stops.length ? Math.round(doneCount/stops.length*100) : 0;
  const color     = supData?.color || C.primary;
  const todayDone = todayStops.filter(s => ["done","closed"].includes(s.status)).length;

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#F4F6F9", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:32, height:32, border:"3px solid #E4E9F0", borderTop:`3px solid ${C.primary}`, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!supData) return (
    <div style={{ minHeight:"100vh", background:"#F4F6F9", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:8 }}>Sin ruta asignada</div>
      <div style={{ fontSize:13, color:C.muted, textAlign:"center", marginBottom:20 }}>El administrador aún no te ha asignado una ruta.</div>
      <button onClick={() => signOut(auth)} style={{ ...btn({ background:C.primary, color:"#fff", padding:"11px 24px", fontSize:14 }) }}>Cerrar sesión</button>
    </div>
  );

  const NAV = [
    { id:"route",   icon:"🗺",  label:"Mi Ruta" },
    { id:"history", icon:"📅",  label:"Historial" },
    { id:"suggest", icon:"💬",  label:"Sugerencias" },
  ];

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F4F6F9", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E4E9F0", padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 3px rgba(0,0,0,.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <LogoIcon size={30}/>
          <LogoText/>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Ring pct={pct} color={color}/>
          <button onClick={() => signOut(auth)} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"6px 12px", fontSize:12, border:"1px solid #E4E9F0" }) }}>Salir</button>
        </div>
      </div>

      <div style={{ padding:"14px 16px 88px", maxWidth:580, margin:"0 auto" }}>

        {/* ── ROUTE TAB ── */}
        {navTab === "route" && (
          <>
            {/* Summary */}
            <div style={{ background:color, borderRadius:14, padding:"13px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 4px 16px ${color}44` }}>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,.75)", fontWeight:700, textTransform:"uppercase", letterSpacing:.8 }}>{supData.name} — {today}</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginTop:2 }}>{todayDone} de {todayStops.length} completadas hoy</div>
              </div>
              <div style={{ fontSize:24, fontWeight:800, color:"rgba(255,255,255,.9)" }}>
                {todayStops.length ? Math.round(todayDone/todayStops.length*100) : 0}%
              </div>
            </div>

            {/* Today stops */}
            {todayStops.length > 0 && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Para hoy</div>
                {todayStops.map(stop => {
                  const visits = (stop.visits||[]).filter(v => v.date === todayISO || !v.date);
                  return visits.map((visit, vi) => {
                    const realIdx    = (stop.visits||[]).indexOf(visit);
                    const isDone     = visit.status === "done";
                    const isClosed   = visit.status === "closed";
                    const isInProg   = visit.status === "in-progress";
                    const isToday    = visit.status === "today";
                    const isFinished = isDone || isClosed;
                    const allVisits  = stop.visits||[];
                    const isLastVisit = realIdx === allVisits.length - 1;

                    return (
                      <div key={`${stop.id}-${realIdx}`} style={{
                        background:"#fff", borderRadius:16, padding:16, marginBottom:10,
                        border:`1.5px solid ${isInProg?"#FDE68A":isClosed?"#FCA5A5":isDone?"#6EE7B7":"#E4E9F0"}`,
                        boxShadow: isInProg ? "0 0 0 3px #FFFBEB" : "0 1px 3px rgba(0,0,0,.05)"
                      }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, color:C.text, fontSize:15 }}>{stop.place}</div>
                            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{stop.address}</div>
                          </div>
                          {allVisits.length > 1 && (
                            <span style={{ fontSize:10, color:C.primary, fontWeight:700, background:C.primaryLight, borderRadius:6, padding:"2px 8px", whiteSpace:"nowrap", marginTop:2 }}>
                              Visita #{realIdx+1}
                            </span>
                          )}
                          <Badge status={visit.status}/>
                        </div>

                        {(visit.checkIn||visit.checkOut) && (
                          <div style={{ fontSize:11, color:C.subtle, marginBottom:7 }}>
                            {visit.checkIn&&<span>Entrada: <strong>{visit.checkIn}</strong>{visit.checkInEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>} </span>}
                            {visit.checkOut&&<span>Salida: <strong>{visit.checkOut}</strong>{visit.checkOutEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>}</span>}
                          </div>
                        )}

                        {visit.checklist && (
                          <div style={{ display:"flex", gap:6, marginBottom:7, flexWrap:"wrap" }}>
                            <span style={{ fontSize:11, color:"#059669", fontWeight:600, background:"#ECFDF5", borderRadius:6, padding:"2px 8px" }}>✅ {visit.checklist.filter(c=>c.result==="ok").length} OK</span>
                            {visit.checklist.filter(c=>c.result==="issue").length > 0 && (
                              <span style={{ fontSize:11, color:"#DC2626", fontWeight:600, background:"#FEF2F2", borderRadius:6, padding:"2px 8px" }}>❌ {visit.checklist.filter(c=>c.result==="issue").length} problema</span>
                            )}
                          </div>
                        )}

                        {visit.generalNotes && (
                          <div style={{ fontSize:12, color:C.muted, background:"#F8FAFC", borderRadius:8, padding:"6px 10px", marginBottom:7 }}>📝 {visit.generalNotes}</div>
                        )}

                        {/* Actions */}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                          {isToday && (
                            <button onClick={() => startVisit(stop.id, realIdx)}
                              style={{ ...btn({ background:C.primary, color:"#fff", padding:"9px 20px", fontSize:14, boxShadow:`0 2px 8px ${C.primary}44` }) }}>
                              ▶ Iniciar
                            </button>
                          )}
                          {isInProg && (
                            <>
                              <button onClick={() => setConfirmModal({ stopId:stop.id, visitIdx:realIdx })}
                                style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"9px 14px", fontSize:13, border:"1px solid #FCA5A5" }) }}>
                                🔒 Cerrado
                              </button>
                              <button onClick={() => setChecklistModal({ stopId:stop.id, visitIdx:realIdx, mode:"new" })}
                                style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"9px 14px", fontSize:13 }) }}>
                                📋 Checklist
                              </button>
                            </>
                          )}
                          {isFinished && (
                            <>
                              <button onClick={() => setChecklistModal({ stopId:stop.id, visitIdx:realIdx, mode:"edit" })}
                                style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"8px 14px", fontSize:13, border:"1px solid #E4E9F0" }) }}>
                                ✏️ Editar{allVisits.length>1?` #${realIdx+1}`:""}
                              </button>
                              {isClosed && (
                                <button onClick={() => resetVisit(stop.id, realIdx)}
                                  style={{ ...btn({ background:"#FFFBEB", color:"#D97706", padding:"8px 14px", fontSize:13, border:"1px solid #FDE68A" }) }}>
                                  ↩ Reiniciar
                                </button>
                              )}
                              {isLastVisit && (
                                <button onClick={() => addNextVisit(stop.id)}
                                  style={{ ...btn({ background:"#ECFDF5", color:"#059669", padding:"8px 14px", fontSize:13 }) }}>
                                  + {allVisits.length===1?"2ª visita":allVisits.length===2?"3ª visita":`Visita #${allVisits.length+1}`}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  });
                })}
              </>
            )}

            {/* Pending stops */}
            {pendingStops.length > 0 && (
              <div style={{ marginTop:16 }}>
                <DragList
                  items={pendingStops}
                  onReorder={handleReorder}
                  renderItem={stop => (
                    <button onClick={() => markToday(stop.id)}
                      style={{ background:C.primaryLight, color:C.primary, border:"none", borderRadius:10, padding:"7px 14px", fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0 }}>
                      + Hoy
                    </button>
                  )}
                />
              </div>
            )}

            {pendingStops.length===0 && todayStops.every(s=>["done","closed"].includes(s.status)) && stops.length>0 && (
              <div style={{ background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:14, padding:28, textAlign:"center", marginTop:10 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                <div style={{ fontWeight:800, color:"#059669", fontSize:17 }}>¡Semana completada!</div>
              </div>
            )}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {navTab === "history" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Historial de visitas</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>
              Visitas de días anteriores — solo lectura. Puedes agregar una nueva visita hoy.
            </div>

            {historyStops.length === 0 ? (
              <div style={{ textAlign:"center", color:C.muted, padding:40, fontSize:14 }}>
                No hay visitas de días anteriores aún.
              </div>
            ) : (
              historyStops.map(stop => {
                const pastVisits = (stop.visits||[]).filter(v => v.date && v.date !== todayISO);
                const hasVisitToday = (stop.visits||[]).some(v => v.date === todayISO);
                return (
                  <div key={stop.id} style={{ marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:6, paddingLeft:4 }}>
                      {stop.place}
                      <span style={{ fontSize:11, color:C.muted, fontWeight:400, marginLeft:6 }}>{stop.address}</span>
                    </div>
                    {pastVisits.map((visit, vi) => (
                      <HistoryVisitCard
                        key={vi}
                        stop={stop}
                        visit={visit}
                        visitNumber={vi+1}
                        totalVisits={pastVisits.length}
                        onAddVisit={addVisitToday}
                        isToday={false}
                      />
                    ))}
                    {!hasVisitToday && pastVisits.length > 0 && (
                      <button onClick={() => addVisitToday(stop.id)}
                        style={{ ...btn({ background:"#ECFDF5", color:"#059669", padding:"8px 16px", fontSize:13, marginTop:4 }) }}>
                        + Visitar hoy
                      </button>
                    )}
                    {hasVisitToday && (
                      <div style={{ fontSize:11, color:C.primary, fontWeight:600, marginTop:4, paddingLeft:4 }}>
                        ✓ Ya tiene visita agendada hoy
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ── SUGGEST TAB ── */}
        {navTab === "suggest" && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Sugerencias</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>Envía sugerencias o errores al administrador.</div>
            <div style={{ background:"#fff", borderRadius:16, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:8 }}>Tipo</div>
              <div style={{ display:"flex", gap:7, marginBottom:16 }}>
                {["Mejora","Error","Otro"].map(t => (
                  <button key={t} onClick={() => setForm(p=>({...p,type:t}))}
                    style={{ ...btn({ flex:1, padding:"8px 4px", fontSize:13, background:form.type===t?C.primary:"#F4F6F9", color:form.type===t?"#fff":C.muted, border:`1.5px solid ${form.type===t?C.primary:"#E4E9F0"}` }) }}>
                    {t==="Mejora"?"💡":t==="Error"?"🐛":"💬"} {t}
                  </button>
                ))}
              </div>
              <textarea value={form.text||""} onChange={e=>setForm(p=>({...p,text:e.target.value}))}
                placeholder="Describe tu sugerencia..."
                style={{ width:"100%", border:"1.5px solid #E4E9F0", borderRadius:12, padding:"10px 12px", fontSize:13, outline:"none", resize:"none", minHeight:100, color:C.text, boxSizing:"border-box", marginBottom:14 }}/>
              <button onClick={sendSuggestion} disabled={!form.text?.trim()||!form.type}
                style={{ ...btn({ width:"100%", padding:"12px", fontSize:14, background:form.text?.trim()&&form.type?C.primary:"#E5E7EB", color:"#fff" }) }}>
                Enviar sugerencia
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #E4E9F0", display:"flex", zIndex:50, boxShadow:"0 -2px 12px rgba(0,0,0,.06)" }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setNavTab(n.id)}
            style={{ ...btn({ flex:1, padding:"10px 4px", background:"none", color:navTab===n.id?C.primary:C.muted, fontSize:10, display:"flex", flexDirection:"column", alignItems:"center", gap:3, borderRadius:0, borderTop:navTab===n.id?`2px solid ${C.primary}`:"2px solid transparent", fontWeight:navTab===n.id?700:500 }) }}>
            <span style={{ fontSize:20 }}>{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      {/* Checklist Modal */}
      {checklistModal && (() => {
        const stop  = stops.find(s => s.id === checklistModal.stopId);
        const visit = (stop?.visits||[])[checklistModal.visitIdx];
        const isEdit = checklistModal.mode === "edit";
        return (
          <ChecklistModal
            checkInTime={!isEdit ? visit?.checkIn : null}
            existingData={isEdit ? visit : null}
            isEditing={isEdit}
            onSave={data => isEdit
              ? editVisit(checklistModal.stopId, checklistModal.visitIdx, data)
              : completeVisit(checklistModal.stopId, checklistModal.visitIdx, data)
            }
            onCancel={() => setChecklistModal(null)}
          />
        );
      })()}

      {/* Closed confirm */}
      {confirmModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300, padding:16 }}
          onClick={() => setConfirmModal(null)}>
          <div style={{ background:"#fff", borderRadius:"20px 20px 16px 16px", padding:24, width:"100%", maxWidth:460, marginBottom:8 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, color:"#DC2626", fontSize:16, marginBottom:6 }}>🔒 Marcar como cerrado</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:20 }}>¿Confirmas que el establecimiento estaba cerrado?</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setConfirmModal(null)}
                style={{ ...btn({ flex:1, padding:"11px", background:"#F4F6F9", color:C.muted, border:"1px solid #E4E9F0", fontSize:14 }) }}>Cancelar</button>
              <button onClick={() => markClosed(confirmModal.stopId, confirmModal.visitIdx)}
                style={{ ...btn({ flex:2, padding:"11px", background:"#DC2626", color:"#fff", fontSize:14 }) }}>Sí, estaba cerrado</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
