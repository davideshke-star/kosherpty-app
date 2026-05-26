import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, updateDoc, addDoc, query, orderBy } from "firebase/firestore";
import { auth, db } from "./firebase";
import { APP_NAME, APP_SUB, C, STATUS, btn, nowStr, todayName, weekRange, initials } from "./constants";
import ChecklistModal from "./ChecklistModal";

function Badge({ status }) {
  const st = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.color+"18", borderRadius:6, padding:"3px 9px", whiteSpace:"nowrap" }}>{st.label}</span>;
}

function Ring({ pct, color, size=48 }) {
  const r=18, circ=2*Math.PI*r, dash=circ*(pct/100);
  return (
    <svg width={size} height={size} viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke={C.border} strokeWidth="3.5"/>
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 22 22)"
        style={{transition:"stroke-dasharray .5s ease"}}/>
      <text x="22" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill={C.text} fontFamily="'DM Sans',sans-serif">{pct}%</text>
    </svg>
  );
}

export default function Supervisor({ user }) {
  const [supData, setSupData]   = useState(null);
  const [stops, setStops]       = useState([]);
  const [modal, setModal]       = useState(null); // {type, stopId, visitIdx}
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({});
  const [navTab, setNavTab]     = useState("route"); // route | suggest
  const fileRef = useRef();
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
        snap => { setStops(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }
      );
    })();
    return () => unsub();
  }, [user.uid]);

  // ── Visit helpers ──────────────────────────────────────────────────────────
  async function markToday(stopId) {
    const stop = stops.find(s => s.id === stopId);
    const visits = stop.visits || [];
    // Add a fresh visit slot for today
    const newVisit = { idx: visits.length, status: "today", scheduledDay: today, checkIn: null, checkOut: null, checklist: null, generalNotes: "", incidencia: "", reporte: "" };
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), {
      status: "today", scheduledDay: today,
      visits: [...visits, newVisit]
    });
  }

  async function startVisit(stopId, visitIdx) {
    const t = nowStr();
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    visits[visitIdx] = { ...visits[visitIdx], status: "in-progress", checkIn: t };
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), { status: "in-progress", visits });
  }

  async function startVisitManual(stopId, visitIdx, manualTime) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    visits[visitIdx] = { ...visits[visitIdx], status: "in-progress", checkIn: manualTime, checkInManual: true };
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), { status: "in-progress", visits });
    setModal(null); setForm({});
  }

  async function completeVisit(stopId, visitIdx, checklistData) {
    const t = nowStr();
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    const hasIssue = checklistData.checklist.some(c => c.result === "issue");
    visits[visitIdx] = { ...visits[visitIdx], status: hasIssue ? "issue" : "done", checkOut: t, ...checklistData };
    // Overall stop status = done if all visits done/issue, else in-progress
    const allDone = visits.every(v => ["done","issue","skipped"].includes(v.status));
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), { status: allDone ? (hasIssue?"issue":"done") : "in-progress", visits });
    await addDoc(collection(db, "history"), {
      time: t, timestamp: Date.now(),
      supervisor: supData?.name || "", supColor: supData?.color || C.primary,
      place: stop?.place || "", action: hasIssue ? "Completado con incidencias" : "Completado"
    });
    setModal(null);
  }

  async function addIncidencia(stopId, visitIdx, text) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    visits[visitIdx] = { ...visits[visitIdx], incidencia: text };
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), { visits });
    setModal(null); setForm({});
  }

  async function addReporte(stopId, visitIdx, text) {
    const stop = stops.find(s => s.id === stopId);
    const visits = [...(stop.visits || [])];
    visits[visitIdx] = { ...visits[visitIdx], reporte: text };
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), { visits });
    setModal(null); setForm({});
  }

  async function addSecondVisit(stopId) {
    const stop = stops.find(s => s.id === stopId);
    const visits = stop.visits || [];
    const newVisit = { idx: visits.length, status: "today", scheduledDay: today, checkIn: null, checkOut: null, checklist: null, generalNotes: "", incidencia: "", reporte: "" };
    await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), { visits: [...visits, newVisit] });
  }

  async function handlePhoto(e) {
    const { stopId } = form;
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async ev => {
        const stop = stops.find(s => s.id === stopId);
        const photos = [...(stop?.photos || []), { url: ev.target.result, name: file.name, time: nowStr() }];
        await updateDoc(doc(db, "supervisors", supData.id, "stops", stopId), { photos });
      };
      reader.readAsDataURL(file);
    });
    setModal(null); setForm({});
  }

  async function sendSuggestion() {
    if (!form.text?.trim()) return;
    await addDoc(collection(db, "suggestions"), {
      uid: user.uid, name: supData?.name || user.displayName || "",
      type: form.type || "Mejora", text: form.text.trim(),
      status: "pending", createdAt: Date.now(),
      timestamp: new Date().toISOString()
    });
    setForm({}); setNavTab("route");
    alert("¡Sugerencia enviada! El administrador la revisará.");
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const todayStops   = stops.filter(s => ["today","in-progress","done","issue","skipped"].includes(s.status));
  const pendingStops = stops.filter(s => s.status === "pending");
  const doneCount    = stops.filter(s => ["done","issue","skipped"].includes(s.status)).length;
  const pct          = stops.length ? Math.round(doneCount / stops.length * 100) : 0;
  const color        = supData?.color || C.primary;
  const todayDone    = todayStops.filter(s => ["done","issue","skipped"].includes(s.status)).length;

  if (loading) return <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontFamily:"'DM Sans',sans-serif" }}>Cargando...</div>;

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
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:C.primary, textTransform:"uppercase", letterSpacing:1.2 }}>{APP_NAME}</div>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{APP_SUB}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Ring pct={pct} color={color} size={42}/>
          <button onClick={() => signOut(auth)} style={{ ...btn({ background:C.bg, color:C.muted, padding:"6px 12px", fontSize:12, border:`1px solid ${C.border}` }) }}>Salir</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding:"14px 16px 90px", maxWidth:600, margin:"0 auto" }}>

        {navTab === "route" && (
          <>
            {/* Supervisor pill */}
            <div style={{ background:color, borderRadius:14, padding:"13px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 4px 16px ${color}44` }}>
              <div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.7)", fontWeight:600, textTransform:"uppercase", letterSpacing:.8 }}>{supData.name} — {today}</div>
                <div style={{ fontSize:15, fontWeight:700, color:"#fff", marginTop:2 }}>{todayDone} de {todayStops.length} paradas completadas hoy</div>
              </div>
              <div style={{ fontSize:22, fontWeight:800, color:"rgba(255,255,255,.9)" }}>{todayStops.length ? Math.round(todayDone/todayStops.length*100) : 0}%</div>
            </div>

            {/* Today stops */}
            {todayStops.length > 0 && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Para hoy</div>
                {todayStops.map(stop => {
                  const visits = stop.visits || [];
                  const activeVisit = visits[visits.length - 1];
                  const visitIdx = visits.length - 1;
                  const st = STATUS[stop.status] || STATUS.pending;
                  return (
                    <div key={stop.id} style={{ background:C.surface, borderRadius:14, padding:14, marginBottom:8, border:`1px solid ${stop.status==="in-progress"?C.warning+"66":C.border}`, boxShadow:stop.status==="in-progress"?`0 0 0 3px ${C.warningLight}`:C.shadow }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:st.dot, flexShrink:0, marginTop:6 }}/>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:3 }}>
                            <span style={{ fontWeight:700, color:C.text, fontSize:14 }}>{stop.place}</span>
                            <Badge status={stop.status}/>
                            {visits.length > 1 && <span style={{ fontSize:11, color:C.primary, fontWeight:600 }}>#{visits.length}ª visita</span>}
                          </div>
                          <div style={{ fontSize:11, color:C.muted }}>{stop.address}</div>

                          {/* Visit info */}
                          {activeVisit?.checkIn && (
                            <div style={{ fontSize:11, color:C.subtle, marginTop:3, display:"flex", alignItems:"center", gap:4 }}>
                              Entrada: {activeVisit.checkIn}
                              {activeVisit.checkInManual && <span style={{ color:C.warning, fontSize:10, fontWeight:600 }}>⚠ Manual</span>}
                              {activeVisit.checkOut && ` · Salida: ${activeVisit.checkOut}`}
                            </div>
                          )}

                          {/* Checklist summary */}
                          {activeVisit?.checklist && (
                            <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
                              <span style={{ fontSize:11, color:C.success, fontWeight:600 }}>✅ {activeVisit.checklist.filter(c=>c.result==="ok").length} bien</span>
                              {activeVisit.checklist.filter(c=>c.result==="issue").length>0 &&
                                <span style={{ fontSize:11, color:C.danger, fontWeight:600 }}>❌ {activeVisit.checklist.filter(c=>c.result==="issue").length} problema</span>}
                            </div>
                          )}

                          {/* Incidencia / Reporte badges */}
                          {activeVisit?.incidencia && <div style={{ fontSize:11, color:C.danger, background:C.dangerLight, borderRadius:7, padding:"4px 8px", marginTop:5 }}>⚠️ {activeVisit.incidencia}</div>}
                          {activeVisit?.reporte    && <div style={{ fontSize:11, color:C.primary, background:C.primaryLight, borderRadius:7, padding:"4px 8px", marginTop:4 }}>📋 {activeVisit.reporte}</div>}

                          {/* Photos */}
                          {stop.photos?.length > 0 && (
                            <div style={{ display:"flex", gap:5, marginTop:6, flexWrap:"wrap" }}>
                              {stop.photos.map((p,pi) => <img key={pi} src={p.url} alt="" style={{ width:50, height:50, objectFit:"cover", borderRadius:8, border:`1px solid ${C.border}` }}/>)}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div style={{ display:"flex", gap:5, marginTop:10, flexWrap:"wrap" }}>
                            {activeVisit?.status === "today" && <>
                              <button onClick={() => startVisit(stop.id, visitIdx)} style={{ ...btn({ background:C.primary, color:"#fff", padding:"8px 14px", fontSize:13 }) }}>▶ Iniciar</button>
                              <button onClick={() => { setModal("manualTime"); setForm({ stopId: stop.id, visitIdx, time: nowStr() }); }} style={{ ...btn({ background:C.bg, color:C.muted, padding:"8px 10px", fontSize:12, border:`1px solid ${C.border}` }) }}>⏱ Manual</button>
                            </>}
                            {activeVisit?.status === "in-progress" && <>
                              <button onClick={() => setModal({ type:"checklist", stopId: stop.id, visitIdx })} style={{ ...btn({ background:C.success, color:"#fff", padding:"8px 14px", fontSize:13 }) }}>✓ Completar</button>
                            </>}
                            {["done","issue"].includes(activeVisit?.status) && <>
                              <button onClick={() => addSecondVisit(stop.id)} style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"7px 12px", fontSize:12 }) }}>+ 2ª visita</button>
                            </>}
                            {["in-progress","done","issue"].includes(activeVisit?.status) && <>
                              <button onClick={() => { setModal("incidencia"); setForm({ stopId: stop.id, visitIdx, text: activeVisit.incidencia || "" }); }} style={{ ...btn({ background:C.dangerLight, color:C.danger, padding:"7px 11px", fontSize:12 }) }}>⚠️ Incidencia</button>
                              <button onClick={() => { setModal("reporte"); setForm({ stopId: stop.id, visitIdx, text: activeVisit.reporte || "" }); }} style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"7px 11px", fontSize:12 }) }}>📋 Reporte</button>
                            </>}
                            <button onClick={() => { setForm({ stopId: stop.id }); setModal("photo"); }} style={{ ...btn({ background:C.bg, color:C.muted, padding:"7px 10px", fontSize:12, border:`1px solid ${C.border}` }) }}>📷</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
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

            {/* All done */}
            {pendingStops.length === 0 && todayStops.every(s => ["done","issue","skipped"].includes(s.status)) && stops.length > 0 && (
              <div style={{ background:C.successLight, border:`1px solid #BBF7D0`, borderRadius:14, padding:24, textAlign:"center", marginTop:10 }}>
                <div style={{ fontSize:36, marginBottom:8 }}>🎉</div>
                <div style={{ fontWeight:800, color:C.success, fontSize:17 }}>¡Semana completada!</div>
                <div style={{ color:"#15803D", fontSize:13, marginTop:4 }}>Todas las paradas han sido atendidas.</div>
              </div>
            )}
          </>
        )}

        {/* Suggestions tab */}
        {navTab === "suggest" && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>💬 Sugerencias</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:18, lineHeight:1.5 }}>Envía sugerencias, errores o mejoras al administrador.</div>
            <div style={{ background:C.surface, borderRadius:16, padding:18, boxShadow:C.shadow }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:6 }}>Tipo</div>
              <div style={{ display:"flex", gap:7, marginBottom:16 }}>
                {["Mejora","Error","Otro"].map(t => (
                  <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))}
                    style={{ ...btn({ flex:1, padding:"8px 4px", fontSize:13, background:form.type===t?C.primary:C.bg, color:form.type===t?"#fff":C.muted, border:`1.5px solid ${form.type===t?C.primary:C.border}` }) }}>
                    {t==="Mejora"?"💡":t==="Error"?"🐛":"💬"} {t}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:6 }}>Descripción</div>
              <textarea value={form.text||""} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
                placeholder="Describe detalladamente tu sugerencia o el error encontrado..."
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
        {[
          { id:"route",   icon:"🗺", label:"Mi Ruta" },
          { id:"suggest", icon:"💬", label:"Sugerencias" },
        ].map(n => (
          <button key={n.id} onClick={() => setNavTab(n.id)}
            style={{ ...btn({ flex:1, padding:"10px 4px", background:"none", color:navTab===n.id?C.primary:C.muted, fontSize:10, display:"flex", flexDirection:"column", alignItems:"center", gap:3, borderRadius:0, borderTop:navTab===n.id?`2px solid ${C.primary}`:"2px solid transparent", fontWeight:navTab===n.id?700:500 }) }}>
            <span style={{ fontSize:20 }}>{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      {/* ── MODALS ── */}

      {/* Checklist modal */}
      {modal?.type === "checklist" && (
        <ChecklistModal
          title="Completar visita"
          onSave={data => completeVisit(modal.stopId, modal.visitIdx, data)}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Manual time */}
      {modal === "manualTime" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300, padding:16 }} onClick={() => setModal(null)}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 16px 16px", padding:24, width:"100%", maxWidth:480, marginBottom:8 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, color:C.text, fontSize:16, marginBottom:4 }}>⏱ Marcar entrada manualmente</div>
            <div style={{ fontSize:12, color:C.warning, background:C.warningLight, borderRadius:8, padding:"6px 10px", marginBottom:14 }}>⚠️ Esta entrada quedará marcada como "Hora manual" en el registro.</div>
            <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:6 }}>Hora de entrada</div>
            <input type="time" value={form.time||""} onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
              style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 12px", fontSize:16, fontFamily:"'DM Sans',sans-serif", outline:"none", marginBottom:16, boxSizing:"border-box" }}/>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setModal(null)} style={{ ...btn({ flex:1, padding:"11px", background:C.bg, color:C.muted, border:`1px solid ${C.border}`, fontSize:14 }) }}>Cancelar</button>
              <button onClick={() => startVisitManual(form.stopId, form.visitIdx, form.time)} style={{ ...btn({ flex:2, padding:"11px", background:C.primary, color:"#fff", fontSize:14 }) }}>Confirmar entrada</button>
            </div>
          </div>
        </div>
      )}

      {/* Incidencia */}
      {modal === "incidencia" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300, padding:16 }} onClick={() => setModal(null)}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 16px 16px", padding:24, width:"100%", maxWidth:480, marginBottom:8 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, color:C.danger, fontSize:16, marginBottom:4 }}>⚠️ Registrar incidencia</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>Describe el problema o incidencia específica ocurrida en esta visita.</div>
            <textarea value={form.text||""} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
              placeholder="Ej: El establecimiento no tenía el mashgiaj presente al momento de la revisión..."
              style={{ width:"100%", border:`1.5px solid ${C.danger}55`, borderRadius:12, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"none", minHeight:90, color:C.text, background:C.dangerLight, boxSizing:"border-box", marginBottom:14 }}/>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setModal(null)} style={{ ...btn({ flex:1, padding:"11px", background:C.bg, color:C.muted, border:`1px solid ${C.border}`, fontSize:14 }) }}>Cancelar</button>
              <button onClick={() => addIncidencia(form.stopId, form.visitIdx, form.text)} style={{ ...btn({ flex:2, padding:"11px", background:C.danger, color:"#fff", fontSize:14 }) }}>Guardar incidencia</button>
            </div>
          </div>
        </div>
      )}

      {/* Reporte */}
      {modal === "reporte" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300, padding:16 }} onClick={() => setModal(null)}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 16px 16px", padding:24, width:"100%", maxWidth:480, marginBottom:8 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, color:C.primary, fontSize:16, marginBottom:4 }}>📋 Registrar reporte</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>Describe el reporte específico de esta visita.</div>
            <textarea value={form.text||""} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
              placeholder="Ej: Se realizó revisión completa de ingredientes, todo en orden. Se instruyó al personal sobre..."
              style={{ width:"100%", border:`1.5px solid ${C.primary}55`, borderRadius:12, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"none", minHeight:90, color:C.text, background:C.primaryLight, boxSizing:"border-box", marginBottom:14 }}/>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setModal(null)} style={{ ...btn({ flex:1, padding:"11px", background:C.bg, color:C.muted, border:`1px solid ${C.border}`, fontSize:14 }) }}>Cancelar</button>
              <button onClick={() => addReporte(form.stopId, form.visitIdx, form.text)} style={{ ...btn({ flex:2, padding:"11px", background:C.primary, color:"#fff", fontSize:14 }) }}>Guardar reporte</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo */}
      {modal === "photo" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300, padding:16 }} onClick={() => setModal(null)}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 16px 16px", padding:24, width:"100%", maxWidth:480, marginBottom:8 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, color:C.text, fontSize:16, marginBottom:14 }}>📷 Adjuntar foto</div>
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhoto} style={{ display:"none" }}/>
            <button onClick={() => fileRef.current.click()} style={{ ...btn({ width:"100%", padding:"14px", fontSize:15, background:C.primary, color:"#fff" }) }}>Tomar foto / Seleccionar imagen</button>
            <button onClick={() => setModal(null)} style={{ ...btn({ width:"100%", padding:"12px", fontSize:14, background:C.bg, color:C.muted, marginTop:8, border:`1px solid ${C.border}` }) }}>Cancelar</button>
          </div>
        </div>
      )}

      <input ref={modal==="photo"?undefined:fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={handlePhoto}/>
    </div>
  );
}
