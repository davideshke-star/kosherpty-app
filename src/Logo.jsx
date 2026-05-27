import { C } from "./constants";

export function LogoIcon({ size = 32 }) {
  const r = Math.round(size * 0.25);
  const ic = Math.round(size * 0.52);
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      background: "linear-gradient(135deg,#1D4ED8,#1E40AF)",
      borderRadius: r,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 8px rgba(29,78,216,.28)"
    }}>
      <svg width={ic} height={ic} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
          fill="rgba(255,255,255,0.18)" stroke="white" strokeWidth="1.4"/>
        <circle cx="12" cy="9" r="2.6" fill="white"/>
      </svg>
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
