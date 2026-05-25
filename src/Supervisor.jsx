import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, updateDoc, addDoc, query, orderBy } from "firebase/firestore";
import { auth, db } from "./firebase";
import { APP_NAME } from "./App";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:"#F7F8FA", surface:"#FFFFFF", border:"#E8ECF0",
  primary:"#2563EB", primaryLight:"#EFF6FF",
  success:"#16A34A", successLight:"#F0FDF4",
  warning:"#D97706", warningLight:"#FFFBEB",
  danger:"#DC2626", dangerLight:"#FEF2F2",
  purple:"#7C3AED", purpleLight:"#F5F3FF",
  text:"#0F172A", muted:"#64748B", subtle:"#94A3B8",
};

const STATUS = {
  pending:      { label:"Pendiente",   color:C.muted,    bg:C.bg,           dot:"#CBD5E1" },
  today:        { label:"Para hoy",    color:C.primary,  bg:C.primaryLight, dot:C.primary },
  "in-progress":{ label:"En curso",   color:C.warning,  bg:C.warningLight, dot:C.warning },
  done:         { label:"Completado", color:C.success,  bg:C.successLight, dot:C.success },
  issue:        { label:"Incidencia", color:C.danger,   bg:C.dangerLight,  dot:C.danger  },
  skipped:      { label:"Omitido",    color:C.purple,   bg:C.purpleLight,  dot:C.purple  },
};

const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

const nowStr  = () => new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
const todayName = () => DAYS[new Date().getDay()===0?6:new Date().getDay()-1];
const weekRange = () => {
  const d = new Date(), day = d.getDay(), diff = d.getDate()-day+(day===0?-6:1);
  const mon = new Date(d.setDate(diff));
  const fri = new Date(mon); fri.setDate(mon.getDate()+4);
  return `${mon.getDate()}/${mon.getMonth()+1} — ${fri.getDate()}/${fri.getMonth()+1}`;
};

const s = (extra={}) => ({ fontFamily:"Inter,sans-serif", ...extra });
const btn = (extra={}) => ({ border:"none", cursor:"pointer", fontFamily:"Inter,sans-serif", fontWeight:600, borderRadius:10, ...extra });

function Badge({ status }) {
  const st = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.bg, borderRadius:6, padding:"3px 9px", whiteSpace:"nowrap" }}>{st.label}</span>;
}

function Ring({ pct, color, size=56 }) {
  const r=20, circ=2*Math.PI*r, dash=circ*(pct/100);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke={C.border} strokeWidth="4"/>
      <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 24 24)" style={{transition:"stroke-dasharray .5s ease"}}/>
      <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.text} fontFamily="Inter,sans-serif">{pct}%</text>
    </svg>
  );
}

export default function Supervisor({ user }) {
  const [supData, setSupData] = useState(null);
  const [stops, setStops]     = useState([]);
  const [modal, setModal]     = useState(null); // {type, stopId}
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading] = useState(true);
  const fileRef = useRef();

  const today = todayName();

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const userDoc = await getDoc(doc(db,"users",user.uid));
      if (!userDoc.exists()) { setLoading(false); return; }
      const supId = userDoc.data().assignedSupId;
      if (!supId) { setLoading(false); return; }
      const supDoc = await getDoc(doc(db,"supervisors",supId));
      if (supDoc.exists()) setSupData({id:supId,...supDoc.data()});
      unsub = onSnapshot(query(collection(db,"supervisors",supId,"stops"),orderBy("order","asc")), snap => {
        setStops(snap.docs.map(d=>({id:d.id,...d.data()})));
        setLoading(false);
      });
    })();
    return () => unsub();
  }, [user.uid]);

  async function markToday(stopId) {
    await updateDoc(doc(db,"supervisors",supData.id,"stops",stopId),{ status:"today", scheduledDay: today });
  }
  async function unmarkToday(stopId) {
    await updateDoc(doc(db,"supervisors",supData.id,"stops",stopId),{ status:"pending", scheduledDay: null });
  }
  async function updateStatus(stopId, status) {
    const t = nowStr();
    const stop = stops.find(s=>s.id===stopId);
    const updates = { status };
    if (status==="in-progress" && !stop.checkIn) updates.checkIn = t;
    if (["done","issue","skipped"].includes(status) && stop?.checkIn) updates.checkOut = t;
    await updateDoc(doc(db,"supervisors",supData.id,"stops",stopId), updates);
    await addDoc(collection(db,"history"),{
      time:t, timestamp:Date.now(),
      supervisor: supData?.name||"", supColor: supData?.color||C.primary,
      place: stop?.place||"", action: STATUS[status]?.label||status
    });
  }
  async function saveNote() {
    await updateDoc(doc(db,"supervisors",supData.id,"stops",modal.stopId),{ notes: noteText });
    setModal(null); setNoteText("");
  }
  function handlePhoto(e) {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async ev => {
        const stop = stops.find(s=>s.id===modal.stopId);
        const photos = [...(stop?.photos||[]),{url:ev.target.result,name:file.name,time:nowStr()}];
        await updateDoc(doc(db,"supervisors",supData.id,"stops",modal.stopId),{photos});
      };
      reader.readAsDataURL(file);
    });
    setModal(null);
  }

  const todayStops    = stops.filter(s=>["today","in-progress","done","issue","skipped"].includes(s.status) && (s.scheduledDay===today || ["in-progress","done","issue","skipped"].includes(s.status)));
  const pendingStops  = stops.filter(s=>s.status==="pending");
  const doneCount     = stops.filter(s=>s.status==="done"||s.status==="skipped").length;
  const pct           = stops.length ? Math.round(doneCount/stops.length*100) : 0;
  const color         = supData?.color || C.primary;
  const todayDone     = todayStops.filter(s=>s.status==="done"||s.status==="skipped").length;

  if (loading) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif",color:C.muted}}>Cargando...</div>;

  if (!supData) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif",padding:24}}>
      <div style={{fontSize:48,marginBottom:16}}>📋</div>
      <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:8}}>Sin ruta asignada</div>
      <div style={{fontSize:13,color:C.muted,textAlign:"center",marginBottom:24}}>El administrador aún no ha asignado tu ruta.</div>
      <button onClick={()=>signOut(auth)} style={{...btn({background:C.primary,color:"#fff",padding:"11px 24px",fontSize:14})}}>Cerrar sesión</button>
    </div>
  );

  return (
    <div style={s({background:C.bg,minHeight:"100vh"})}>
      {/* Header */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:"#fff",flexShrink:0}}>{supData.avatar}</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:C.text}}>{supData.name}</div>
            <div style={{fontSize:11,color:C.muted}}>Semana {weekRange()}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Ring pct={pct} color={color} size={44}/>
          <button onClick={()=>signOut(auth)} style={{...btn({background:C.bg,color:C.muted,padding:"7px 12px",fontSize:12,border:`1px solid ${C.border}`})}}>Salir</button>
        </div>
      </div>

      <div style={{padding:"16px 16px 80px",maxWidth:600,margin:"0 auto"}}>

        {/* Today summary pill */}
        <div style={{background:color,borderRadius:14,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.75)",fontWeight:500}}>HOY — {today.toUpperCase()}</div>
            <div style={{fontSize:16,fontWeight:700,color:"#fff",marginTop:2}}>{todayDone} de {todayStops.length} paradas completadas</div>
          </div>
          <div style={{fontSize:28,fontWeight:800,color:"rgba(255,255,255,.9)"}}>{todayStops.length ? Math.round(todayDone/todayStops.length*100) : 0}%</div>
        </div>

        {/* TODAY STOPS */}
        {todayStops.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Para hoy</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {todayStops.map((stop,i) => {
                const st = STATUS[stop.status]||STATUS.pending;
                return (
                  <div key={stop.id} style={{background:C.surface,borderRadius:14,padding:16,border:`1px solid ${stop.status==="in-progress"?C.warning:C.border}`,boxShadow:stop.status==="in-progress"?`0 0 0 3px ${C.warningLight}`:"none"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:st.dot,flexShrink:0,marginTop:6}}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                          <span style={{fontWeight:700,color:C.text,fontSize:15}}>{stop.place}</span>
                          <Badge status={stop.status}/>
                        </div>
                        <div style={{fontSize:12,color:C.muted}}>{stop.address}</div>
                        {(stop.checkIn||stop.checkOut)&&<div style={{fontSize:11,color:C.subtle,marginTop:3}}>{stop.checkIn&&`Entrada: ${stop.checkIn}`}{stop.checkOut&&` · Salida: ${stop.checkOut}`}</div>}
                        {stop.notes&&<div style={{fontSize:12,color:C.warning,background:C.warningLight,borderRadius:8,padding:"6px 10px",marginTop:8}}>📝 {stop.notes}</div>}
                        {stop.photos?.length>0&&<div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>{stop.photos.map((p,pi)=><img key={pi} src={p.url} alt="" style={{width:54,height:54,objectFit:"cover",borderRadius:8,border:`1px solid ${C.border}`}}/>)}</div>}

                        {/* Actions */}
                        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                          {stop.status==="today"&&<button onClick={()=>updateStatus(stop.id,"in-progress")} style={{...btn({background:C.primary,color:"#fff",padding:"8px 16px",fontSize:13})}}>▶ Iniciar</button>}
                          {stop.status==="in-progress"&&<>
                            <button onClick={()=>updateStatus(stop.id,"done")} style={{...btn({background:C.success,color:"#fff",padding:"8px 16px",fontSize:13})}}>✓ Completar</button>
                            <button onClick={()=>updateStatus(stop.id,"issue")} style={{...btn({background:C.danger,color:"#fff",padding:"8px 14px",fontSize:13})}}>⚠ Incidencia</button>
                          </>}
                          {["today","in-progress"].includes(stop.status)&&<button onClick={()=>updateStatus(stop.id,"skipped")} style={{...btn({background:C.bg,color:C.muted,padding:"8px 12px",fontSize:13,border:`1px solid ${C.border}`})}}>Omitir</button>}
                          {["done","issue","skipped"].includes(stop.status)&&<button onClick={()=>updateStatus(stop.id,"today")} style={{...btn({background:C.bg,color:C.muted,padding:"8px 12px",fontSize:13,border:`1px solid ${C.border}`})}}>↩ Reiniciar</button>}
                          <button onClick={()=>{setModal({type:"note",stopId:stop.id});setNoteText(stop.notes||"");}} style={{...btn({background:C.bg,color:C.warning,padding:"8px 12px",fontSize:13,border:`1px solid ${C.border}`})}}>📝</button>
                          <button onClick={()=>setModal({type:"photo",stopId:stop.id})} style={{...btn({background:C.bg,color:C.primary,padding:"8px 12px",fontSize:13,border:`1px solid ${C.border}`})}}>📷</button>
                          {stop.status!=="in-progress"&&<button onClick={()=>unmarkToday(stop.id)} style={{...btn({background:C.bg,color:C.subtle,padding:"8px 10px",fontSize:12,border:`1px solid ${C.border}`})}}>✕</button>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PENDING - add to today */}
        {pendingStops.length > 0 && (
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Pendientes esta semana ({pendingStops.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {pendingStops.map(stop => (
                <div key={stop.id} style={{background:C.surface,borderRadius:12,padding:"12px 16px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:"#CBD5E1",flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,color:C.text,fontSize:14}}>{stop.place}</div>
                    <div style={{fontSize:12,color:C.muted}}>{stop.address}</div>
                  </div>
                  <button onClick={()=>markToday(stop.id)} style={{...btn({background:C.primaryLight,color:C.primary,padding:"7px 14px",fontSize:13,whiteSpace:"nowrap"})}}>+ Hoy</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All done */}
        {pendingStops.length===0&&todayStops.every(s=>["done","skipped"].includes(s.status))&&stops.length>0&&(
          <div style={{background:C.successLight,border:`1px solid #BBF7D0`,borderRadius:14,padding:24,textAlign:"center",marginTop:8}}>
            <div style={{fontSize:36,marginBottom:8}}>🎉</div>
            <div style={{fontWeight:700,color:C.success,fontSize:18}}>¡Semana completada!</div>
            <div style={{color:"#15803D",fontSize:13,marginTop:4}}>Todas las paradas han sido atendidas.</div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,padding:16}} onClick={()=>setModal(null)}>
          <div style={{background:C.surface,borderRadius:20,padding:24,width:"100%",maxWidth:480,marginBottom:8}} onClick={e=>e.stopPropagation()}>
            {modal.type==="note"&&<>
              <div style={{fontWeight:700,color:C.text,fontSize:16,marginBottom:12}}>📝 Nota de parada</div>
              <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Describe lo encontrado..."
                style={{width:"100%",minHeight:100,border:`1.5px solid ${C.border}`,borderRadius:12,padding:12,fontSize:14,fontFamily:"Inter,sans-serif",outline:"none",resize:"vertical",boxSizing:"border-box",color:C.text}}/>
              <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"flex-end"}}>
                <button onClick={()=>setModal(null)} style={{...btn({background:C.bg,color:C.muted,padding:"10px 20px",border:`1px solid ${C.border}`})}}>Cancelar</button>
                <button onClick={saveNote} style={{...btn({background:C.primary,color:"#fff",padding:"10px 20px"})}}>Guardar</button>
              </div>
            </>}
            {modal.type==="photo"&&<>
              <div style={{fontWeight:700,color:C.text,fontSize:16,marginBottom:16}}>📷 Adjuntar foto</div>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current.click()} style={{...btn({background:C.primary,color:"#fff",padding:"14px",fontSize:15,width:"100%",textAlign:"center"})}}>Tomar foto / Seleccionar imagen</button>
              <button onClick={()=>setModal(null)} style={{...btn({background:C.bg,color:C.muted,padding:"12px",fontSize:14,width:"100%",textAlign:"center",marginTop:8,border:`1px solid ${C.border}`})}}>Cancelar</button>
            </>}
          </div>
        </div>
      )}
      <input ref={modal?.type==="photo"?undefined:fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handlePhoto}/>
    </div>
  );
}
