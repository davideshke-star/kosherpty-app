import { useState } from "react";
import { CHECKLIST_ITEMS, C, btn } from "./constants";

export default function ChecklistModal({ onSave, onCancel, title = "Completar visita" }) {
  const [checks, setChecks] = useState({}); // { itemId: "ok" | "issue" | null }
  const [notes, setNotes]   = useState({});  // { itemId: text } — only for issues
  const [general, setGeneral] = useState(""); // general notes

  function toggle(id, val) {
    setChecks(prev => ({ ...prev, [id]: prev[id] === val ? null : val }));
    if (val === "ok") setNotes(prev => ({ ...prev, [id]: "" }));
  }

  function canSave() {
    // At least one item must be checked
    return Object.values(checks).some(v => v === "ok" || v === "issue");
  }

  function handleSave() {
    const checklist = CHECKLIST_ITEMS.map(item => ({
      id: item.id,
      label: item.label,
      result: checks[item.id] || "unchecked",
      note: notes[item.id] || "",
    }));
    onSave({ checklist, generalNotes: general });
  }

  const checked = Object.values(checks).filter(v => v === "ok").length;
  const issues  = Object.values(checks).filter(v => v === "issue").length;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:300, padding:0 }}>
      <div style={{ background:C.surface, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:540, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
        {/* Header */}
        <div style={{ padding:"20px 20px 0", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>{title}</div>
            <button onClick={onCancel} style={{ ...btn({ background:C.bg, color:C.muted, padding:"5px 10px", fontSize:12, border:`1px solid ${C.border}` }) }}>Cancelar</button>
          </div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>Marca cada ítem revisado. ✅ = Bien · ❌ = Con problema</div>
          {/* Stats bar */}
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            <div style={{ flex:1, background:C.successLight, borderRadius:8, padding:"6px 10px", fontSize:11, fontWeight:700, color:C.success }}>✅ {checked} bien</div>
            <div style={{ flex:1, background:C.dangerLight,  borderRadius:8, padding:"6px 10px", fontSize:11, fontWeight:700, color:C.danger  }}>❌ {issues} problema{issues!==1?"s":""}</div>
            <div style={{ flex:1, background:C.surfaceAlt,   borderRadius:8, padding:"6px 10px", fontSize:11, fontWeight:700, color:C.muted   }}>⬜ {CHECKLIST_ITEMS.length-checked-issues} sin revisar</div>
          </div>
        </div>

        {/* Scrollable list */}
        <div style={{ overflowY:"auto", padding:"0 20px", flex:1 }}>
          {CHECKLIST_ITEMS.map(item => {
            const val = checks[item.id];
            const isOk    = val === "ok";
            const isIssue = val === "issue";
            return (
              <div key={item.id} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:isOk?C.successLight:isIssue?C.dangerLight:C.bg, borderRadius:12, padding:"10px 12px", border:`1px solid ${isOk?C.success+"33":isIssue?C.danger+"33":C.border}`, transition:"all .15s" }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>
                  <span style={{ flex:1, fontSize:13, fontWeight:600, color:C.text }}>{item.label}</span>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => toggle(item.id, "ok")}
                      style={{ ...btn({ width:36, height:36, fontSize:16, background:isOk?"#059669":"#fff", color:isOk?"#fff":"#6B7280", border:`1.5px solid ${isOk?C.success:C.border}`, borderRadius:10, padding:0 }) }}>
                      ✓
                    </button>
                    <button onClick={() => toggle(item.id, "issue")}
                      style={{ ...btn({ width:36, height:36, fontSize:16, background:isIssue?"#DC2626":"#fff", color:isIssue?"#fff":"#6B7280", border:`1.5px solid ${isIssue?C.danger:C.border}`, borderRadius:10, padding:0 }) }}>
                      ✕
                    </button>
                  </div>
                </div>
                {isIssue && (
                  <textarea
                    value={notes[item.id]||""} onChange={e=>setNotes(p=>({...p,[item.id]:e.target.value}))}
                    placeholder="Describe el problema encontrado..."
                    style={{ width:"100%", marginTop:4, border:`1.5px solid ${C.danger}44`, borderRadius:10, padding:"8px 12px", fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"none", minHeight:60, color:C.text, background:C.dangerLight, boxSizing:"border-box" }}
                  />
                )}
              </div>
            );
          })}

          {/* General notes */}
          <div style={{ marginTop:4, marginBottom:4 }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:6 }}>Notas adicionales <span style={{ fontWeight:400 }}>(opcional)</span></div>
            <textarea value={general} onChange={e=>setGeneral(e.target.value)}
              placeholder="Observaciones generales de la visita..."
              style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none", resize:"none", minHeight:72, color:C.text, background:C.surface, boxSizing:"border-box" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 20px 20px", flexShrink:0, borderTop:`1px solid ${C.border}` }}>
          <button onClick={handleSave} disabled={!canSave()}
            style={{ ...btn({ width:"100%", padding:"13px", fontSize:15, background:canSave()?C.primary:"#D1D5DB", color:"#fff", opacity:canSave()?1:.7 }) }}>
            Guardar visita
          </button>
        </div>
      </div>
    </div>
  );
}
