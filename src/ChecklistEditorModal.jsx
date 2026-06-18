import { useState } from "react";
import { C, btn } from "./constants";

let tempIdCounter = 0;
function makeId(label) {
  const base = (label||"item").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"") || "item";
  tempIdCounter += 1;
  return `${base}_${Date.now()}_${tempIdCounter}`;
}

export default function ChecklistEditorModal({ title, items, onSave, onCancel, extraAction }) {
  const [list, setList]   = useState(items.map(i => ({ ...i })));
  const [newLabel, setNewLabel] = useState("");

  function updateLabel(idx, val) {
    setList(prev => prev.map((it,i) => i===idx ? { ...it, label:val } : it));
  }
  function removeItem(idx) {
    setList(prev => prev.filter((_,i)=>i!==idx));
  }
  function addItem() {
    if (!newLabel.trim()) return;
    setList(prev => [...prev, { id: makeId(newLabel), label: newLabel.trim(), icon: "📋" }]);
    setNewLabel("");
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:450 }}>
      <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:540, maxHeight:"90vh", display:"flex", flexDirection:"column" }}>

        <div style={{ padding:"20px 20px 12px", flexShrink:0, borderBottom:"1px solid #F1F5F9" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>{title}</div>
            <button onClick={onCancel} style={{ background:"#F4F6F9", border:"none", borderRadius:8, padding:"6px 14px", fontSize:13, fontWeight:600, color:C.muted, cursor:"pointer" }}>Cancelar</button>
          </div>
          <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>{list.length} ítems en este checklist.</div>
        </div>

        <div style={{ overflowY:"auto", padding:"14px 20px", flex:1 }}>
          {list.map((item, idx) => (
            <div key={item.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#F8FAFC", borderRadius:11, padding:"9px 11px", marginBottom:7 }}>
              <span style={{ fontSize:16, flexShrink:0 }}>{item.icon||"📋"}</span>
              <input value={item.label} onChange={e=>updateLabel(idx,e.target.value)}
                style={{ flex:1, border:"1.5px solid #E4E9F0", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", background:"#fff" }}/>
              <button onClick={()=>removeItem(idx)} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"7px 10px", fontSize:13 }) }}>🗑</button>
            </div>
          ))}

          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <input value={newLabel} onChange={e=>setNewLabel(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); addItem(); } }}
              placeholder="Nuevo ítem del checklist..."
              style={{ flex:1, border:"1.5px solid #E4E9F0", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none" }}/>
            <button onClick={addItem} style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"9px 16px", fontSize:13 }) }}>+ Agregar</button>
          </div>

          {extraAction && (
            <button onClick={extraAction.onClick}
              style={{ ...btn({ background:"#FFFBEB", color:"#D97706", padding:"10px", width:"100%", fontSize:13, marginTop:16, border:"1px solid #FDE68A" }) }}>
              {extraAction.label}
            </button>
          )}
        </div>

        <div style={{ padding:"12px 20px 22px", flexShrink:0, borderTop:"1px solid #F1F5F9" }}>
          <button onClick={()=>onSave(list)} disabled={list.length===0}
            style={{ ...btn({ width:"100%", padding:"13px", fontSize:15, background:list.length?C.primary:"#E5E7EB", color:"#fff" }) }}>
            Guardar checklist
          </button>
        </div>
      </div>
    </div>
  );
}
