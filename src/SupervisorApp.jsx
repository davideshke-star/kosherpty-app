import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, updateDoc, addDoc, query, orderBy } from "firebase/firestore";
import { auth, db } from "./firebase";

const STATUS_CFG = {
  pending:      { label: "Pendiente",  color: "#94a3b8", icon: "○" },
  "in-progress":{ label: "En curso",  color: "#f59e0b", icon: "◉" },
  done:         { label: "Completado",color: "#22c55e", icon: "✓" },
  issue:        { label: "Incidencia",color: "#ef4444", icon: "!" },
  skipped:      { label: "Omitido",   color: "#8b5cf6", icon: "—" },
};

const nowStr = () => new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
const todayStr= () => new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});
const btn = (ex={}) => ({padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,...ex});

function Progress({value,color}){
  return <div style={{background:"#0f172a",borderRadius:99,height:8,overflow:"hidden"}}>
    <div style={{width:`${value}%`,background:color,height:"100%",borderRadius:99,transition:"width .6s ease"}}/>
  </div>;
}
function Badge({status}){
  const c=STATUS_CFG[status]||STATUS_CFG.pending;
  return <span style={{fontSize:11,fontWeight:700,color:c.color,background:c.color+"22",border:`1px solid ${c.color}44`,borderRadius:6,padding:"2px 8px"}}>{c.icon} {c.label}</span>;
}

export default function SupervisorApp({ user }) {
  const [supData, setSupData]   = useState(null);  // supervisor profile
  const [stops, setStops]       = useState([]);
  const [modal, setModal]       = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading]   = useState(true);
  const fileRef = useRef();

  useEffect(() => {
    const loadSup = async () => {
      const userDoc = await getDoc(doc(db,"users",user.uid));
      if(!userDoc.exists()) return;
      const supId = userDoc.data().assignedSupId;
      if(!supId) { setLoading(false); return; }
      const supDoc = await getDoc(doc(db,"supervisors",supId));
      if(supDoc.exists()) setSupData({id:supId,...supDoc.data()});

      const unsub = onSnapshot(
        query(collection(db,"supervisors",supId,"stops"), orderBy("order","asc")),
        snap => { setStops(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }
      );
      return unsub;
    };
    loadSup();
  },[user.uid]);

  async function updateStatus(stopId, status){
    const t=nowStr();
    const stop=stops.find(s=>s.id===stopId);
    const updates={status};
    if(status==="in-progress"&&!stop.checkIn) updates.checkIn=t;
    if(["done","issue","skipped"].includes(status)&&stop?.checkIn) updates.checkOut=t;
    await updateDoc(doc(db,"supervisors",supData.id,"stops",stopId),updates);
    await addDoc(collection(db,"history"),{
      time:t, timestamp:Date.now(), supervisor:supData?.name||user.displayName||"",
      supColor:supData?.color||"#64748b", place:stop?.place||"", action:STATUS_CFG[status]?.label||status
    });
  }

  async function saveNote(){
    const {stopId,text}=formData;
    await updateDoc(doc(db,"supervisors",supData.id,"stops",stopId),{notes:text||""});
    setModal(null); setFormData({});
  }

  function handlePhotoUpload(e){
    const files=Array.from(e.target.files);
    files.forEach(file=>{
      const reader=new FileReader();
      reader.onload=async ev=>{
        const stop=stops.find(s=>s.id===formData.stopId);
        const photos=[...(stop?.photos||[]),{url:ev.target.result,name:file.name,time:nowStr()}];
        await updateDoc(doc(db,"supervisors",supData.id,"stops",formData.stopId),{photos});
      };
      reader.readAsDataURL(file);
    });
    setModal(null); setFormData({});
  }

  const done=stops.filter(s=>s.status==="done"||s.status==="skipped").length;
  const pct=stops.length?Math.round(done/stops.length*100):0;
  const color=supData?.color||"#3b82f6";

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0f172a",color:"#64748b",fontFamily:"sans-serif"}}>Cargando tu ruta...</div>;

  if(!supData) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0f172a",fontFamily:"sans-serif",padding:24}}>
      <div style={{fontSize:48,marginBottom:12}}>⏳</div>
      <div style={{fontSize:18,fontWeight:700,color:"#f8fafc",marginBottom:8}}>Sin ruta asignada</div>
      <div style={{fontSize:13,color:"#64748b",textAlign:"center",marginBottom:20}}>El administrador aún no ha asignado tu ruta. Vuelve más tarde.</div>
      <button onClick={()=>signOut(auth)} style={{...btn({background:"#334155",color:"#94a3b8"})}}>Cerrar sesión</button>
    </div>
  );

  return(
    <div style={{fontFamily:"'DM Sans','Segoe UI',sans-serif",background:"#0f172a",minHeight:"100vh",color:"#e2e8f0"}}>

      {/* Header */}
      <div style={{background:"#1e293b",borderBottom:"1px solid #334155",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:38,height:38,borderRadius:10,background:color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,color:"#fff"}}>{supData.avatar}</div>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"#f8fafc"}}>{supData.name}</div>
            <div style={{fontSize:10,color:"#64748b",textTransform:"capitalize"}}>{todayStr()}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:20,fontWeight:800,color:pct===100?"#22c55e":"#f8fafc"}}>{pct}%</div>
          <button onClick={()=>signOut(auth)} style={{...btn({background:"#334155",color:"#94a3b8",padding:"5px 10px",fontSize:11})}}>Salir</button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{padding:"10px 16px 0",maxWidth:600,margin:"0 auto"}}>
        <Progress value={pct} color={color}/>
        <div style={{fontSize:11,color:"#64748b",marginTop:4,textAlign:"right"}}>{done} de {stops.length} paradas</div>
      </div>

      {/* Stops */}
      <div style={{padding:"10px 16px 24px",maxWidth:600,margin:"0 auto",display:"flex",flexDirection:"column",gap:10}}>
        {stops.length===0&&<div style={{textAlign:"center",color:"#64748b",padding:40}}>El administrador aún no ha cargado tus paradas.</div>}
        {stops.map((stop,i)=>{
          const sc=STATUS_CFG[stop.status]||STATUS_CFG.pending;
          const isActive=stop.status==="in-progress";
          return(
            <div key={stop.id} style={{background:"#1e293b",borderRadius:14,padding:16,
              border:`2px solid ${isActive?sc.color:stop.status!=="pending"?sc.color+"44":"#334155"}`,
              boxShadow:isActive?`0 0 20px ${sc.color}33`:"none",transition:"all .3s"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:sc.color+"22",color:sc.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,flexShrink:0}}>{sc.icon}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,color:"#f8fafc",fontSize:15}}>{i+1}. {stop.place}</span>
                    <Badge status={stop.status}/>
                  </div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{stop.address}</div>
                  {(stop.checkIn||stop.checkOut)&&<div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                    {stop.checkIn&&`Entrada: ${stop.checkIn}`}{stop.checkOut&&` · Salida: ${stop.checkOut}`}
                  </div>}
                  {stop.notes&&<div style={{fontSize:12,color:"#fbbf24",background:"#1c1400",borderRadius:6,padding:"5px 9px",marginTop:6}}>📝 {stop.notes}</div>}
                  {stop.photos?.length>0&&<div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                    {stop.photos.map((p,pi)=>(
                      <img key={pi} src={p.url} alt={p.name} style={{width:56,height:56,objectFit:"cover",borderRadius:8,border:"1px solid #334155"}}/>
                    ))}
                  </div>}

                  {/* Action buttons */}
                  <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                    {stop.status==="pending"&&
                      <button onClick={()=>updateStatus(stop.id,"in-progress")}
                        style={{...btn({background:"#d97706",color:"#fff",fontSize:14,padding:"9px 18px"})}}>▶ Iniciar</button>}
                    {stop.status==="in-progress"&&<>
                      <button onClick={()=>updateStatus(stop.id,"done")}
                        style={{...btn({background:"#16a34a",color:"#fff",fontSize:14,padding:"9px 18px"})}}>✓ Completar</button>
                      <button onClick={()=>updateStatus(stop.id,"issue")}
                        style={{...btn({background:"#dc2626",color:"#fff"})}}>⚠ Incidencia</button>
                    </>}
                    {stop.status==="pending"&&
                      <button onClick={()=>updateStatus(stop.id,"skipped")}
                        style={{...btn({background:"#334155",color:"#94a3b8"})}}>— Omitir</button>}
                    {["done","issue","skipped"].includes(stop.status)&&
                      <button onClick={()=>updateStatus(stop.id,"pending")}
                        style={{...btn({background:"#334155",color:"#94a3b8"})}}>↩ Reiniciar</button>}
                    <button onClick={()=>{setModal("note");setFormData({stopId:stop.id,text:stop.notes||""});}}
                      style={{...btn({background:"#1c1400",color:"#fbbf24"})}}>📝 Nota</button>
                    <button onClick={()=>{setModal("photo");setFormData({stopId:stop.id});}}
                      style={{...btn({background:"#0c1a2e",color:"#60a5fa"})}}>📷 Foto</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {pct===100&&stops.length>0&&(
          <div style={{background:"#052e16",border:"1px solid #22c55e",borderRadius:14,padding:20,textAlign:"center",marginTop:8}}>
            <div style={{fontSize:36,marginBottom:6}}>🎉</div>
            <div style={{fontWeight:800,color:"#22c55e",fontSize:18}}>¡Ruta completada!</div>
            <div style={{color:"#86efac",fontSize:13,marginTop:4}}>Todas las paradas del día han sido atendidas.</div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}
          onClick={()=>{setModal(null);setFormData({});}}>
          <div style={{background:"#1e293b",borderRadius:16,padding:22,width:"100%",maxWidth:380,border:"1px solid #334155"}}
            onClick={e=>e.stopPropagation()}>

            {modal==="note"&&<>
              <div style={{fontWeight:800,color:"#f8fafc",marginBottom:10}}>📝 Agregar nota</div>
              <textarea value={formData.text||""} onChange={e=>setFormData(p=>({...p,text:e.target.value}))}
                placeholder="Describe lo encontrado..."
                style={{width:"100%",minHeight:90,background:"#0f172a",border:"1px solid #334155",borderRadius:10,color:"#f8fafc",padding:12,fontSize:14,resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:10}}/>
              <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
                <button onClick={()=>setModal(null)} style={{...btn({background:"#334155",color:"#94a3b8"})}}>Cancelar</button>
                <button onClick={saveNote} style={{...btn({background:"#3b82f6",color:"#fff"})}}>Guardar</button>
              </div>
            </>}

            {modal==="photo"&&<>
              <div style={{fontWeight:800,color:"#f8fafc",marginBottom:12}}>📷 Adjuntar foto</div>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoUpload} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current.click()}
                style={{...btn({background:"#1d4ed8",color:"#fff",padding:"14px",fontSize:14,width:"100%",textAlign:"center"})}}>
                📷 Tomar foto / Seleccionar imagen
              </button>
              <button onClick={()=>setModal(null)} style={{...btn({background:"#334155",color:"#94a3b8",marginTop:10,width:"100%"})}}>Cancelar</button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
