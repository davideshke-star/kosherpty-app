import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { signOut } from "firebase/auth";
import {
  collection, doc, onSnapshot, setDoc, updateDoc,
  deleteDoc, addDoc, getDocs, query, orderBy, where, writeBatch
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  APP_NAME, APP_SUB, C, COLORS, STATUS, btn,
  nowStr, dateStr, weekRange, initials, minAgo, normalizeName, estQrUrl
} from "./constants";
import { LogoIcon, LogoText } from "./Logo";
import { getGlobalChecklist, saveGlobalChecklist } from "./checklistStore";
import { buildWeeklyReportText } from "./reportBuilder";
import VisitDetailModal from "./VisitDetailModal";
import ChecklistEditorModal from "./ChecklistEditorModal";
import QRCodeModal from "./QRCodeModal";

function Badge({ status }) {
  const st = STATUS[status] || STATUS.pending;
  return <span style={{ fontSize:11, fontWeight:600, color:st.color, background:st.color+"18", borderRadius:6, padding:"3px 9px", whiteSpace:"nowrap" }}>{st.label}</span>;
}

function Ring({ pct, color, size=50 }) {
  const r=18, circ=2*Math.PI*r, dash=circ*(pct/100);
  return (
    <svg width={size} height={size} viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#E4E9F0" strokeWidth="3.5"/>
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 22 22)"
        style={{ transition:"stroke-dasharray .5s" }}/>
      <text x="22" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0F172A" fontFamily="'DM Sans',sans-serif">{pct}%</text>
    </svg>
  );
}

function downloadText(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));
  a.download = filename;
  a.click();
}

function exportCSV(supervisors, routes) {
  const rows = [["Supervisor","Establecimiento","Dirección","Estado","Visita","Fecha","Entrada","EntradaEditada","Salida","SalidaEditada","CheckOK","CheckProblemas","Notas"]];
  supervisors.forEach(sup => {
    (routes[sup.id]||[]).forEach(stop => {
      const visits = stop.visits||[];
      if (!visits.length) {
        rows.push([sup.name, stop.place, stop.address, STATUS[stop.status]?.label||stop.status, ...Array(9).fill("—")]);
      } else {
        visits.forEach((v,i) => {
          const ok  = (v.checklist||[]).filter(c=>c.result==="ok").map(c=>c.label).join("; ");
          const bad = (v.checklist||[]).filter(c=>c.result==="issue").map(c=>`${c.label}${c.note?": "+c.note:""}`).join("; ");
          rows.push([sup.name, stop.place, stop.address, STATUS[v.status]?.label||v.status, i+1, v.date||"—", v.checkIn||"—", v.checkInEdited?"⚠️Sí":"No", v.checkOut||"—", v.checkOutEdited?"⚠️Sí":"No", ok||"—", bad||"—", v.generalNotes||"—"]);
        });
      }
    });
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  a.download = `KosherShevet_${dateStr().replace(/\//g,"-")}.csv`;
  a.click();
}

const THIRTY_DAYS_MS = 30*24*60*60*1000;

export default function Admin({ user }) {
  const [supervisors,   setSupervisors]   = useState([]);
  const [routes,        setRoutes]        = useState({});
  const [allUsers,      setAllUsers]      = useState([]);
  const [suggestions,   setSuggestions]   = useState([]);
  const [historyLog,    setHistoryLog]    = useState([]);
  const [reports,       setReports]       = useState([]);
  const [alerts,        setAlerts]        = useState([]);
  const [checklistItems,setChecklistItems]= useState([]);
  const [tab,           setTab]           = useState("dashboard");
  const [selectedSup,   setSelectedSup]   = useState(null);
  const [modal,         setModal]         = useState(null);
  const [form,          setForm]          = useState({});
  const [detailVisit,   setDetailVisit]   = useState(null);
  const [stopChecklistEditor, setStopChecklistEditor] = useState(null);
  const [qrModal, setQrModal] = useState(null); // { stop, supervisorName }
  const [scanInfo, setScanInfo] = useState(null); // admin QR-test confirmation
  const scanChecked = useRef(false);

  // ── Firestore listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const u1 = onSnapshot(collection(db,"supervisors"), snap => setSupervisors(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(collection(db,"users"), snap => setAllUsers(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u3 = onSnapshot(query(collection(db,"history"),orderBy("timestamp","desc")), snap => setHistoryLog(snap.docs.map(d=>({id:d.id,...d.data()})).slice(0,150)));
    const u4 = onSnapshot(query(collection(db,"suggestions"),orderBy("createdAt","desc")), snap => {
      const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
      setSuggestions(docs);
      docs.forEach(s => { if (s.createdAt && Date.now()-s.createdAt > THIRTY_DAYS_MS) deleteDoc(doc(db,"suggestions",s.id)); });
    });
    const u5 = onSnapshot(query(collection(db,"reports"),orderBy("generatedAt","desc")), snap => setReports(snap.docs.map(d=>({id:d.id,...d.data()}))));
    getGlobalChecklist().then(setChecklistItems);
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  useEffect(() => {
    if (!supervisors.length) return;
    const unsubs = supervisors.map(sup =>
      onSnapshot(query(collection(db,"supervisors",sup.id,"stops"),orderBy("order","asc")), snap => {
        const stopsList = snap.docs.map(d=>({id:d.id,...d.data()}));
        setRoutes(prev => ({ ...prev, [sup.id]: stopsList }));
        // Migration safety net: under the old model a stop's top-level status
        // could be stuck at "closed". That's now purely historical (tracked
        // per-visit), so normalize any leftover ones back to pending.
        stopsList.forEach(stop => {
          if (stop.status === "closed") {
            updateDoc(doc(db,"supervisors",sup.id,"stops",stop.id), { status:"pending" });
          }
        });
      })
    );
    return () => unsubs.forEach(u=>u());
  }, [supervisors]);

  useEffect(() => {
    const check = () => {
      supervisors.forEach(sup => {
        (routes[sup.id]||[]).forEach(stop => {
          const active = (stop.visits||[]).find(v=>v.status==="in-progress");
          if (active?.checkIn && !stop.alertSent && minAgo(active.checkIn) >= 30) {
            setAlerts(prev => [{supId:sup.id, supName:sup.name, place:stop.place, minutes:minAgo(active.checkIn)}, ...prev].slice(0,20));
            updateDoc(doc(db,"supervisors",sup.id,"stops",stop.id), { alertSent:true });
          }
        });
      });
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [routes, supervisors]);

  // Admin QR-test aid: if the admin opens a …/?est=<establishment> link, identify
  // which establishment it maps to and who has it in their route (without changing
  // any state — recording only happens for supervisors/mashguijim).
  useEffect(() => {
    if (scanChecked.current) return;
    const estName = new URLSearchParams(window.location.search).get("est");
    if (!estName) return;
    const target = normalizeName(estName);
    const allStops = Object.entries(routes).flatMap(([supId, list]) =>
      (list||[]).map(st => ({ ...st, supId })));
    const matches = allStops.filter(st => normalizeName(st.place) === target);
    if (matches.length === 0 && allStops.length === 0) return; // routes not loaded yet
    scanChecked.current = true;
    const whoNames = [...new Set(matches.map(m => supervisors.find(s => s.id === m.supId)?.name).filter(Boolean))];
    setScanInfo(matches.length
      ? { ok:true, place:matches[0].place, who:whoNames }
      : { ok:false });
    const params = new URLSearchParams(window.location.search);
    params.delete("est");
    window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?"+params.toString() : ""));
  }, [routes, supervisors]);

  // ── History logging for admin's own actions ──────────────────────────────
  async function logAdmin(place, action) {
    await addDoc(collection(db,"history"), {
      time: nowStr(), timestamp: Date.now(),
      supervisor: "👑 Admin", supColor: C.primary,
      place, action
    });
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  const getProgress = supId => {
    const stops = routes[supId]||[];
    if (!stops.length) return { done:0, total:0, pct:0 };
    const done = stops.filter(s=>s.status==="done").length;
    return { done, total:stops.length, pct:Math.round(done/stops.length*100) };
  };

  // ── Supervisor CRUD ───────────────────────────────────────────────────────
  async function addSupervisor() {
    if (!form.name?.trim()) return;
    const tier = form.tier === "mashgiaj" ? "mashgiaj" : "supervisor";
    const ref = doc(collection(db,"supervisors"));
    await setDoc(ref, { name:form.name.trim(), avatar:initials(form.name), color:form.color||COLORS[0], email:form.email||"", tier, createdAt:Date.now() });
    setRoutes(prev => ({ ...prev, [ref.id]:[] }));
    await logAdmin(form.name.trim(), tier==="mashgiaj" ? "Agregó mashgiaj" : "Agregó supervisor");
    closeModal();
  }

  async function editSupervisor() {
    const tier = form.tier === "mashgiaj" ? "mashgiaj" : "supervisor";
    await updateDoc(doc(db,"supervisors",form.id), { name:form.name.trim(), avatar:initials(form.name), color:form.color, email:form.email||"", tier });
    await logAdmin(form.name.trim(), "Editó " + (tier==="mashgiaj" ? "mashgiaj" : "supervisor"));
    closeModal();
  }

  // One-time setup: creates the four mashguijim with their routes. Idempotent —
  // skips any that already exist (by name + mashgiaj tier). Copies each stop's
  // address from an existing same-named establishment when one is found.
  async function seedMashguijim() {
    const plan = [
      { name:"Matti",            places:["Grilla","Olivetta"] },
      { name:"Bernie",           places:["Grilla","Olivetta"] },
      { name:"Yaakov Dayan",     places:["Kava","Aria"] },
      { name:"Isaac Benzaquen",  places:["Kava","Aria"] },
    ];
    const existingMash = supervisors.filter(s => s.tier === "mashgiaj").map(s => normalizeName(s.name));
    const toCreate = plan.filter(p => !existingMash.includes(normalizeName(p.name)));
    if (toCreate.length === 0) { alert("Los mashguijim ya están creados."); return; }
    if (!confirm(`Se crearán ${toCreate.length} mashguijim con sus rutas:\n${toCreate.map(p=>`• ${p.name}: ${p.places.join(", ")}`).join("\n")}\n\n¿Continuar?`)) return;

    // Build a name → address lookup from all existing stops
    const addrByName = {};
    Object.values(routes).flat().forEach(st => {
      const k = normalizeName(st.place);
      if (st.address && !addrByName[k]) addrByName[k] = st.address;
    });

    for (let i = 0; i < toCreate.length; i++) {
      const p = toCreate[i];
      const ref = doc(collection(db,"supervisors"));
      await setDoc(ref, {
        name: p.name, avatar: initials(p.name),
        color: COLORS[(4 + i) % COLORS.length],
        email: "", tier: "mashgiaj", createdAt: Date.now(),
      });
      for (let j = 0; j < p.places.length; j++) {
        await addDoc(collection(db,"supervisors",ref.id,"stops"), {
          place: p.places[j],
          address: addrByName[normalizeName(p.places[j])] || "",
          status: "pending", visits: [], alertSent: false, order: j,
        });
      }
      await logAdmin(p.name, "Creado como mashgiaj (setup)");
    }
    alert(`Listo. Se crearon ${toCreate.length} mashguijim.`);
  }

  // Generates and prints one QR per unique establishment across ALL routes
  // (supervisors + mashguijim), deduped by normalized name.
  async function printAllQRs() {
    const byName = {};
    Object.values(routes).flat().forEach(st => {
      const k = normalizeName(st.place);
      if (k && !byName[k]) byName[k] = st.place; // keep first display spelling
    });
    const names = Object.values(byName).sort((a,b)=>a.localeCompare(b));
    if (names.length === 0) { alert("No hay establecimientos con paradas todavía."); return; }

    const cards = await Promise.all(names.map(async place => {
      const url = estQrUrl(place);
      const img = await QRCode.toDataURL(url, { width: 380, margin: 2, errorCorrectionLevel: "M" });
      return { place, img };
    }));

    const w = window.open("", "_blank");
    if (!w) { alert("Permite ventanas emergentes para imprimir."); return; }

    // Paginate: fixed number of cards per page with a forced page break after
    // each page, so a card never gets split across two pages.
    const PER_PAGE = 6; // 2 columns × 3 rows fits comfortably on Letter/A4
    const cardHtml = c => `
      <div class="card">
        <div class="kicker">Kosher Shevet Ahim</div>
        <div class="place">${c.place}</div>
        <img src="${c.img}" alt="QR"/>
        <div class="hint">Escanea al llegar y al salir</div>
      </div>`;
    let pagesHtml = "";
    for (let i = 0; i < cards.length; i += PER_PAGE) {
      const group = cards.slice(i, i + PER_PAGE);
      const last = i + PER_PAGE >= cards.length;
      pagesHtml += `<div class="page"${last ? "" : ' style="page-break-after:always;"'}><div class="grid">${group.map(cardHtml).join("")}</div></div>`;
    }

    w.document.write(`
      <html><head><title>Códigos QR — ${names.length} establecimientos</title>
      <style>
        * { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; box-sizing:border-box; }
        @page { margin: 10mm; }
        body { margin:0; padding:0; }
        .page { padding: 4px; }
        .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
        .card { border:2px solid #1D4ED8; border-radius:16px; padding:14px 12px; text-align:center; break-inside:avoid; page-break-inside:avoid; }
        .kicker { font-size:10px; font-weight:700; color:#1D4ED8; text-transform:uppercase; letter-spacing:1.5px; }
        .place { font-size:18px; font-weight:800; color:#0F172A; margin:5px 0 8px; }
        img { width:185px; height:185px; }
        .hint { font-size:11px; color:#374151; margin-top:7px; }
      </style></head>
      <body>
        ${pagesHtml}
        <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 400); };<\/script>
      </body></html>`);
    w.document.close();
  }

  async function deleteSupervisor(id) {
    const sup = supervisors.find(s=>s.id===id);
    if (!confirm(`¿Eliminar a ${sup?.name} y todas sus paradas?`)) return;
    const stops = await getDocs(collection(db,"supervisors",id,"stops"));
    await Promise.all(stops.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(db,"supervisors",id));
    const usersSnap = await getDocs(query(collection(db,"users"), where("assignedSupId","==",id)));
    await Promise.all(usersSnap.docs.map(d => updateDoc(d.ref, { role:"pending", assignedSupId:"" })));
    await logAdmin(sup?.name||"—", "Eliminó supervisor");
    if (selectedSup===id) { setSelectedSup(null); setTab("dashboard"); }
  }

  // ── Stop CRUD ─────────────────────────────────────────────────────────────
  async function addStop() {
    if (!form.place?.trim()) return;
    const stops = routes[form.supId]||[];
    await addDoc(collection(db,"supervisors",form.supId,"stops"), {
      place: form.place.trim(), address:(form.address||"").trim(),
      status:"pending", visits:[], alertSent:false, order:stops.length,
    });
    await logAdmin(form.place.trim(), "Agregó parada");
    closeModal();
  }

  async function editStop() {
    await updateDoc(doc(db,"supervisors",form.supId,"stops",form.stopId), { place:form.place.trim(), address:(form.address||"").trim() });
    await logAdmin(form.place.trim(), "Editó parada");
    closeModal();
  }

  async function deleteStop(supId, stopId) {
    const stop = (routes[supId]||[]).find(s=>s.id===stopId);
    await deleteDoc(doc(db,"supervisors",supId,"stops",stopId));
    await logAdmin(stop?.place||"—", "Eliminó parada");
  }

  async function resetWeekManual(supId) {
    const sup = supervisors.find(s=>s.id===supId);
    if (!confirm(`¿Reiniciar manualmente la semana de ${sup?.name}? Se borran todos los check-ins.`)) return;
    const stops = routes[supId]||[];
    const batch = writeBatch(db);
    stops.forEach(s => batch.update(doc(db,"supervisors",supId,"stops",s.id), { status:"pending", visits:[], alertSent:false }));
    await batch.commit();
    await logAdmin(sup?.name||"—", "Reinició semana manualmente");
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async function approveUser(uid, supId) {
    const u = allUsers.find(x=>x.uid===uid);
    await updateDoc(doc(db,"users",uid), { role:"supervisor", assignedSupId:supId||"" });
    await logAdmin(u?.name||u?.email||"—", "Aprobó como supervisor");
  }
  async function approveAsAdmin(uid) {
    const u = allUsers.find(x=>x.uid===uid);
    await updateDoc(doc(db,"users",uid), { role:"admin", assignedSupId:"" });
    await logAdmin(u?.name||u?.email||"—", "Aprobó como admin");
  }
  async function rejectUser(uid) {
    const u = allUsers.find(x=>x.uid===uid);
    // Delete the document entirely so they vanish from the list immediately.
    // If they log in again, App.jsx recreates them as pending automatically.
    await deleteDoc(doc(db,"users",uid));
    await logAdmin(u?.name||u?.email||"—", "Rechazó solicitud");
  }
  async function removeUser(uid) {
    const u = allUsers.find(x=>x.uid===uid);
    await deleteDoc(doc(db,"users",uid));
    await logAdmin(u?.name||u?.email||"—", "Eliminó acceso de usuario");
  }
  async function resolveSuggestion(id) { await updateDoc(doc(db,"suggestions",id), { status:"resolved" }); }

  // ── Checklist editing ────────────────────────────────────────────────────
  async function saveGlobalChecklistEdit(newItems) {
    await saveGlobalChecklist(newItems);
    setChecklistItems(newItems);
    await logAdmin("Checklist general", "Editó el checklist general");
    setModal(null);
  }
  function openStopChecklistEditor(supId, stopId, place, customChecklist) {
    const initial = (customChecklist && customChecklist.length) ? customChecklist : checklistItems;
    setStopChecklistEditor({ supId, stopId, place, initial, isCustomized: !!(customChecklist && customChecklist.length) });
  }
  async function saveStopChecklist(newItems) {
    const { supId, stopId, place } = stopChecklistEditor;
    await updateDoc(doc(db,"supervisors",supId,"stops",stopId), { customChecklist:newItems });
    await logAdmin(place, "Personalizó el checklist de esta parada");
    setStopChecklistEditor(null);
  }
  async function revertStopChecklist() {
    const { supId, stopId, place } = stopChecklistEditor;
    await updateDoc(doc(db,"supervisors",supId,"stops",stopId), { customChecklist:[] });
    await logAdmin(place, "Quitó el checklist personalizado de esta parada");
    setStopChecklistEditor(null);
  }

  function openModal(type,data={}) { setModal(type); setForm(data); }
  function closeModal() { setModal(null); setForm({}); }

  // ── Derived ───────────────────────────────────────────────────────────────
  const sup = selectedSup ? supervisors.find(s=>s.id===selectedSup) : null;
  // Supervisors first, then mashguijim — keeps their org hierarchy visible.
  const tierRank = t => (t === "mashgiaj" ? 1 : 0);
  const displaySupervisors = [...supervisors].sort((a,b)=>tierRank(a.tier)-tierRank(b.tier));
  const MashChip = () => <span style={{ fontSize:9, fontWeight:700, color:C.purple, background:C.purpleLight||"#F5F3FF", borderRadius:5, padding:"1px 7px", textTransform:"uppercase", letterSpacing:.5 }}>Mashgiaj</span>;
  const pendingCount = allUsers.filter(u=>u.role==="pending").length;
  const adminList = allUsers.filter(u=>u.role==="admin");
  const supervisorUsers = allUsers.filter(u=>u.role==="supervisor");
  const pendingSugg = suggestions.filter(s=>s.status==="pending");

  const LS = { fontSize:12, color:C.muted, marginBottom:5, display:"block", fontWeight:500 };
  const IS = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 12px", fontSize:14, outline:"none", boxSizing:"border-box", marginBottom:12, color:C.text, background:"#fff" };

  const TABS = [
    { id:"dashboard", icon:"📊", label:"Panel" },
    { id:"settings",  icon:"⚙️", label:"Settings" },
    { id:"checklist", icon:"📋", label:"Checklist" },
    { id:"history",   icon:"📜", label:"Historial" },
    { id:"exports",   icon:"📤", label:"Exportar" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F4F6F9", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E4E9F0", padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 3px rgba(0,0,0,.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {selectedSup && tab==="dashboard" && (
            <button onClick={()=>setSelectedSup(null)} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"6px 10px", fontSize:13, border:"1px solid #E4E9F0", marginRight:4 }) }}>←</button>
          )}
          <LogoIcon size={32}/><LogoText/>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <button onClick={()=>setTab("users")} style={{ ...btn({ background:tab==="users"?C.primary:"#EFF6FF", color:tab==="users"?"#fff":C.primary, padding:"6px 11px", fontSize:12, position:"relative" }) }}>
            👥{pendingCount>0?` ${pendingCount}`:""}
            {pendingCount>0 && <span style={{ position:"absolute", top:-4, right:-4, width:8, height:8, borderRadius:"50%", background:"#DC2626" }}/>}
          </button>
          {alerts.length>0 && (
            <button onClick={()=>openModal("alerts")} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"6px 11px", fontSize:12 }) }}>🔔 {alerts.length}</button>
          )}
          <button onClick={()=>signOut(auth)} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"6px 12px", fontSize:12, border:"1px solid #E4E9F0" }) }}>Salir</button>
        </div>
      </div>

      <div style={{ padding:"14px 16px 90px", maxWidth:800, margin:"0 auto" }}>

        {/* ── DASHBOARD LIST (per-supervisor, no aggregate row) ── */}
        {tab==="dashboard" && !selectedSup && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>{weekRange()}</div>
            {supervisors.length===0 && <div style={{ textAlign:"center", color:C.muted, padding:48 }}>No hay supervisores. Ve a ⚙️ Settings.</div>}
            {displaySupervisors.map(s => {
              const p       = getProgress(s.id);
              const stops   = routes[s.id]||[];
              const inProg  = stops.find(x=>x.status==="in-progress");
              const hasAlert= alerts.some(a=>a.supId===s.id);
              return (
                <div key={s.id} onClick={()=>setSelectedSup(s.id)}
                  style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:10, border:`1px solid ${hasAlert?"#DC2626":"#E4E9F0"}`, cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,.06)", transition:"box-shadow .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.08)"}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.06)"}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:"#fff", flexShrink:0 }}>{s.avatar}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{s.name}</div>
                        {s.tier==="mashgiaj" && <MashChip/>}
                      </div>
                      <div style={{ fontSize:12, color:inProg?C.warning:C.muted, fontWeight:500, marginTop:2 }}>
                        {hasAlert?"🔴 Atraso detectado":inProg?`En: ${inProg.place}`:p.done===p.total&&p.total>0?"✅ Semana completa":`${p.done}/${p.total} completadas`}
                      </div>
                    </div>
                    <Ring pct={p.pct} color={s.color}/>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── DASHBOARD DETAIL ── */}
        {tab==="dashboard" && selectedSup && sup && (() => {
          const stops = routes[selectedSup]||[];
          const p = getProgress(selectedSup);

          const inProgressCards = [];
          const completedCards  = [];
          stops.forEach(stop => (stop.visits||[]).forEach((v,vi) => {
            if (v.status==="in-progress") inProgressCards.push({ stop, visit:v, vIdx:vi, total:(stop.visits||[]).length });
            if (v.status==="done")        completedCards.push({ stop, visit:v, vIdx:vi, total:(stop.visits||[]).length });
          }));
          // Sort completed chronologically by date then checkIn time
          completedCards.sort((a,b) => {
            const keyA = `${a.visit.date||"0000-00-00"} ${a.visit.checkIn||"00:00"}`;
            const keyB = `${b.visit.date||"0000-00-00"} ${b.visit.checkIn||"00:00"}`;
            return keyA.localeCompare(keyB);
          });
          const pendingList = stops.filter(s=>s.status==="pending");

          return (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                <div style={{ width:46, height:46, borderRadius:12, background:sup.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:"#fff" }}>{sup.avatar}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:17, fontWeight:800, color:C.text }}>{sup.name}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{weekRange()}</div>
                </div>
                <button onClick={()=>{ setTab("settings"); }} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"8px 12px", fontSize:13, border:"1px solid #E4E9F0" }) }}>⚙️ Settings</button>
                <button onClick={()=>resetWeekManual(selectedSup)} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"8px 10px", fontSize:13, border:"1px solid #E4E9F0" }) }}>🔄</button>
              </div>

              {/* Mini dashboard summary */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:18 }}>
                {[
                  { icon:"✅", val:completedCards.length, label:"Completadas", color:"#059669", bg:"#ECFDF5" },
                  { icon:"⏳", val:inProgressCards.length, label:"En curso",   color:"#D97706", bg:"#FFFBEB" },
                  { icon:"📋", val:pendingList.length,     label:"Pendientes", color:"#6B7280", bg:"#F4F6F9" },
                  { icon:"📊", val:p.pct+"%",              label:"Completado", color:sup.color, bg:sup.color+"18" },
                ].map(c => (
                  <div key={c.label} style={{ background:c.bg, borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
                    <div style={{ fontSize:16, marginBottom:2 }}>{c.icon}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:c.color, lineHeight:1 }}>{c.val}</div>
                    <div style={{ fontSize:9, color:c.color, fontWeight:600, marginTop:2, textTransform:"uppercase", letterSpacing:.4 }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {inProgressCards.length>0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, color:C.warning, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>En curso ({inProgressCards.length})</div>
                  {inProgressCards.map(({stop,visit,vIdx,total},i)=>(
                    <div key={i} style={{ background:"#fff", borderRadius:12, padding:"11px 14px", marginBottom:6, border:"1.5px solid #FDE68A", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, color:C.text, fontSize:13 }}>{stop.place}{total>1?` · Visita #${vIdx+1}`:""}</div>
                        <div style={{ fontSize:11, color:C.muted }}>Entrada {visit.checkIn||"—"}</div>
                      </div>
                      <Badge status="in-progress"/>
                    </div>
                  ))}
                </>
              )}

              {completedCards.length>0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, color:C.success, textTransform:"uppercase", letterSpacing:1, marginBottom:8, marginTop:inProgressCards.length?16:0 }}>Completadas ({completedCards.length}) · toca para ver el detalle</div>
                  {completedCards.map(({stop,visit,vIdx,total},i)=>(
                    <div key={i} onClick={()=>setDetailVisit({stop,visit,visitNum:vIdx+1,totalVisits:total})}
                      style={{ background:"#fff", borderRadius:12, padding:"11px 14px", marginBottom:6, border:"1.5px solid #6EE7B7", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, color:C.text, fontSize:13 }}>{stop.place}{total>1?` · Visita #${vIdx+1}`:""}</div>
                        <div style={{ fontSize:11, color:C.muted }}>{visit.date||"—"} · {visit.checkIn||"—"} - {visit.checkOut||"—"}</div>
                      </div>
                      <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                        {(visit.checkInEdited||visit.checkOutEdited) && <span style={{ fontSize:10, color:"#D97706", fontWeight:700, background:"#FEF3C7", borderRadius:5, padding:"1px 6px" }}>⚠️ editado</span>}
                        {visit.checklist?.some(c=>c.result==="issue") && <span style={{ fontSize:11, color:"#DC2626", fontWeight:600 }}>❌</span>}
                      </div>
                      <span style={{ fontSize:14, color:C.subtle }}>›</span>
                    </div>
                  ))}
                </>
              )}

              {pendingList.length>0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8, marginTop:16 }}>Pendientes ({pendingList.length})</div>
                  {pendingList.map(stop => (
                    <div key={stop.id} style={{ background:"#fff", borderRadius:12, padding:"10px 14px", marginBottom:6, border:"1px solid #E4E9F0", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:"#D1D5DB", flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, color:C.text, fontSize:13 }}>{stop.place}</div>
                        <div style={{ fontSize:11, color:C.muted }}>{stop.address}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {stops.length===0 && <div style={{ textAlign:"center", color:C.muted, padding:32 }}>Sin paradas asignadas todavía.</div>}
            </>
          );
        })()}

        {/* ── SETTINGS ── */}
        {tab==="settings" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
              <div style={{ fontSize:16, fontWeight:800, color:C.text }}>Equipo</div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>openModal("addSup",{tier:"supervisor"})} style={{ ...btn({ background:C.primary, color:"#fff", padding:"9px 14px", fontSize:13 }) }}>+ Supervisor</button>
                <button onClick={()=>openModal("addSup",{tier:"mashgiaj"})} style={{ ...btn({ background:C.purpleLight||"#F5F3FF", color:C.purple, padding:"9px 14px", fontSize:13 }) }}>+ Mashgiaj</button>
              </div>
            </div>
            {supervisors.filter(s=>s.tier==="mashgiaj").length===0 && (
              <button onClick={seedMashguijim} style={{ ...btn({ background:"#FFFBEB", color:"#D97706", padding:"11px 14px", fontSize:13, width:"100%", marginBottom:14, border:"1px solid #FDE68A" }) }}>
                ⚡ Crear los 4 mashguijim con sus rutas (Matti, Bernie, Dayan, Benzaquen)
              </button>
            )}
            {displaySupervisors.map(s => {
              const stops = routes[s.id]||[];
              return (
                <div key={s.id} style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:10, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, color:"#fff", fontSize:13 }}>{s.avatar}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <div style={{ fontWeight:700, color:C.text }}>{s.name}</div>
                        {s.tier==="mashgiaj" && <MashChip/>}
                      </div>
                      <div style={{ fontSize:11, color:C.muted }}>{stops.length} paradas · {s.email||"sin email"}</div>
                    </div>
                    <button onClick={()=>openModal("editSup",{id:s.id,name:s.name,color:s.color,email:s.email||"",tier:s.tier||"supervisor"})} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"7px 12px", fontSize:12, border:"1px solid #E4E9F0" }) }}>✎</button>
                    <button onClick={()=>deleteSupervisor(s.id)} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"7px 12px", fontSize:12 }) }}>🗑</button>
                  </div>
                  {stops.map((st,i) => (
                    <div key={st.id} style={{ display:"flex", alignItems:"center", gap:7, background:"#F4F6F9", borderRadius:8, padding:"6px 10px", marginBottom:3 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:STATUS[st.status]?.color||"#D1D5DB", flexShrink:0 }}/>
                      <span style={{ flex:1, fontSize:12, color:C.text, fontWeight:500 }}>{i+1}. {st.place}{st.customChecklist?.length>0&&<span style={{ color:C.primary }}> 📋</span>}</span>
                      <span style={{ fontSize:11, color:C.muted }}>{st.address}</span>
                      <button onClick={()=>setQrModal({ stop:st, supervisorName:s.name })} title="Código QR" style={{ ...btn({ background:"none", color:C.text, padding:"2px 6px", fontSize:13 }) }}>🔳</button>
                      <button onClick={()=>openStopChecklistEditor(s.id,st.id,st.place,st.customChecklist)} title="Checklist personalizado" style={{ ...btn({ background:"none", color:C.primary, padding:"2px 6px", fontSize:13 }) }}>📋</button>
                      <button onClick={()=>openModal("editStop",{supId:s.id,stopId:st.id,place:st.place,address:st.address})} style={{ ...btn({ background:"none", color:C.muted, padding:"2px 6px", fontSize:12 }) }}>✎</button>
                      <button onClick={()=>deleteStop(s.id,st.id)} style={{ ...btn({ background:"none", color:"#DC2626", padding:"2px 6px", fontSize:12 }) }}>🗑</button>
                    </div>
                  ))}
                  <button onClick={()=>openModal("addStop",{supId:s.id})} style={{ ...btn({ background:"#F4F6F9", color:C.muted, marginTop:8, width:"100%", padding:"7px", textAlign:"center", fontSize:12, border:"1px dashed #E4E9F0" }) }}>+ Agregar parada</button>
                </div>
              );
            })}
          </>
        )}

        {/* ── CHECKLIST (global) ── */}
        {tab==="checklist" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Checklist general</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>Estos son los ítems que los supervisores revisan en cada visita. Puedes editarlos, eliminarlos o agregar nuevos — los cambios se aplican de inmediato. Para un restaurante específico, usa el ícono 📋 en Settings.</div>
            <button onClick={()=>setModal("editGlobalChecklist")} style={{ ...btn({ background:C.primary, color:"#fff", padding:"12px 20px", fontSize:14, width:"100%", marginBottom:16 }) }}>✎ Editar checklist general</button>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {checklistItems.map(item => (
                <div key={item.id} style={{ background:"#fff", borderRadius:12, padding:"10px 14px", display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 2px rgba(0,0,0,.04)" }}>
                  <span style={{ fontSize:17 }}>{item.icon}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── USUARIOS ── */}
        {tab==="users" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Usuarios pendientes</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:14 }}>{pendingCount} esperando aprobación.</div>
            {allUsers.filter(u=>u.role==="pending").length===0
              ? <div style={{ textAlign:"center", color:C.muted, padding:24, fontSize:14 }}>No hay usuarios pendientes.</div>
              : allUsers.filter(u=>u.role==="pending").map(u => (
                <div key={u.uid} style={{ background:"#fff", borderRadius:14, padding:16, marginBottom:8, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <div style={{ width:40, height:40, borderRadius:"50%", background:"#E4E9F0", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:C.muted, fontSize:14 }}>{initials(u.name||u.email)}</div>
                    <div><div style={{ fontWeight:700, color:C.text }}>{u.name}</div><div style={{ fontSize:11, color:C.muted }}>{u.email}</div></div>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:8, fontWeight:600 }}>Aprobar como supervisor de:</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                    {displaySupervisors.map(s => <button key={s.id} onClick={()=>approveUser(u.uid,s.id)} style={{ ...btn({ background:s.color+"18", color:s.color, padding:"7px 14px", fontSize:13 }) }}>{s.name}</button>)}
                  </div>
                  <div style={{ borderTop:"1px solid #F1F5F9", paddingTop:10, display:"flex", gap:6 }}>
                    <button onClick={()=>approveAsAdmin(u.uid)} style={{ ...btn({ background:"#EFF6FF", color:C.primary, padding:"7px 14px", fontSize:13, fontWeight:700 }) }}>👑 Aprobar como Admin</button>
                    <button onClick={()=>rejectUser(u.uid)} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"7px 14px", fontSize:13 }) }}>✕ Rechazar</button>
                  </div>
                </div>
              ))}

            <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8, marginTop:24 }}>👑 Administradores autorizados</div>
            {adminList.length===0
              ? <div style={{ fontSize:13, color:C.subtle, marginBottom:8 }}>Solo tú (administrador principal).</div>
              : adminList.map(u => (
                <div key={u.uid} style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:6, boxShadow:"0 1px 3px rgba(0,0,0,.06)", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:C.primaryLight, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:C.primary, fontSize:13 }}>{initials(u.name||u.email)}</div>
                  <div style={{ flex:1 }}><div style={{ fontWeight:700, color:C.text, fontSize:13 }}>{u.name}</div><div style={{ fontSize:11, color:C.muted }}>{u.email}</div></div>
                  <button onClick={()=>{ if(confirm(`¿Quitar acceso de admin a ${u.name}?`)) removeUser(u.uid); }} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"6px 12px", fontSize:12 }) }}>Eliminar</button>
                </div>
              ))}

            <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8, marginTop:20 }}>👤 Supervisores activos</div>
            {supervisorUsers.length===0
              ? <div style={{ fontSize:13, color:C.subtle, marginBottom:8 }}>Ningún supervisor con acceso todavía.</div>
              : supervisorUsers.map(u => (
                <div key={u.uid} style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:6, boxShadow:"0 1px 3px rgba(0,0,0,.06)", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:C.success, fontSize:13 }}>{initials(u.name||u.email)}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, color:C.text, fontSize:13 }}>{u.name}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{u.email}{u.assignedSupId&&supervisors.find(s=>s.id===u.assignedSupId)&&` — ${supervisors.find(s=>s.id===u.assignedSupId).name}`}</div>
                  </div>
                  <button onClick={()=>{ if(confirm(`¿Eliminar acceso de ${u.name}?`)) removeUser(u.uid); }} style={{ ...btn({ background:"#FEF2F2", color:"#DC2626", padding:"6px 12px", fontSize:12 }) }}>Eliminar</button>
                </div>
              ))}

            {suggestions.length>0 && (
              <>
                <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4, marginTop:28 }}>💬 Sugerencias</div>
                <div style={{ fontSize:12, color:C.subtle, marginBottom:12 }}>Se eliminan automáticamente después de 30 días.</div>
                {suggestions.map(s => (
                  <div key={s.id} style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:8, boxShadow:"0 1px 3px rgba(0,0,0,.06)", opacity:s.status==="resolved"?.6:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:s.type==="Error"?"#DC2626":s.type==="Mejora"?C.primary:C.muted, background:s.type==="Error"?"#FEF2F2":s.type==="Mejora"?"#EFF6FF":"#F4F6F9", borderRadius:6, padding:"2px 8px" }}>
                        {s.type==="Error"?"🐛":s.type==="Mejora"?"💡":"💬"} {s.type}
                      </span>
                      <span style={{ fontSize:11, color:C.muted }}>{s.name}</span>
                      {s.dateLabel&&<span style={{ fontSize:11, color:C.subtle }}>· {s.dateLabel}</span>}
                      {s.status==="resolved"&&<span style={{ fontSize:11, color:"#059669", fontWeight:600 }}>✓ Resuelto</span>}
                    </div>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.5, marginBottom:s.status!=="resolved"?10:0 }}>{s.text}</div>
                    {s.status!=="resolved"&&<button onClick={()=>resolveSuggestion(s.id)} style={{ ...btn({ background:"#ECFDF5", color:"#059669", padding:"6px 14px", fontSize:12 }) }}>Marcar resuelto</button>}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ── HISTORIAL ── */}
        {tab==="history" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>Historial</div>
            {historyLog.length===0?<div style={{ textAlign:"center", color:C.muted, padding:40 }}>Sin actividad.</div>
              :<div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {historyLog.map((h,i) => (
                  <div key={i} style={{ background:"#fff", borderRadius:10, padding:"9px 13px", display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 2px rgba(0,0,0,.04)" }}>
                    <div style={{ fontSize:11, color:C.subtle, minWidth:36 }}>{h.time}</div>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:h.supColor||C.primary, flexShrink:0 }}/>
                    <div style={{ flex:1, fontSize:13 }}><span style={{ fontWeight:700, color:C.text }}>{h.supervisor}</span><span style={{ color:C.muted }}> → </span><span>{h.place}</span></div>
                    <span style={{ fontSize:11, color:C.muted, background:"#F4F6F9", borderRadius:6, padding:"2px 7px" }}>{h.action}</span>
                  </div>
                ))}
              </div>}
            {historyLog.length>0&&(
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Resumen semanal</div>
                {displaySupervisors.map(s => {const p=getProgress(s.id);const stops=routes[s.id]||[];return(
                  <div key={s.id} style={{ background:"#fff", borderRadius:12, padding:"12px 14px", marginBottom:6, boxShadow:"0 1px 2px rgba(0,0,0,.04)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <div style={{ fontWeight:700, color:C.text }}>{s.name}</div>
                      <div style={{ fontWeight:800, color:p.pct===100?"#059669":C.text }}>{p.pct}%</div>
                    </div>
                    <div style={{ display:"flex", gap:8, fontSize:11, flexWrap:"wrap" }}>
                      {Object.entries(STATUS).map(([key,cfg])=>{const count=stops.filter(st=>st.status===key).length;return count?<span key={key} style={{ color:cfg.color, fontWeight:500 }}>{cfg.label}: <strong>{count}</strong></span>:null;})}
                    </div>
                  </div>
                );})}
              </div>
            )}
          </>
        )}

        {/* ── EXPORTAR ── */}
        {tab==="exports" && (
          <>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Códigos QR</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>Un QR por establecimiento. Imprímelos todos de una vez y pégalos en cada local.</div>
            <button onClick={printAllQRs}
              style={{ ...btn({ background:C.primary, color:"#fff", padding:"16px 18px", fontSize:14, textAlign:"left", display:"flex", alignItems:"center", gap:12, width:"100%", marginBottom:24 }) }}>
              <span style={{ fontSize:24 }}>🔳</span>
              <div><div style={{ fontWeight:700 }}>Imprimir todos los QR</div><div style={{ fontSize:12, color:"rgba(255,255,255,.8)", fontWeight:400, marginTop:2 }}>Uno por cada establecimiento, listos para imprimir</div></div>
            </button>

            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:14 }}>Exportar datos</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
              <button onClick={()=>exportCSV(supervisors,routes)}
                style={{ ...btn({ background:"#fff", color:C.text, padding:"16px 18px", fontSize:14, boxShadow:"0 1px 3px rgba(0,0,0,.06)", textAlign:"left", display:"flex", alignItems:"center", gap:12, width:"100%" }) }}>
                <span style={{ fontSize:24 }}>📊</span>
                <div><div style={{ fontWeight:700 }}>Exportar CSV (semana actual)</div><div style={{ fontSize:12, color:C.muted, fontWeight:400, marginTop:2 }}>Compatible con Excel</div></div>
              </button>
              <button onClick={()=>downloadText(`KosherShevet_${dateStr().replace(/\//g,"-")}.txt`, buildWeeklyReportText(supervisors, routes, weekRange()))}
                style={{ ...btn({ background:"#fff", color:C.text, padding:"16px 18px", fontSize:14, boxShadow:"0 1px 3px rgba(0,0,0,.06)", textAlign:"left", display:"flex", alignItems:"center", gap:12, width:"100%" }) }}>
                <span style={{ fontSize:24 }}>📄</span>
                <div><div style={{ fontWeight:700 }}>Exportar TXT (semana actual)</div><div style={{ fontSize:12, color:C.muted, fontWeight:400, marginTop:2 }}>Reporte legible para compartir</div></div>
              </button>
            </div>

            <div style={{ fontSize:14, fontWeight:800, color:C.text, marginBottom:4 }}>Reportes semanales guardados</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>Se generan solos cada sábado a las 11:59 PM.</div>
            {reports.length===0
              ? <div style={{ textAlign:"center", color:C.muted, padding:24, fontSize:13 }}>Aún no se ha generado ningún reporte automático.</div>
              : reports.map(r => (
                <div key={r.id} style={{ background:"#fff", borderRadius:12, padding:"12px 16px", marginBottom:8, boxShadow:"0 1px 3px rgba(0,0,0,.06)", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, color:C.text, fontSize:13 }}>Semana {r.weekRange}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{new Date(r.generatedAt).toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"})}</div>
                  </div>
                  <button onClick={()=>downloadText(`KosherShevet_${r.weekRange.replace(/\//g,"-").replace(/\s/g,"")}.txt`, r.text)}
                    style={{ ...btn({ background:C.primaryLight, color:C.primary, padding:"7px 14px", fontSize:12 }) }}>
                    ⬇ Descargar
                  </button>
                </div>
              ))}
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #E4E9F0", display:"flex", zIndex:50, boxShadow:"0 -2px 12px rgba(0,0,0,.06)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>{ setTab(t.id); setSelectedSup(null); }}
            style={{ ...btn({ flex:1, padding:"8px 2px", background:"none", color:tab===t.id?C.primary:C.muted, fontSize:8.5, display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRadius:0, borderTop:tab===t.id?`2px solid ${C.primary}`:"2px solid transparent", fontWeight:tab===t.id?700:500, position:"relative" }) }}>
            <span style={{ fontSize:16 }}>{t.icon}</span>
            {t.label}
            {t.badge>0&&<span style={{ position:"absolute", top:3, right:"50%", transform:"translateX(11px)", background:"#DC2626", color:"#fff", borderRadius:"50%", width:13, height:13, fontSize:8, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── Standard modals (add/edit supervisor, add/edit stop) ── */}
      {modal && !["alerts","editGlobalChecklist"].includes(modal) && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:200 }} onClick={closeModal}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>

            {(modal==="addSup"||modal==="editSup") && <>
              <div style={{ fontWeight:800, color:C.text, fontSize:16, marginBottom:14 }}>{modal==="addSup"?(form.tier==="mashgiaj"?"Nuevo mashgiaj":"Nuevo supervisor"):"Editar"}</div>
              <label style={LS}>Rol</label>
              <div style={{ display:"flex", gap:7, marginBottom:12 }}>
                {[["supervisor","Supervisor"],["mashgiaj","Mashgiaj"]].map(([val,lbl])=>(
                  <button key={val} onClick={()=>setForm(p=>({...p,tier:val}))}
                    style={{ ...btn({ flex:1, padding:"9px 4px", fontSize:13, background:(form.tier||"supervisor")===val?(val==="mashgiaj"?C.purple:C.primary):"#F4F6F9", color:(form.tier||"supervisor")===val?"#fff":C.muted, border:`1.5px solid ${(form.tier||"supervisor")===val?(val==="mashgiaj"?C.purple:C.primary):"#E4E9F0"}` }) }}>
                    {lbl}
                  </button>
                ))}
              </div>
              <label style={LS}>Nombre</label>
              <input value={form.name||""} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej: Ana García" style={IS}/>
              <label style={LS}>Email (opcional)</label>
              <input value={form.email||""} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="supervisor@email.com" style={IS}/>
              <label style={LS}>Color</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                {COLORS.map(c=><div key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer", border:form.color===c?"3px solid #0F172A":"3px solid transparent" }}/>)}
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={closeModal} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"10px 18px", border:"1px solid #E4E9F0" }) }}>Cancelar</button>
                <button onClick={modal==="addSup"?addSupervisor:editSupervisor} style={{ ...btn({ background:C.primary, color:"#fff", padding:"10px 18px" }) }}>{modal==="addSup"?"Agregar":"Guardar"}</button>
              </div>
            </>}

            {(modal==="addStop"||modal==="editStop") && <>
              <div style={{ fontWeight:800, color:C.text, fontSize:16, marginBottom:14 }}>{modal==="addStop"?"Nueva parada":"Editar parada"}</div>
              <label style={LS}>Nombre del lugar</label>
              <input value={form.place||""} onChange={e=>setForm(p=>({...p,place:e.target.value}))} placeholder="Ej: Restaurante Kosher" style={IS}/>
              <label style={LS}>Dirección</label>
              <input value={form.address||""} onChange={e=>setForm(p=>({...p,address:e.target.value}))} placeholder="Ej: Av. Principal 100" style={IS}/>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={closeModal} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"10px 18px", border:"1px solid #E4E9F0" }) }}>Cancelar</button>
                <button onClick={modal==="addStop"?addStop:editStop} style={{ ...btn({ background:C.primary, color:"#fff", padding:"10px 18px" }) }}>{modal==="addStop"?"Agregar":"Guardar"}</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {modal==="alerts" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:200 }} onClick={closeModal}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:800, color:"#DC2626", fontSize:16, marginBottom:12 }}>🔔 Alertas activas</div>
            {alerts.map((a,i)=>(
              <div key={i} style={{ background:"#FEF2F2", borderRadius:10, padding:"10px 14px", marginBottom:8 }}>
                <div style={{ fontWeight:700, color:C.text }}>{a.supName}</div>
                <div style={{ fontSize:12, color:"#DC2626", marginTop:2 }}>{a.place} — lleva +{a.minutes} min en curso</div>
              </div>
            ))}
            <button onClick={()=>{ setAlerts([]); closeModal(); }} style={{ ...btn({ background:"#F4F6F9", color:C.muted, padding:"11px", width:"100%", marginTop:8, border:"1px solid #E4E9F0" }) }}>Limpiar</button>
          </div>
        </div>
      )}

      {modal==="editGlobalChecklist" && (
        <ChecklistEditorModal
          title="Checklist general"
          items={checklistItems}
          onSave={saveGlobalChecklistEdit}
          onCancel={()=>setModal(null)}
        />
      )}

      {stopChecklistEditor && (
        <ChecklistEditorModal
          title={`Checklist: ${stopChecklistEditor.place}`}
          items={stopChecklistEditor.initial}
          onSave={saveStopChecklist}
          onCancel={()=>setStopChecklistEditor(null)}
          extraAction={stopChecklistEditor.isCustomized ? { label:"↩ Usar el checklist general (quitar personalización)", onClick:revertStopChecklist } : null}
        />
      )}

      {detailVisit && (
        <VisitDetailModal
          stop={detailVisit.stop}
          visit={detailVisit.visit}
          visitNum={detailVisit.visitNum}
          totalVisits={detailVisit.totalVisits}
          onClose={()=>setDetailVisit(null)}
        />
      )}

      {qrModal && (
        <QRCodeModal
          stop={qrModal.stop}
          supervisorName={qrModal.supervisorName}
          onClose={()=>setQrModal(null)}
        />
      )}

      {scanInfo && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:450, padding:20 }} onClick={()=>setScanInfo(null)}>
          <div style={{ background:"#fff", borderRadius:18, padding:24, width:"100%", maxWidth:360, textAlign:"center" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:34, marginBottom:8 }}>{scanInfo.ok ? "✅" : "⚠️"}</div>
            {scanInfo.ok ? (
              <>
                <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>QR válido</div>
                <div style={{ fontSize:14, color:C.text, marginBottom:2 }}>{scanInfo.place}</div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>En la ruta de: {scanInfo.who && scanInfo.who.length ? scanInfo.who.join(", ") : "—"}</div>
                <div style={{ fontSize:12, color:C.muted, background:"#F8FAFC", borderRadius:10, padding:"10px 12px", lineHeight:1.5 }}>
                  El pipeline funciona. Iniciaste sesión como <b>admin</b>, así que esto no registra entrada/salida. Como <b>supervisor</b>, este escaneo registraría el horario automáticamente.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:8 }}>QR no reconocido</div>
                <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>El código no corresponde a ninguna parada registrada.</div>
              </>
            )}
            <button onClick={()=>setScanInfo(null)} style={{ ...btn({ background:C.primary, color:"#fff", padding:"11px", width:"100%", fontSize:14, marginTop:16 }) }}>Entendido</button>
          </div>
        </div>
      )}
    </div>
  );
}
