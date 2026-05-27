import { useState } from "react";
import { CHECKLIST_ITEMS, C, btn } from "./constants";

export default function ChecklistModal({ checkInTime, existingData, isEditing, onSave, onCancel }) {
  // Initialize from existing data when editing
  const initChecks = () => {
    const c = {};
    (existingData?.checklist || []).forEach(item => {
      c[item.id] = item.result === "ok" ? "ok" : item.result === "issue" ? "issue" : null;
    });
    return c;
  };
  const initNotes = () => {
    const n = {};
    (existingData?.checklist || []).forEach(item => { if (item.note) n[item.id] = item.note; });
    return n;
  };

  const [checks,    setChecks]    = useState(initChecks);
  const [notes,     setNotes]     = useState(initNotes);
  const [general,   setGeneral]   = useState(existingData?.generalNotes || "");
  const [editIn,    setEditIn]    = useState(existingData?.checkIn  || "");
  const [editOut,   setEditOut]   = useState(existingData?.checkOut || "");
  const [showTime,  setShowTime]  = useState(false);

  function toggle(id, val) {
    setChecks(p => ({ ...p, [id]: p[id] === val ? null : val }));
    if (val === "ok") setNotes(p => ({ ...p, [id]: "" }));
  }

  const okCount    = Object.values(checks).filter(v => v === "ok").length;
  const issueCount = Object.values(checks).filter(v => v === "issue").length;
  const canSave    = okCount + issueCount > 0;

  function handleSave() {
    if (!canSave) return;
    const now = new Date().toLocaleTimeString("es-MX", { hour:"2-digit", minute:"2-digit" });
    const checklist = CHECKLIST_ITEMS.map(item => ({
      id:     item.id,
      label:  item.label,
      result: checks[item.id] || "unchecked",
      note:   notes[item.id]  || "",
    }));
    onSave({
      checklist,
      generalNotes:   general,
      // checkIn: when editing use edited value, when new use the time from Iniciar (never current time)
      checkIn:        isEditing ? (editIn || existingData?.checkIn) : checkInTime,
      checkOut:       isEditing ? (editOut || now) : now,
      checkInEdited:  isEditing && editIn  !== existingData?.checkIn,
      checkOutEdited: isEditing && editOut !== existingData?.checkOut,
    });
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:400 }}>
      <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:540, maxHeight:"92vh", display:"flex", flexDirection:"column", boxShadow:"0 -8px 32px rgba(0,0,0,.12)" }}>

        {/* Header */}
        <div style={{ padding:"20px 20px 0", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:C.text }}>
                {isEditing ? "Editar visita" : "Checklist de visita"}
              </div>
              {!isEditing && checkInTime && (
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                  Entrada registrada: <strong style={{ color:C.primary }}>{checkInTime}</strong>
                </div>
              )}
            </div>
            <button onClick={onCancel}
              style={{ background:"#F4F6F9", border:"none", borderRadius:8, padding:"6px 14px", fontSize:13, fontWeight:600, color:C.muted, cursor:"pointer" }}>
              Cancelar
            </button>
          </div>

          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:12 }}>
            {[
              { val:okCount,    label:"OK",          bg:"#ECFDF5", color:"#059669" },
              { val:issueCount, label:"Problema",    bg:"#FEF2F2", color:"#DC2626" },
              { val:CHECKLIST_ITEMS.length-okCount-issueCount, label:"Sin revisar", bg:"#F8FAFC", color:"#9CA3AF" },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:"7px 10px", textAlign:"center" }}>
                <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:10, color:s.color, fontWeight:600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Time editing — only when editing */}
          {isEditing && (
            <div style={{ background:"#FEF3C7", borderRadius:10, padding:"8px 12px", marginBottom:12, border:"1px solid #FDE68A" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#92400E" }}>
                  ⏱ {editIn||"—"} → {editOut||"—"}
                  {(editIn!==existingData?.checkIn||editOut!==existingData?.checkOut) && <span style={{ color:"#DC2626" }}> ⚠️ editado</span>}
                </div>
                <button onClick={() => setShowTime(!showTime)}
                  style={{ background:"#D97706", border:"none", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700, color:"#fff", cursor:"pointer" }}>
                  {showTime ? "Cerrar" : "Editar horario"}
                </button>
              </div>
              {showTime && (
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  {[["ENTRADA",editIn,setEditIn],["SALIDA",editOut,setEditOut]].map(([lbl,val,setter]) => (
                    <div key={lbl} style={{ flex:1 }}>
                      <div style={{ fontSize:10, fontWeight:600, color:"#92400E", marginBottom:3 }}>{lbl}</div>
                      <input type="time" value={val} onChange={e => setter(e.target.value)}
                        style={{ width:"100%", border:"1.5px solid #E4E9F0", borderRadius:8, padding:"7px 10px", fontSize:14, outline:"none" }}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable checklist */}
        <div style={{ overflowY:"auto", padding:"0 20px", flex:1 }}>
          {CHECKLIST_ITEMS.map(item => {
            const val     = checks[item.id];
            const isOk    = val === "ok";
            const isIssue = val === "issue";
            return (
              <div key={item.id} style={{ marginBottom:7 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:isOk?"#ECFDF5":isIssue?"#FEF2F2":"#F8FAFC", borderRadius:12, padding:"10px 12px", border:`1.5px solid ${isOk?"#6EE7B7":isIssue?"#FCA5A5":"#E4E9F0"}`, transition:"all .15s" }}>
                  <span style={{ fontSize:17, flexShrink:0 }}>{item.icon}</span>
                  <span style={{ flex:1, fontSize:13, fontWeight:600, color:C.text }}>{item.label}</span>
                  <button onClick={() => toggle(item.id,"ok")}
                    style={{ width:36, height:36, borderRadius:9, border:`1.5px solid ${isOk?"#059669":"#D1D5DB"}`, background:isOk?"#059669":"#fff", color:isOk?"#fff":"#9CA3AF", fontSize:17, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✓</button>
                  <button onClick={() => toggle(item.id,"issue")}
                    style={{ width:36, height:36, borderRadius:9, border:`1.5px solid ${isIssue?"#DC2626":"#D1D5DB"}`, background:isIssue?"#DC2626":"#fff", color:isIssue?"#fff":"#9CA3AF", fontSize:17, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
                </div>
                {isIssue && (
                  <textarea value={notes[item.id]||""} onChange={e => setNotes(p=>({...p,[item.id]:e.target.value}))}
                    placeholder="Describe el problema..."
                    style={{ width:"100%", marginTop:4, border:"1.5px solid #FCA5A5", borderRadius:10, padding:"8px 12px", fontSize:12, outline:"none", resize:"none", minHeight:52, color:C.text, background:"#FEF9F9", boxSizing:"border-box" }}/>
                )}
              </div>
            );
          })}

          <div style={{ marginTop:10, marginBottom:8 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:6 }}>
              Notas adicionales o incidentes <span style={{ fontWeight:400, color:C.subtle }}>— opcional</span>
            </div>
            <textarea value={general} onChange={e => setGeneral(e.target.value)}
              placeholder="Observaciones generales..."
              style={{ width:"100%", border:"1.5px solid #E4E9F0", borderRadius:12, padding:"10px 12px", fontSize:13, outline:"none", resize:"none", minHeight:72, color:C.text, boxSizing:"border-box", lineHeight:1.6 }}/>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 20px 24px", flexShrink:0, borderTop:"1px solid #F1F5F9" }}>
          <button onClick={handleSave} disabled={!canSave}
            style={{ width:"100%", padding:"14px", fontSize:15, fontWeight:700, background:canSave?"linear-gradient(135deg,#1D4ED8,#1E40AF)":"#E5E7EB", color:canSave?"#fff":"#9CA3AF", border:"none", borderRadius:13, cursor:canSave?"pointer":"not-allowed", boxShadow:canSave?"0 4px 12px rgba(29,78,216,.3)":"none" }}>
            {isEditing ? "Guardar cambios" : "Completar visita"}
          </button>
        </div>
      </div>
    </div>
  );
}
