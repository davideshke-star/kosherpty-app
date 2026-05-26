import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, updateDoc, addDoc, query, orderBy } from "firebase/firestore";
import { auth, db } from "./firebase";
import { APP_NAME, APP_SUB, C, STATUS, btn, nowStr, todayName, weekRange, initials } from "./constants";
import VisitModal from "./VisitModal";

function Badge({ status }) {
  const st = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.color+"18", borderRadius:6, padding:"3px 9px", whiteSpace:"nowrap" }}>{st.label}</span>;
}

function Ring({ pct, color, size=44 }) {
  const r=17, circ=2*Math.PI*r, dash=circ*(pct/100);
  return (
    <svg width={size} height={size} viewBox="0 0 42 42">
      <circle cx="21" cy="21" r={r} fill="none" stroke={C.border} strokeWidth="3"/>
      <circle cx="21" cy="21" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 21 21)"
        style={{ transition:"stroke-dasharray .5s ease" }}/>
      <text x="21" y="25" textAnchor="middle" fontSize="10" fontWeight="700" fill={C.text} fontFamily="'DM Sans',sans-serif">{pct}%</text>
    </svg>
  );
}

export default function Supervisor({ user }) {
  const [supData, setSupData]   = useState(null);
  const [stops, setStops]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [navTab, setNavTab]     = useState("route");
  const [visitModal, setVisitModal] = useState(null); // {stopId, visitIdx, mode:"new"|"edit"}
  const [form, setForm]         = useState({});
  const [modal, setModal]       = useState(null); // suggest | closed-confirm
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
        query(collection(db, "supervisors", supId, "stops"), orderBy("order", "asc")),
        snap => { setStops(snap.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); }
      );
    })();
    return () => unsub();
  }, [user.uid]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  async function updateStop(stopId, data) {
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), data);
  }

  async function logHistory(place, action) {
    await addDoc(collection(db, "history"), {
      time: nowStr(), timestamp: Date.now(),
      supervisor: supData?.name || "", supColor: supData?.color || C.primary,
      place, action
    });
  }

  // Mark stop for today — creates first visit slot
  async function markToday(stopId) {
    const stop = stops.find(s => s.id === stopId);
    const visits = stop.visits || [];
    if (visits.length === 0) {
      await updateStop(stopId, {
        status: "today", scheduledDay: today,
        visits: [{ idx:0, status:"today", scheduledDay:today, checkIn:null, checkOut:null, checklist:null, generalNotes:"", photos:[], checkInEdited:false, checkOutEdited:false }]
      });
    }
  }

  // START — sets checkIn time, status in-progress
  async function startVisit(stopId, visitIdx) {
    const t = nowStr();
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    visits[visitIdx] = { ...visits[visitIdx], status:"in-progress", checkIn:t };
    await updateStop(stopId, { status:"in-progress", visits });
  }

  // MARK CLOSED
  async function markClosed(stopId, visitIdx) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    visits[visitIdx] = { ...visits[visitIdx], status:"closed", checkOut:nowStr() };
    await updateStop(stopId, { status:"closed", visits });
    await logHistory(stop.place, "Cerrado");
    setModal(null);
  }

  // COMPLETE VISIT with checklist data
  async function completeVisit(stopId, visitIdx, data) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    const hasIssue = data.checklist.some(c => c.result === "issue");
    visits[visitIdx] = {
      ...visits[visitIdx],
      status: "done",
      checkOut: data.checkOut || nowStr(),
      checklist: data.checklist,
      generalNotes: data.generalNotes,
      photos: data.photos,
      checkInEdited: data.checkInEdited || false,
      checkOutEdited: data.checkOutEdited || false,
      ...(data.checkIn ? { checkIn: data.checkIn } : {}),
    };
    // Overall stop = done or issue
    await updateStop(stopId, { status: hasIssue ? "done" : "done", visits });
    await logHistory(stop.place, hasIssue ? "Completado con observaciones" : "Completado");
    setVisitModal(null);
  }

  // EDIT VISIT
  async function editVisit(stopId, visitIdx, data) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    visits[visitIdx] = {
      ...visits[visitIdx],
      checklist: data.checklist,
      generalNotes: data.generalNotes,
      photos: data.photos,
      checkIn: data.checkIn || visits[visitIdx].checkIn,
      checkOut: data.checkOut || visits[visitIdx].checkOut,
      checkInEdited: data.checkInEdited || visits[visitIdx].checkInEdited || false,
      checkOutEdited: data.checkOutEdited || visits[visitIdx].checkOutEdited || false,
      edited: true,
    };
    await updateStop(stopId, { visits });
    await logHistory(stop.place, "Visita editada");
    setVisitModal(null);
  }

  // ADD NEXT VISIT
  async function addNextVisit(stopId) {
    const stop = stops.find(s => s.id === stopId);
    const visits = stop.visits || [];
    const newVisit = { idx: visits.length, status:"today", scheduledDay:today, checkIn:null, checkOut:null, checklist:null, generalNotes:"", photos:[], checkInEdited:false, checkOutEdited:false };
    await updateStop(stopId, { status:"today", visits:[...visits, newVisit] });
  }

  // SUGGEST
  async function sendSuggestion() {
    if (!form.text?.trim() || !form.type) return;
    await addDoc(collection(db, "suggestions"), {
      uid: user.uid, name: supData?.name || user.displayName || "",
      type: form.type, text: form.text.trim(),
      status:"pending", createdAt: Date.now(), timestamp: new Date().toISOString()
    });
    setForm({}); setModal(null); setNavTab("route");
    alert("¡Sugerencia enviada!");
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const todayStops   = stops.filter(s => ["today","in-progress","done","closed","checklist"].includes(s.status));
  const pendingStops = stops.filter(s => s.status === "pending");
  const doneCount    = stops.filter(s => ["done","closed"].includes(s.status)).length;
  const pct          = stops.length ? Math.round(doneCount / stops.length * 100) : 0;
  const color        = supData?.color || C.primary;
  const todayDone    = todayStops.filter(s => ["done","closed"].includes(s.status)).length;

  if (loading) return <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", color:C.muted }}>Cargando...</div>;

  if (!supData) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:44, marginBottom:16 }}>📋</div>
      <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:8 }}>Sin ruta asignada</div>
      <div style={{ fontSize:13, color:C.muted, textAlign:"center", marginBottom:24 }}>El administrador aún no te ha asignado una ruta.</div>
      <button onClick={() => signOut(auth)} style={{ ...btn({ background:C.primary, color:"#fff", padding:"11px 24px", fontSize:14 }) }}>Cerrar sesión</button>
    </div>
  );

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:C.bg, minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, boxShadow:C.shadow }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:C.primary, textTransform:"uppercase", letterSpacing:1.2 }}>{APP_NAME}</div>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{APP_SUB}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Ring pct={pct} color={color}/>
          <button onClick={() => signOut(auth)} style={{ ...btn({ background:C.bg, color:C.muted, padding:"6px 11px", fontSize:12, border:`1px solid ${C.border}` }) }}>Salir</button>
        </div>
      </div>

      <div style={{ padding:"14px 16px 88px", maxWidth:580, margin:"0 auto" }}>
        {navTab === "route" && (
          <>
            {/* Summary bar */}
            <div style={{ background:color, borderRadius:14, padding:"12px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 4px 16px ${color}44` }}>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,.7)", fontWeight:700, textTransform:"uppercase", letterSpacing:.8 }}>{supData.name} — {today}</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginTop:2 }}>{todayDone} de {todayStops.length} completadas hoy</div>
              </div>
              <div style={{ fontSize:22, fontWeight:800, color:"rgba(255,255,255,.9)" }}>{todayStops.length?Math.round(todayDone/todayStops.length*100):0}%</div>
            </div>

            {/* Today stops */}
            {todayStops.length > 0 && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Para hoy</div>
                {todayStops.map(stop => {
                  const visits = stop.visits || [];
                  return visits.map((visit, vi) => {
                    const isDone   = visit.status === "done";
                    const isClosed = visit.status === "closed";
                    const isInProgress = visit.status === "in-progress";
                    const isToday  = visit.status === "today";
                    const isFinished = isDone || isClosed;
                    const visitLabel = visits.length > 1 ? `Visita #${vi+1}` : null;
                    const hasIssues = (visit.checklist||[]).some(c=>c.result==="issue");

                    return (
                      <div key={`${stop.id}-${vi}`} style={{ background:C.surface, borderRadius:14, padding:14, marginBottom:8, border:`1px solid ${isInProgress?C.warning+"66":isClosed?C.danger+"44":isDone?C.success+"33":C.border}`, boxShadow:isInProgress?`0 0 0 3px ${C.warningLight}`:C.shadow }}>
                        {/* Stop header */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, color:C.text, fontSize:14 }}>{stop.place}</div>
                            <div style={{ fontSize:11, color:C.muted }}>{stop.address}</div>
                          </div>
                          {visitLabel && <span style={{ fontSize:11, color:C.primary, fontWeight:700, background:C.primaryLight, borderRadius:6, padding:"2px 8px" }}>{visitLabel}</span>}
                          <Badge status={visit.status}/>
                        </div>

                        {/* Time info */}
                        {(visit.checkIn || visit.checkOut) && (
                          <div style={{ fontSize:11, color:C.subtle, marginBottom:6, display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                            {visit.checkIn && <span>Entrada: {visit.checkIn}{visit.checkInEdited && <span style={{ color:C.warning }}> ⚠️</span>}</span>}
                            {visit.checkOut && <span>· Salida: {visit.checkOut}{visit.checkOutEdited && <span style={{ color:C.warning }}> ⚠️</span>}</span>}
                          </div>
                        )}

                        {/* Checklist summary */}
                        {visit.checklist && (
                          <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
                            <span style={{ fontSize:11, color:C.success, fontWeight:600 }}>✅ {visit.checklist.filter(c=>c.result==="ok").length} bien</span>
                            {visit.checklist.filter(c=>c.result==="issue").length > 0 &&
                              <span style={{ fontSize:11, color:C.danger, fontWeight:600 }}>❌ {visit.checklist.filter(c=>c.result==="issue").length} observación</span>}
                          </div>
                        )}
                        {visit.generalNotes && <div style={{ fontSize:11, color:C.muted, background:C.bg, borderRadius:7, padding:"4px 8px", marginBottom:6 }}>📝 {visit.generalNotes}</div>}
                        {visit.photos?.length > 0 && (
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
                            {visit.photos.map((p,pi) => <img key={pi} src={p.url} alt="" style={{ width:48, height:48, objectFit:"cover", borderRadius:7, border:`1px solid ${C.border}` }}/>)}
                          </div>
                        )}

                        {/* ── ACTION BUTTONS ── */}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>

                          {/* STEP 1: Just added to today — show Iniciar */}
                          {isToday && (
                            <button onClick={() => startVisit(stop.id, vi)}
                              style={{ ...btn({ background:C.primary, color:"#fff", padding:"9px 18px", fontSize:14 }) }}>
                              ▶ Iniciar
                            </button>
                          )}

                          {/* STEP 2: In progress — show Cerrado + Checklist */}
                          {isInProgress && (
                            <>
                              <button onClick={() => { setModal("closed"); setForm({ stopId:stop.id, visitIdx:vi }); }}
                                style={{ ...btn({ background:C.dangerLight, color:C.danger, padding:"9px 14px", fontSize:13, border:`1px solid ${C.danger}33` }) }}>
                                🔒 Cerrado
                              </button>
                              <button onClick={() => setVisitModal({ stopId:stop.id, visitIdx:vi, mode:"new" })}
                                style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"9px 14px", fontSize:13 }) }}>
                                📋 Abrir Checklist
                              </button>
                            </>
                          )}

                          {/* STEP 3: Done — show Edit + Next visit */}
                          {isFinished && (
                            <>
                              <button onClick={() => setVisitModal({ stopId:stop.id, visitIdx:vi, mode:"edit" })}
                                style={{ ...btn({ background:C.bg, color:C.muted, padding:"8px 13px", fontSize:13, border:`1px solid ${C.border}` }) }}>
                                ✏️ Editar visita {vi > 0 ? `#${vi+1}` : ""}
                              </button>
                              {/* Only show next visit on the LAST visit of this stop */}
                              {vi === visits.length - 1 && (
                                <button onClick={() => addNextVisit(stop.id)}
                                  style={{ ...btn({ background:C.successLight, color:C.success, padding:"8px 13px", fontSize:13 }) }}>
                                  + {visits.length === 1 ? "Segunda visita" : visits.length === 2 ? "Tercera visita" : `Visita #${visits.length+1}`}
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
              <>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8, marginTop:16 }}>Pendientes esta semana ({pendingStops.length})</div>
                {pendingStops.map(stop => (
                  <div key={stop.id} style={{ background:C.surface, borderRadius:12, padding:"11px 14px", marginBottom:6, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, boxShadow:C.shadow }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:"#D1D5DB", flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, color:C.text, fontSize:13 }}>{stop.place}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{stop.address}</div>
                    </div>
                    <button onClick={() => markToday(stop.id)} style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"7px 14px", fontSize:13 }) }}>+ Hoy</button>
                  </div>
                ))}
              </>
            )}

            {pendingStops.length===0 && todayStops.every(s=>["done","closed"].includes(s.status)) && stops.length > 0 && (
              <div style={{ background:C.successLight, border:`1px solid #BBF7D0`, borderRadius:14, padding:24, textAlign:"center", marginTop:10 }}>
                <div style={{ fontSize:36, marginBottom:8 }}>🎉</div>
                <div style={{ fontWeight:800, color:C.success, fontSize:17 }}>¡Semana completada!</div>
              </div>
            )}
          </>
        )}

        {/* Suggestions tab */}
        {navTab === "suggest" && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>💬 Sugerencias</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>Envía sugerencias, errores o mejoras al administrador.</div>
            <div style={{ background:C.surface, borderRadius:16, padding:18, boxShadow:C.shadow }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:8 }}>Tipo</div>
              <div style={{ display:"flex", gap:7, marginBottom:16 }}>
                {["Mejora","Error","Otro"].map(t => (
                  <button key={t} onClick={() => setForm(p=>({...p,type:t}))}
                    style={{ ...btn({ flex:1, padding:"8px 4px", fontSize:13, background:form.type===t?C.primary:C.bg, color:form.type===t?"#fff":C.muted, border:`1.5px solid ${form.type===t?C.primary:C.border}` }) }}>
                    {t==="Mejora"?"💡":t==="Error"?"🐛":"💬"} {t}
                  </button>
                ))}
              </div>
              <textarea value={form.text||""} onChange={e=>setForm(p=>({...p,text:e.target.value}))}
                placeholder="Describe tu sugerencia o el error encontrado..."
                style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"none", minHeight:100, color:C.text, boxSizing:"border-box", marginBottom:14 }}/>
              <button onClick={sendSuggestion} disabled={!form.text?.trim()||!form.type}
                style={{ ...btn({ width:"100%", padding:"12px", fontSize:14, background:form.text?.trim()&&form.type?C.primary:"#D1D5DB", color:"#fff" }) }}>
                Enviar sugerencia
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:C.surface, borderTop:`1px solid ${C.border}`, display:"flex", zIndex:50, boxShadow:"0 -2px 12px rgba(0,0,0,.06)" }}>
        {[{id:"route",icon:"🗺",label:"Mi Ruta"},{id:"suggest",icon:"💬",label:"Sugerencias"}].map(n=>(
          <button key={n.id} onClick={()=>setNavTab(n.id)}
            style={{ ...btn({ flex:1, padding:"10px 4px", background:"none", color:navTab===n.id?C.primary:C.muted, fontSize:10, display:"flex", flexDirection:"column", alignItems:"center", gap:3, borderRadius:0, borderTop:navTab===n.id?`2px solid ${C.primary}`:"2px solid transparent", fontWeight:navTab===n.id?700:500 }) }}>
            <span style={{ fontSize:20 }}>{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      {/* Visit Modal (checklist or edit) */}
      {visitModal && (() => {
        const stop = stops.find(s => s.id === visitModal.stopId);
        const visit = (stop?.visits||[])[visitModal.visitIdx];
        const isEdit = visitModal.mode === "edit";
        return (
          <VisitModal
            visit={isEdit ? visit : null}
            title={isEdit ? `Editar visita${(stop?.visits||[]).length>1?` #${visitModal.visitIdx+1}`:""}` : "Checklist de visita"}
            onSave={data => isEdit ? editVisit(visitModal.stopId, visitModal.visitIdx, data) : completeVisit(visitModal.stopId, visitModal.visitIdx, data)}
            onCancel={() => setVisitModal(null)}
          />
        );
      })()}

      {/* Closed confirm */}
      {modal === "closed" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300, padding:16 }} onClick={()=>setModal(null)}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 16px 16px", padding:24, width:"100%", maxWidth:480, marginBottom:8 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:800, color:C.danger, fontSize:16, marginBottom:6 }}>🔒 Marcar como cerrado</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:20, lineHeight:1.5 }}>¿Confirmas que el establecimiento estaba cerrado al momento de la visita?</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setModal(null)} style={{ ...btn({ flex:1, padding:"11px", background:C.bg, color:C.muted, border:`1px solid ${C.border}`, fontSize:14 }) }}>Cancelar</button>
              <button onClick={()=>markClosed(form.stopId, form.visitIdx)} style={{ ...btn({ flex:2, padding:"11px", background:C.danger, color:"#fff", fontSize:14 }) }}>Sí, estaba cerrado</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
