import { C } from "./constants";

// Real Shevet kosher certification logo (crown + K + כשר), served from /public/logo.png
export function LogoIcon({ size = 32, rounded = true }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: rounded ? Math.round(size*0.22) : 0,
      overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#fff",
      boxShadow: "0 1px 4px rgba(0,0,0,.12)",
    }}>
      <img src="/logo.png" alt="Shevet Kosher" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
    </div>
  );
}

export function LogoText() {
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:C.primary, textTransform:"uppercase", letterSpacing:1.2, lineHeight:1 }}>
        Kosher Shevet Ahim
      </div>
      <div style={{ fontSize:13, fontWeight:700, color:C.text, lineHeight:1.3, marginTop:2 }}>
        Gestión de Rutas
      </div>
    </div>
  );
}
