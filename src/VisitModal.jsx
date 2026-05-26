import { useState, useRef } from "react";
import { CHECKLIST_ITEMS, C, btn, nowStr } from "./constants";

// VisitModal handles both new checklist fill and editing an existing visit
export default function VisitModal({ visit, onSave, onCancel, title = "Checklist de visita" }) {
  const existing = visit || {};

  // Init from existing visit if editing
  const initChecks = () => {
    const c = {};
    (existing.checklist||[]).forEach(item => { c[item.id] = item.result === "ok" ? "ok" : item.result === "issue" ? "issue" : null; });
    return c;
  };
  const initNotes = () => {
    const n = {};
    (existing.checklist||[]).forEach(item => { if (item.note) n[item.id] = item.note; });
    return n;
  };

  const [checks, setChecks]       = useState(initChecks);
  const [itemNotes, setItemNotes] = useState(initNotes);
  const [general, setGeneral]     = useState(existing.generalNotes || "");
  const [photos, setPhotos]       = useState(existing.photos || []);
  const [checkIn, setCheckIn]     = useState(existing.checkIn || "");
  const [checkOut, setCheckOut]   = useState(existing.checkOut || "");
  const [editingTime, setEditingTime] = useState(false);
  const fileRef = useRef();

  const isEditing = !!existing.checklist;

  function toggle(id, val) {
    setChecks(prev => ({ ...prev, [id]: prev[id] === val ? null : val }));
    if (val === "ok") setItemNotes(prev => ({ ...prev, [id]: "" }));
  }

  function handlePhoto(e) {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setPhotos(prev => [...prev, { url: ev.target.result, name: file.name, time: nowStr() }]);
      reader.readAsDataURL(file);
    });
  }

  function removePhoto(idx) {
    setPhotos(prev => prev.filter((_,i) => i !== idx));
  }

  const canSave = Object.values(checks).some(v => v === "ok" || v === "issue");
  const okCount = Object.values(checks).filter(v => v === "ok").length;
  const issueCount = Object.values(checks).filter(v => v === "issue").length;

  const timeEdited = isEditing && (checkIn !== existing.checkIn || checkOut !== existing.checkOut);

  function handleSave() {
    const checklist = CHECKLIST_ITEMS.map(item => ({
      id: item.id, label: item.label,
      result: checks[item.id] || "unchecked",
      note: itemNotes[item.id] || "",
    }));
    onSave({
      checklist,
      generalNotes: general,
      photos,
      checkIn: checkIn || existing.checkIn || nowStr(),
      checkOut: checkOut || existing.checkOut || null,
      checkInEdited: isEditing && checkIn !== existing.checkIn,
      checkOutEdited: isEditing && checkOut !== existing.checkOut,
    });
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:400 }}>
      <div style={{ background:C.surface, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:560, maxHeight:"93vh", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ padding:"18px 18px 0", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>{title}</div>
            <button onClick={onCancel} style={{ ...btn({ background:C.bg, color:C.muted, padding:"5px 12px", fontSize:12, border:`1px solid ${C.border}` }) }}>Cancelar</button>
          </div>

          {/* Stats */}
          <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            <div style={{ flex:1, background:C.successLight, borderRadius:8, padding:"5px 8px", fontSize:11, fontWeight:700, color:C.success }}>✅ {okCount} bien</div>
            <div style={{ flex:1, background:C.dangerLight,  borderRadius:8, padding:"5px 8px", fontSize:11, fontWeight:700, color:C.danger  }}>❌ {issueCount} problema{issueCount!==1?"s":""}</div>
            <div style={{ flex:1, background:C.surfaceAlt,   borderRadius:8, padding:"5px 8px", fontSize:11, fontWeight:700, color:C.muted   }}>⬜ {CHECKLIST_ITEMS.length-okCount-issueCount} sin revisar</div>
          </div>

          {/* Time editing (only in edit mode) */}
          {isEditing && (
            <div style={{ background:C.amberLight, borderRadius:10, padding:"8px 12px", marginBottom:10, border:`1px solid ${C.amber}33` }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.amber }}>⏱ Horario de visita</div>
                <button onClick={() => setEditingTime(!editingTime)} style={{ ...btn({ background:C.amber, color:"#fff", padding:"3px 10px", fontSize:11 }) }}>{editingTime?"Cerrar":"Editar"}</button>
              </div>
              {!editingTime && <div style={{ fontSize:11, color:C.amber, marginTop:3 }}>Entrada: {checkIn||"—"} · Salida: {checkOut||"—"}{timeEdited&&" ⚠️ Editado"}</div>}
              {editingTime && (
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:3, fontWeight:600 }}>ENTRADA</div>
                    <input type="time" value={checkIn} onChange={e=>setCheckIn(e.target.value)}
                      style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"6px 8px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none" }}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:3, fontWeight:600 }}>SALIDA</div>
                    <input type="time" value={checkOut} onChange={e=>setCheckOut(e.target.value)}
                      style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"6px 8px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none" }}/>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY:"auto", padding:"0 18px", flex:1 }}>
          {CHECKLIST_ITEMS.map(item => {
            const val = checks[item.id];
            const isOk = val === "ok"; const isIssue = val === "issue";
            return (
              <div key={item.id} style={{ marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, background:isOk?C.successLight:isIssue?C.dangerLight:C.bg, borderRadius:12, padding:"9px 12px", border:`1px solid ${isOk?C.success+"33":isIssue?C.danger+"33":C.border}`, transition:"all .15s" }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
                  <span style={{ flex:1, fontSize:13, fontWeight:600, color:C.text }}>{item.label}</span>
                  <button onClick={() => toggle(item.id, "ok")}
                    style={{ ...btn({ width:34, height:34, fontSize:15, background:isOk?C.success:"#fff", color:isOk?"#fff":"#9CA3AF", border:`1.5px solid ${isOk?C.success:C.border}`, borderRadius:9, padding:0 }) }}>✓</button>
                  <button onClick={() => toggle(item.id, "issue")}
                    style={{ ...btn({ width:34, height:34, fontSize:15, background:isIssue?C.danger:"#fff", color:isIssue?"#fff":"#9CA3AF", border:`1.5px solid ${isIssue?C.danger:C.border}`, borderRadius:9, padding:0 }) }}>✕</button>
                </div>
                {isIssue && (
                  <textarea value={itemNotes[item.id]||""} onChange={e=>setItemNotes(p=>({...p,[item.id]:e.target.value}))}
                    placeholder="Describe el problema..."
                    style={{ width:"100%", marginTop:4, border:`1.5px solid ${C.danger}44`, borderRadius:10, padding:"8px 12px", fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"none", minHeight:56, color:C.text, background:C.dangerLight, boxSizing:"border-box" }}/>
                )}
              </div>
            );
          })}

          {/* Photos */}
          <div style={{ marginTop:8, marginBottom:6 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted }}>Fotos</div>
              <button onClick={() => fileRef.current.click()} style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"5px 12px", fontSize:12 }) }}>📷 Agregar foto</button>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhoto} style={{ display:"none" }}/>
            </div>
            {photos.length > 0 && (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                {photos.map((p,i) => (
                  <div key={i} style={{ position:"relative" }}>
                    <img src={p.url} alt="" style={{ width:60, height:60, objectFit:"cover", borderRadius:9, border:`1px solid ${C.border}` }}/>
                    <button onClick={() => removePhoto(i)}
                      style={{ position:"absolute", top:-5, right:-5, background:C.danger, border:"none", borderRadius:"50%", width:18, height:18, color:"#fff", cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* General notes */}
          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:6 }}>Notas adicionales o incidentes <span style={{ fontWeight:400 }}>(opcional)</span></div>
            <textarea value={general} onChange={e=>setGeneral(e.target.value)}
              placeholder="Observaciones generales, incidentes, o notas adicionales de esta visita..."
              style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"none", minHeight:72, color:C.text, background:C.surface, boxSizing:"border-box" }}/>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 18px 20px", flexShrink:0, borderTop:`1px solid ${C.border}` }}>
          <button onClick={handleSave} disabled={!canSave}
            style={{ ...btn({ width:"100%", padding:"13px", fontSize:15, background:canSave?C.primary:"#D1D5DB", color:"#fff" }) }}>
            {isEditing ? "Guardar cambios" : "Completar visita"}
          </button>
        </div>
      </div>
    </div>
  );
}
