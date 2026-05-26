import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { APP_NAME, APP_SUB, C, btn } from "./constants";

// Clean icon — no emoji, no red dot
function AppIcon({ size = 60 }) {
  return (
    <div style={{ width: size, height: size, background: C.primary, borderRadius: size * 0.27, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 24px ${C.primary}44`, margin: "0 auto" }}>
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="11" r="5" fill="white" opacity="0.95"/>
        <path d="M14 28 C14 28 4 18 4 11 C4 5.477 8.477 1 14 1 C19.523 1 24 5.477 24 11 C24 18 14 28 14 28Z" stroke="white" strokeWidth="2.2" fill="none" opacity="0.7"/>
      </svg>
    </div>
  );
}

export default function Login() {
  const login = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { alert("Error al iniciar sesión: " + e.message); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <AppIcon size={60} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: 1.5, marginTop: 14, marginBottom: 5 }}>{APP_NAME}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-.5px" }}>{APP_SUB}</div>
        </div>

        <div style={{ background: C.surface, borderRadius: 20, padding: "28px 28px 24px", boxShadow: C.shadowMd }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Iniciar sesión</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 22, lineHeight: 1.5 }}>Accede al sistema de supervisión de rutas.</div>

          <button onClick={login}
            style={{ ...btn({ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: C.surface, border: `1.5px solid ${C.border}`, padding: "13px 20px", fontSize: 14, color: C.text, boxShadow: C.shadow }) }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = C.shadowMd}
            onMouseLeave={e => e.currentTarget.style.boxShadow = C.shadow}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continuar con Google
          </button>
          <p style={{ fontSize: 12, color: C.subtle, textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>Solo usuarios autorizados pueden acceder.</p>
        </div>
      </div>
    </div>
  );
}
