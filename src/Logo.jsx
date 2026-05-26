import { C } from "./constants";

// Professional location pin SVG — no emoji, no red dot
export function LogoIcon({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size,
      background: "linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)",
      borderRadius: size * 0.24,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      boxShadow: "0 2px 8px rgba(29,78,216,.25)"
    }}>
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white" opacity="0.15"/>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="white" strokeWidth="1.5" fill="none"/>
        <circle cx="12" cy="9" r="2.5" fill="white"/>
      </svg>
    </div>
  );
}

export function LogoText({ subtitle = true }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: 1.2, lineHeight: 1 }}>
        Kosher Shevet Ahim
      </div>
      {subtitle && (
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.2, marginTop: 2 }}>
          Gestión de Rutas
        </div>
      )}
    </div>
  );
}
