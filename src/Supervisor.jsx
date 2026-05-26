import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, updateDoc, addDoc, query, orderBy, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { C, STATUS, btn, nowStr, todayName, weekRange } from "./constants";
import { LogoIcon, LogoText } from "./Logo";
import ChecklistModal from "./ChecklistModal";

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

// ── Drag-to-reorder list for pending stops ────────────────────────────────────
function ReorderableList({ stops, onReorder, onMarkToday }) {
  const [dragIdx, setDragIdx]   = useState(null);
  const [overIdx, setOverIdx]   = useState(null);
  const [items, setItems]       = useState(stops);
  const [saving, setSaving]     = useState(false);

  // Sync external stops into local state
  useEffect(() => { setItems(stops); }, [stops]);

  // Touch drag state
  const touchStart = useRef(null);
  const touchItem  = useRef(null);

  function handleDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragOver(e, idx) {
    e.preventDefault();
    setOverIdx(idx);
  }
  function handleDrop(e, idx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setItems(reordered);
    setDragIdx(null); setOverIdx(null);
    saveOrder(reordered);
  }
  function handleDragEnd() { setDragIdx(null); setOverIdx(null); }

  // Touch handlers for mobile
  function handleTouchStart(e, idx) {
    touchItem.current = idx;
    touchStart.current = { y: e.touches[0].clientY, idx };
  }
  function handleTouchMove(e) {
    if (touchItem.current === null) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const elements = document.querySelectorAll("[data-stop-item]");
    let newOver = touchItem.current;
    elements.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) newOver = i;
    });
    setOverIdx(newOver);
  }
  function handleTouchEnd() {
    if (touchItem.current === null || overIdx === null || touchItem.current === overIdx) {
      touchItem.current = null; setOverIdx(null); return;
    }
    const reordered = [...items];
    const [moved] = reordered.splice(touchItem.current, 1);
    reordered.splice(overIdx, 0, moved);
    setItems(reordered);
    touchItem.current = null; setOverIdx(null);
    saveOrder(reordered);
  }

  async function saveOrder(ordered) {
    setSaving(true);
    await onReorder(ordered);
    setSaving(false);
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1 }}>
          Pendientes esta semana ({items.length})
        </div>
        {saving && <div style={{ fontSize:11, color:C.primary }}>Guardando...</div>}
        <div style={{ fontSize:11, color:C.subtle }}>Mantén ☰ para reordenar</div>
      </div>

      {items.map((stop, i) => (
        <div
          key={stop.id}
          data-stop-item
          draggable
          onDragStart={e => handleDragStart(e, i)}
          onDragOver={e => handleDragOver(e, i)}
          onDrop={e => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
          onTouchStart={e => handleTouchStart(e, i)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            background: overIdx === i && dragIdx !== i ? C.primaryLight : "#fff",
            borderRadius:12, padding:"11px 12px", marginBottom:6,
            border:`1.5px solid ${overIdx===i&&dragIdx!==i?C.primary:"#E4E9F0"}`,
            display:"flex", alignItems:"center", gap:10,
            boxShadow: dragIdx===i ? "0 8px 24px rgba(0,0,0,.12)" : "0 1px 2px rgba(0,0,0,.04)",
            opacity: dragIdx===i ? 0.5 : 1,
            transition:"all .15s", cursor:"default", userSelect:"none"
          }}>
          {/* Drag handle */}
          <div
            style={{ display:"flex", flexDirection:"column", gap:3, padding:"4px 6px", cursor:"grab", flexShrink:0 }}
            title="Arrastra para reordenar">
            {[0,1,2].map(l => (
              <div key={l} style={{ width:16, height:2, background:"#D1D5DB", borderRadius:99 }}/>
            ))}
          </div>

          {/* Order number */}
          <div style={{ width:22, height:22, borderRadius:"50%", background:C.primaryLight, color:C.primary, fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            {i+1}
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:600, color:C.text, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{stop.place}</div>
            <div style={{ fontSize:11, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{stop.address}</div>
          </div>

          <button onClick={() => onMarkToday(stop.id)}
            style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"7px 14px", fontSize:13, flexShrink:0 }) }}>
            + Hoy
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Supervisor({ user }) {
  const [supData, setSupData]           = useState(null);
  const [stops, setStops]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [navTab, setNavTab]             = useState("route");
  const [checklistModal, setChecklistModal] = useState(null);
  const [form, setForm]                 = useState({});
  const [confirmModal, setConfirmModal] = useState(null);
  const today = todayName();

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
      visits:[{ idx:0, status:"today", scheduledDay:today, checkIn:null, checkOut:null, checklist:null, generalNotes:"", checkInEdited:false, checkOutEdited:false }]
    });
  }

  async function startVisit(stopId, visitIdx) {
    const entryTime = nowStr();
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits||[])];
    visits[visitIdx] = { ...visits[visitIdx], status:"in-progress", checkIn: entryTime };
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

  async function completeVisit(stopId, visitIdx, checklistData) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits||[])];
    const hasIssue = checklistData.checklist.some(c => c.result === "issue");
    visits[visitIdx] = {
      ...visits[visitIdx],
      status:       "done",
      checkIn:      visits[visitIdx].checkIn, // NEVER overwrite
      checkOut:     checklistData.checkOut,
      checklist:    checklistData.checklist,
      generalNotes: checklistData.generalNotes,
      checkInEdited:  false,
      checkOutEdited: false,
    };
    await updateStop(stopId, { status:"done", visits });
    await log(stop.place, hasIssue ? "Completado con observaciones" : "Completado");
    setChecklistModal(null);
  }

  async function editVisit(stopId, visitIdx, checklistData) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits||[])];
    visits[visitIdx] = {
      ...visits[visitIdx],
      status:         "done",
      checkIn:        checklistData.checkIn,
      checkOut:       checklistData.checkOut,
      checklist:      checklistData.checklist,
      generalNotes:   checklistData.generalNotes,
      checkInEdited:  checklistData.checkInEdited,
      checkOutEdited: checklistData.checkOutEdited,
      edited:         true,
    };
    await updateStop(stopId, { status:"done", visits });
    await log(stop.place, "Visita editada");
    setChecklistModal(null);
  }

  async function addNextVisit(stopId) {
    const stop = stops.find(s => s.id === stopId);
    const visits = stop.visits||[];
    await updateStop(stopId, {
      status:"today",
      visits:[...visits, { idx:visits.length, status:"today", scheduledDay:today, checkIn:null, checkOut:null, checklist:null, generalNotes:"", checkInEdited:false, checkOutEdited:false }]
    });
  }

  // Batch reorder — saves all in one go
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

  const todayStops   = stops.filter(s => ["today","in-progress","done","closed"].includes(s.status));
  const pendingStops = stops.filter(s => s.status === "pending");
  const doneCount    = stops.filter(s => ["done","closed"].includes(s.status)).length;
  const pct          = stops.length ? Math.round(doneCount/stops.length*100) : 0;
  const color        = supData?.color || C.primary;
  const todayDone    = todayStops.filter(s => ["done","closed"].includes(s.status)).length;

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#F4F6F9", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:32, height:32, border:`3px solid #E4E9F0`, borderTop:`3px solid ${C.primary}`, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
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

        {navTab === "route" && (
          <>
            {/* Summary pill */}
            <div style={{ background:color, borderRadius:14, padding:"13px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 4px 16px ${color}44` }}>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,.75)", fontWeight:700, textTransform:"uppercase", letterSpacing:.8 }}>{supData.name} — {today}</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginTop:2 }}>{todayDone} de {todayStops.length} completadas hoy</div>
              </div>
              <div style={{ fontSize:24, fontWeight:800, color:"rgba(255,255,255,.9)" }}>
                {todayStops.length ? Math.round(todayDone/todayStops.length*100) : 0}%
              </div>
            </div>

            {/* Today's stops */}
            {todayStops.length > 0 && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Para hoy</div>
                {todayStops.map(stop => {
                  const visits = stop.visits || [];
                  return visits.map((visit, vi) => {
                    const isDone       = visit.status === "done";
                    const isClosed     = visit.status === "closed";
                    const isInProgress = visit.status === "in-progress";
                    const isToday      = visit.status === "today";
                    const isFinished   = isDone || isClosed;

                    return (
                      <div key={`${stop.id}-${vi}`} style={{
                        background:"#fff", borderRadius:16, padding:16, marginBottom:10,
                        border:`1.5px solid ${isInProgress?"#FDE68A":isClosed?"#FCA5A5":isDone?"#6EE7B7":"#E4E9F0"}`,
                        boxShadow: isInProgress ? "0 0 0 3px #FFFBEB" : "0 1px 3px rgba(0,0,0,.05)"
                      }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, color:C.text, fontSize:15 }}>{stop.place}</div>
                            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{stop.address}</div>
                          </div>
                          {visits.length > 1 && (
                            <span style={{ fontSize:10, color:C.primary, fontWeight:700, background:C.primaryLight, borderRadius:6, padding:"2px 8px", whiteSpace:"nowrap", marginTop:2 }}>Visita #{vi+1}</span>
                          )}
                          <Badge status={visit.status}/>
                        </div>

                        {(visit.checkIn || visit.checkOut) && (
                          <div style={{ fontSize:11, color:C.subtle, marginBottom:7 }}>
                            {visit.checkIn && <span>Entrada: <strong>{visit.checkIn}</strong>{visit.checkInEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>} </span>}
                            {visit.checkOut && <span>Salida: <strong>{visit.checkOut}</strong>{visit.checkOutEdited&&<span style={{ color:"#D97706" }}> ⚠️</span>}</span>}
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
                          <div style={{ fontSize:12, color:C.muted, background:"#F8FAFC", borderRadius:8, padding:"6px 10px", marginBottom:7, lineHeight:1.5 }}>📝 {visit.generalNotes}</div>
                        )}

                        {/* Actions */}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                          {isToday && (
                            <button onClick={() => startVisit(stop.id, vi)}
                              style={{ ...btn({ background:C.primary, color:"#fff", padding:"9px 20px", fontSize:14, boxShadow:`0 2px 8px ${C.primary}44` }) }}>
                              ▶ Iniciar
                            </button>
                          )}
                          {isInProgress && (
                            <>
                              <button onClick={() => setConfirmModal({ stopId:stop.id, visitIdx:vi })}
                                style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"9px 14px", fontSize:13, border:"1px solid #FCA5A5" }) }}>
                                🔒 Cerrado
                              </button>
                              <button onClick={() => setChecklistModal({ stopId:stop.id, visitIdx:vi, mode:"new" })}
                                style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"9px 14px", fontSize:13 }) }}>
                                📋 Checklist
                              </button>
                            </>
                          )}
                          {isFinished && (
                            <>
                              <button onClick={() => setChecklistModal({ stopId:stop.id, visitIdx:vi, mode:"edit" })}
                                style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"8px 14px", fontSize:13, border:"1px solid #E4E9F0" }) }}>
                                ✏️ Editar{visits.length>1?` #${vi+1}`:""}
                              </button>
                              {isClosed && (
                                <button onClick={() => resetVisit(stop.id, vi)}
                                  style={{ ...btn({ background:"#FFFBEB", color:"#D97706", padding:"8px 14px", fontSize:13, border:"1px solid #FDE68A" }) }}>
                                  ↩ Reiniciar
                                </button>
                              )}
                              {vi === visits.length - 1 && (
                                <button onClick={() => addNextVisit(stop.id)}
                                  style={{ ...btn({ background:"#ECFDF5", color:"#059669", padding:"8px 14px", fontSize:13 }) }}>
                                  + {visits.length===1?"2ª visita":visits.length===2?"3ª visita":`Visita #${visits.length+1}`}
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

            {/* Pending stops — drag to reorder */}
            {pendingStops.length > 0 && (
              <div style={{ marginTop:16 }}>
                <ReorderableList
                  stops={pendingStops}
                  onReorder={handleReorder}
                  onMarkToday={markToday}
                />
              </div>
            )}

            {pendingStops.length===0 && todayStops.every(s=>["done","closed"].includes(s.status)) && stops.length>0 && (
              <div style={{ background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:14, padding:28, textAlign:"center", marginTop:10 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                <div style={{ fontWeight:800, color:"#059669", fontSize:17 }}>¡Semana completada!</div>
                <div style={{ color:"#15803D", fontSize:13, marginTop:4 }}>Todas las paradas han sido atendidas.</div>
              </div>
            )}
          </>
        )}

        {navTab === "suggest" && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Sugerencias</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>Envía sugerencias, errores o mejoras al administrador.</div>
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
                style={{ width:"100%", border:"1.5px solid #E4E9F0", borderRadius:12, padding:"10px 12px", fontSize:13, outline:"none", resize:"none", minHeight:100, color:C.text, boxSizing:"border-box", marginBottom:14, lineHeight:1.6 }}/>
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
        {[{id:"route",icon:"🗺",label:"Mi Ruta"},{id:"suggest",icon:"💬",label:"Sugerencias"}].map(n => (
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
            <div style={{ fontSize:13, color:C.muted, marginBottom:20, lineHeight:1.5 }}>¿Confirmas que el establecimiento estaba cerrado?</div>
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
