import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { C, btn, APP_URL } from "./constants";

// Shows a printable QR for one establishment. Scanning it opens the live app
// with ?scan=<stopId>, which records the supervisor's entry/exit automatically.
export default function QRCodeModal({ stop, supervisorName, onClose }) {
  const [dataUrl, setDataUrl] = useState("");
  const scanUrl = `${APP_URL}/?scan=${stop.id}`;

  useEffect(() => {
    QRCode.toDataURL(scanUrl, { width: 520, margin: 2, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [scanUrl]);

  function printQR() {
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) { alert("Permite ventanas emergentes para imprimir."); return; }
    w.document.write(`
      <html><head><title>QR — ${stop.place}</title>
      <style>
        * { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; }
        body { margin:0; padding:48px 32px; text-align:center; }
        .card { border:2px solid #1D4ED8; border-radius:24px; padding:36px 28px; max-width:420px; margin:0 auto; }
        .kicker { font-size:13px; font-weight:700; color:#1D4ED8; text-transform:uppercase; letter-spacing:2px; }
        .place { font-size:30px; font-weight:800; color:#0F172A; margin:10px 0 4px; }
        .addr  { font-size:15px; color:#6B7280; margin-bottom:24px; }
        img    { width:300px; height:300px; }
        .hint  { font-size:14px; color:#374151; margin-top:22px; line-height:1.5; }
        .sup   { font-size:12px; color:#9CA3AF; margin-top:16px; }
      </style></head>
      <body>
        <div class="card">
          <div class="kicker">Kosher Shevet Ahim</div>
          <div class="place">${stop.place}</div>
          <div class="addr">${stop.address || ""}</div>
          <img src="${dataUrl}" alt="QR"/>
          <div class="hint">Escanea este código con la cámara del teléfono<br/>al <b>llegar</b> y al <b>salir</b> del local.</div>
          <div class="sup">Ruta: ${supervisorName || "—"}</div>
        </div>
        <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
      </body></html>`);
    w.document.close();
  }

  function downloadQR() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `QR_${stop.place.replace(/[^a-z0-9]+/gi,"_")}.png`;
    a.click();
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:450, padding:20 }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:20, padding:24, width:"100%", maxWidth:380, textAlign:"center" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
          <div style={{ fontSize:15, fontWeight:800, color:C.text }}>Código QR</div>
          <button onClick={onClose} style={{ background:"#F4F6F9", border:"none", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:600, color:C.muted, cursor:"pointer" }}>Cerrar</button>
        </div>
        <div style={{ fontSize:17, fontWeight:800, color:C.text, marginTop:8 }}>{stop.place}</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>{stop.address}</div>

        <div style={{ background:"#F8FAFC", borderRadius:16, padding:18, display:"flex", alignItems:"center", justifyContent:"center", minHeight:240 }}>
          {dataUrl
            ? <img src={dataUrl} alt="QR" style={{ width:210, height:210 }}/>
            : <div style={{ color:C.subtle, fontSize:13 }}>Generando…</div>}
        </div>

        <div style={{ fontSize:12, color:C.muted, margin:"14px 0 16px", lineHeight:1.5 }}>
          Imprímelo y pégalo en el local. El supervisor lo escanea al llegar y al salir para registrar su horario.
        </div>

        <div style={{ display:"flex", gap:8 }}>
          <button onClick={printQR} disabled={!dataUrl} style={{ ...btn({ flex:1, background:C.primary, color:"#fff", padding:"11px", fontSize:14 }) }}>🖨 Imprimir</button>
          <button onClick={downloadQR} disabled={!dataUrl} style={{ ...btn({ flex:1, background:C.primaryLight, color:C.primary, padding:"11px", fontSize:14 }) }}>⬇ Descargar</button>
        </div>
      </div>
    </div>
  );
}
