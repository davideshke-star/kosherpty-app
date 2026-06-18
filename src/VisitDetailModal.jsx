import { C, btn, STATUS } from "./constants";

export default function VisitDetailModal({ stop, visit, visitNum, totalVisits, onClose }) {
  const okItems    = (visit.checklist||[]).filter(c=>c.result==="ok");
  const issueItems = (visit.checklist||[]).filter(c=>c.result==="issue");
  const st = STATUS[visit.status] || STATUS.pending;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:400 }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:540, maxHeight:"88vh", display:"flex", flexDirection:"column" }} onClick={e=>e.stopPropagation()}>

        <div style={{ padding:"20px 20px 14px", flexShrink:0, borderBottom:"1px solid #F1F5F9" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:6 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:C.text }}>{stop.place}</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{stop.address}</div>
            </div>
            <button onClick={onClose} style={{ background:"#F4F6F9", border:"none", borderRadius:8, padding:"6px 14px", fontSize:13, fontWeight:600, color:C.muted, cursor:"pointer" }}>Cerrar</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.color+"18", borderRadius:6, padding:"3px 9px" }}>{st.label}</span>
            {totalVisits>1 && <span style={{ fontSize:11, color:C.primary, fontWeight:700, background:C.primaryLight, borderRadius:6, padding:"3px 9px" }}>Visita #{visitNum} de {totalVisits}</span>}
            {visit.date && <span style={{ fontSize:11, color:C.subtle }}>{visit.date}</span>}
          </div>
        </div>

        <div style={{ overflowY:"auto", padding:"16px 20px", flex:1 }}>
          {(visit.checkIn || visit.checkOut) && (
            <div style={{ display:"flex", gap:10, marginBottom:16 }}>
              <div style={{ flex:1, background:"#F8FAFC", borderRadius:10, padding:"10px 12px" }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:600, textTransform:"uppercase" }}>Entrada</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.text, marginTop:2 }}>
                  {visit.checkIn||"—"}{visit.checkInEdited && <span style={{ color:"#D97706", fontSize:12 }}> ⚠️ editado</span>}
                </div>
              </div>
              <div style={{ flex:1, background:"#F8FAFC", borderRadius:10, padding:"10px 12px" }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:600, textTransform:"uppercase" }}>Salida</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.text, marginTop:2 }}>
                  {visit.checkOut||"—"}{visit.checkOutEdited && <span style={{ color:"#D97706", fontSize:12 }}> ⚠️ editado</span>}
                </div>
              </div>
            </div>
          )}

          {visit.checklist && (
            <>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:.6, marginBottom:8 }}>Checklist revisado</div>
              {visit.checklist.map(c => {
                if (c.result === "unchecked") return null;
                const ok = c.result === "ok";
                return (
                  <div key={c.id} style={{ marginBottom:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9, background:ok?"#ECFDF5":"#FEF2F2", borderRadius:10, padding:"8px 11px" }}>
                      <span style={{ fontSize:15 }}>{c.icon || (ok?"✅":"❌")}</span>
                      <span style={{ flex:1, fontSize:13, fontWeight:600, color:C.text }}>{c.label}</span>
                      <span style={{ fontSize:14 }}>{ok?"✅":"❌"}</span>
                    </div>
                    {c.note && <div style={{ fontSize:12, color:"#DC2626", background:"#FEF9F9", borderRadius:8, padding:"6px 10px", marginTop:4 }}>{c.note}</div>}
                  </div>
                );
              })}
              {okItems.length===0 && issueItems.length===0 && (
                <div style={{ fontSize:13, color:C.subtle, textAlign:"center", padding:16 }}>No se revisó ningún ítem en esta visita.</div>
              )}
            </>
          )}

          {visit.generalNotes && (
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:.6, marginBottom:6 }}>Notas adicionales</div>
              <div style={{ fontSize:13, color:C.text, background:"#F8FAFC", borderRadius:10, padding:"10px 12px", lineHeight:1.6 }}>{visit.generalNotes}</div>
            </div>
          )}

          {visit.status === "closed" && (
            <div style={{ marginTop:14, fontSize:13, color:"#DC2626", fontWeight:600, background:"#FEF2F2", borderRadius:10, padding:"10px 12px" }}>
              🔒 El establecimiento estaba cerrado en esta visita.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
